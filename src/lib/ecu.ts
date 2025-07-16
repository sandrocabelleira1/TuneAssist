// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData, AxisDataState } from './types';

/**
 * Finds a DIRECT child element in a case-insensitive manner using tag and optional attribute selectors.
 * This function is NOT recursive.
 * @param parent The element to search within.
 * @param selectors The possible selectors, e.g., 'math', 'XDFAXIS[id="z"]'.
 * @returns The found element or null.
 */
function findNode(parent: Element | null, ...selectors: string[]): Element | null {
    if (!parent) return null;

    for (const selector of selectors) {
        // Regex to handle 'tag' or 'tag[attr="value"]'
        const match = selector.match(/^([a-zA-Z0-9_:]+)(?:\[([a-zA-Z_:]+)="(.+?)"\])?$/);
        
        if (match) {
            const [, tagName, attrName, attrValue] = match;
            const lowerTagName = tagName.toLowerCase();
            
            for (const child of Array.from(parent.children)) {
                if (child.tagName.toLowerCase() === lowerTagName) {
                    if (attrName && attrValue) { // Attribute selector part
                        const val = getAttr(child, attrName);
                        if (val && val.toLowerCase() === attrValue.toLowerCase()) {
                            return child;
                        }
                    } else { // Simple tag name match
                        return child;
                    }
                }
            }
        } else {
             // Fallback for simple tag names if regex fails, just in case.
            for (const child of Array.from(parent.children)) {
                if (child.tagName.toLowerCase() === selector.toLowerCase()) {
                    return child;
                }
            }
        }
    }
    return null;
}


/**
 * Finds ALL DIRECT child elements in a case-insensitive manner using a simple tag selector.
 * This function is NOT recursive.
 * @param parent The element to search within.
 * @param tagName The tag name to look for (e.g., 'label').
 * @returns An array of found elements.
 */
function findNodes(parent: Element | null, tagName: string): Element[] {
    if (!parent) return [];
    const lowerTagName = tagName.toLowerCase();
    const results: Element[] = [];
    for (const child of Array.from(parent.children)) {
        if (child.tagName.toLowerCase() === lowerTagName) {
            results.push(child);
        }
    }
    return results;
}


/**
 * Gets an attribute from an element in a case-insensitive manner.
 * @param element The element to get the attribute from.
 * @param names The possible names of the attribute.
 * @returns The attribute value or null if not found.
 */
function getAttr(element: Element | null, ...names: string[]): string | null {
    if (!element) return null;
    for (const name of names) {
        const lowerName = name.toLowerCase();
        for (const attr of Array.from(element.attributes)) {
            if (attr.name.toLowerCase() === lowerName) {
                return attr.value;
            }
        }
    }
    return null;
}

/**
 * Parses an axis definition from an <XDFAXIS> node. Handles direct definitions,
 * static labels, and linked axes.
 * @param axisNode The <XDFAXIS> element to parse.
 * @param tableMap A map of all tables in the XDF, keyed by their uniqueid, for resolving links.
 * @returns An AxisDefinition object or null if parsing fails.
 */
function parseAxis(axisNode: Element | null, tableMap: Map<string, Element>): AxisDefinition {
    if (!axisNode) return null;

    // --- Resolve Linked Axis First (embedinfo type="3") ---
    const embedInfoNode = findNode(axisNode, 'embedinfo', 'EMBEDINFO');
    const embedType = getAttr(embedInfoNode, 'type');
    const localEquation = getAttr(findNode(axisNode, 'math', 'MATH'), 'equation');
    const localLabel = (findNode(axisNode, 'units', 'UNITS')?.textContent || findNode(axisNode, 'title', 'TITLE')?.textContent || '').trim();

    if (embedType === '3' && embedInfoNode) {
        const linkId = getAttr(embedInfoNode, 'linkobjid');
        const linkedTableNode = linkId ? tableMap.get(linkId) : null;

        if (linkedTableNode) {
            // A linked axis in XDFs often points to a "breakpoint" table. The actual axis data is the Z-axis of that breakpoint table.
            const linkedZAxisNode = findNode(linkedTableNode, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]', 'zaxis');
            if (linkedZAxisNode) {
                // Recursively parse the linked axis, which is the Z-axis of another table
                const linkedAxisDef = parseAxis(linkedZAxisNode, tableMap); 
                if (linkedAxisDef) {
                    return {
                        ...linkedAxisDef,
                        // Override the linked axis's equation if a local one is defined
                        equation: localEquation && localEquation.toUpperCase() !== 'X' ? localEquation : linkedAxisDef.equation,
                        // Override label if a local one is present
                        label: localLabel || linkedAxisDef.label,
                        // Use the count from the current axis definition if it exists
                        count: parseInt(findNode(axisNode, 'indexcount', 'INDEXCOUNT')?.textContent || '0', 10) || linkedAxisDef.count,
                    };
                }
            }
        }
        console.warn(`Falha ao resolver o eixo ligado com linkobjid="${linkId}".`);
        return null;
    }

    const localCount = parseInt(findNode(axisNode, 'indexcount', 'INDEXCOUNT')?.textContent || '0', 10);
    const localMathNode = findNode(axisNode, 'math', 'MATH');
    const equation = getAttr(localMathNode, 'equation', 'Equation') || 'X';
    const localEquationVar = getAttr(findNode(localMathNode, 'var', 'VAR'), 'id') || 'X';

    // --- Case 2: Static Labels ---
    const labelNodes = findNodes(axisNode, 'label');
    if (labelNodes.length > 0) {
        const labels = Array.from(labelNodes).map(l => getAttr(l, 'value') || '');
        const staticLabels = labels.map(l => {
            if (l === "") return ""; // Keep empty labels as they are
            const num = parseFloat(l);
            return isNaN(num) ? l.trim() : num;
        });
        const finalCount = localCount > 0 ? localCount : labels.length;
        return {
            staticLabels,
            count: finalCount,
            label: localLabel,
            address: null,
            dataSize: 1,
            isBigEndian: false,
            equation: 'X',
            equationVar: 'X',
            minorStride: 0,
            majorStride: 0,
        };
    }

    // --- Case 3: Data stored in BIN file (most common case for non-linked axes) ---
    const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    if (!embeddedData) return null; // Should not happen if not a link or static
    
    const addrStr = getAttr(embeddedData, 'mmedaddress', 'address');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    
    // For Z-axes being used as sources for links, they define row/col counts.
    const rowCountAttr = getAttr(axisNode, 'mmedrowcount') || getAttr(embeddedData, 'mmedrowcount');
    const colCountAttr = getAttr(axisNode, 'mmedcolcount') || getAttr(embeddedData, 'mmedcolcount');
    const rowCount = parseInt(rowCountAttr || '0', 10);
    const colCount = parseInt(colCountAttr || '0', 10);
    const axisCountFromZ = colCount > 1 ? colCount : rowCount; // Prefer columns for 1D arrays
    const finalCount = localCount > 0 ? localCount : axisCountFromZ;

    const dataSizeBitsStr = getAttr(embeddedData, 'mmedelementsizebits', 'datasize');
    const dataSize = parseInt(dataSizeBitsStr || '8', 10) / 8;

    const isBigEndian = getAttr(embeddedData, 'bigendian')?.toLowerCase() === 'true' || getAttr(embeddedData, 'bigendian') === '1';

    const minorStrideBitsRaw = getAttr(embeddedData, 'mmedminorstridebits');
    const minorStride = minorStrideBitsRaw ? parseInt(minorStrideBitsRaw, 10) / 8 : 0;
    
    const majorStrideBitsRaw = getAttr(embeddedData, 'mmedmajorstridebits');
    const majorStride = majorStrideBitsRaw ? parseInt(majorStrideBitsRaw, 10) / 8 : 0;

    return {
        address: addr,
        count: finalCount,
        dataSize,
        isBigEndian,
        equation: equation,
        equationVar: localEquationVar,
        label: localLabel,
        majorStride,
        minorStride,
    };
}


/**
 * Finds the main <math> node for the Z-axis data. This is more robust than a simple find.
 * @param tableNode The main table element.
 * @param zAxisNode The Z-axis element.
 * @returns The main math node, or null if not found.
 */
function findMainMathNode(tableNode: Element, zAxisNode: Element): Element | null {
    // Priority 1: A <math> node that is a DIRECT child of the Z-axis definition. This is the most specific.
    const zMath = findNode(zAxisNode, 'math', 'MATH');
    if (zMath) {
        return zMath;
    }

    // Priority 2: A <math> node that is a DIRECT child of the TABLE definition. This is a common pattern.
    const tableMath = findNode(tableNode, 'math', 'MATH');
    if (tableMath) {
        return tableMath;
    }
    
    // As a last resort, check for a math node that isn't attached to X or Y axis (less common, but possible).
    const allMathNodes = findNodes(tableNode, 'math');
    const xAxisNode = findNode(tableNode, `XDFAXIS[id="x"]`, `XDFAXIS[id="X"]`, `xaxis`);
    const yAxisNode = findNode(tableNode, `XDFAXIS[id="y"]`, `XDFAXIS[id="Y"]`, `yaxis`);

    for (const mathNode of allMathNodes) {
        let isAxisMath = false;
        if (xAxisNode && xAxisNode.contains(mathNode)) isAxisMath = true;
        if (yAxisNode && yAxisNode.contains(mathNode)) isAxisMath = true;
        
        if (!isAxisMath) return mathNode; // Found a math node not belonging to X/Y axes.
    }
    
    return null;
}


export function parseXDF(xmlString: string): XDFDefinition[] {
    if (typeof DOMParser === 'undefined') {
        return [];
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Erro de análise XML: O ficheiro XDF parece estar corrompido ou mal formatado.');
    }

    const isNestedInTable = (element: Element | null): boolean => {
        let parent = element?.parentElement;
        while (parent) {
            const parentTagName = parent.tagName.toLowerCase();
            if (parentTagName === 'xdftable' || parentTagName === 'table') {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    };

    const allElements = xmlDoc.getElementsByTagName('*');
    const xdfTables: Element[] = [];
    for (const el of Array.from(allElements)) {
        const tagName = el.tagName.toLowerCase();
        if ((tagName === 'xdftable' || tagName === 'table') && !isNestedInTable(el)) {
            xdfTables.push(el);
        }
    }

    if (xdfTables.length === 0) {
        throw new Error('Nenhuma definição de <XDFTABLE> ou <table> foi encontrada no ficheiro.');
    }

    const tableMap = new Map<string, Element>();
    xdfTables.forEach(table => {
        const uniqueid = getAttr(table, 'uniqueid');
        if (uniqueid && uniqueid !== '0x0' && uniqueid !== '0') {
            tableMap.set(uniqueid, table);
        }
    });

    const definitions: XDFDefinition[] = [];
    const nameCounts: Record<string, number> = {};

    for (const table of xdfTables) {
        const originalName = findNode(table, 'title', 'TITLE')?.textContent || getAttr(table, 'name') || 'Tabela Sem Nome';

        try {
            if (originalName === 'Tabela Sem Nome') continue;

            const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]', 'zaxis');
            if (!zAxisNode) {
                console.warn(`A tabela "${originalName}" foi ignorada: não foi possível encontrar a definição do eixo Z.`);
                continue;
            }

            const zEmbeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            if (!zEmbeddedData) {
                console.warn(`A tabela "${originalName}" foi ignorada: o eixo Z não tem <embeddeddata>.`);
                continue;
            }

            const zAddressStr = getAttr(zEmbeddedData, 'mmedaddress');
            const zAddress = zAddressStr ? parseInt(zAddressStr, 16) : null;
            if (zAddress === null || isNaN(zAddress)) {
                console.warn(`A tabela "${originalName}" foi ignorada: não foi possível determinar o endereço do mapa principal (eixo Z).`);
                continue;
            }
            
            const dataSize = parseInt(getAttr(zEmbeddedData, 'mmedelementsizebits') || '8') / 8;
            const isBigEndian = getAttr(zEmbeddedData, 'bigendian')?.toLowerCase() === 'true' || getAttr(zEmbeddedData, 'bigendian') === '1';

            let yAxisDef = parseAxis(findNode(table, 'XDFAXIS[id="y"]', 'XDFAXIS[id="Y"]', 'yaxis'), tableMap);
            let xAxisDef = parseAxis(findNode(table, 'XDFAXIS[id="x"]', 'XDFAXIS[id="X"]', 'xaxis'), tableMap);

            if (!yAxisDef || !xAxisDef) {
                console.warn(`A tabela "${originalName}" foi ignorada: definições de eixo X ou Y em falta ou inválidas.`);
                continue;
            }

            const isTransposed = getAttr(findNode(zAxisNode, 'embedinfo'), 'type') === '2';
            let initialRows = parseInt(getAttr(zEmbeddedData, 'mmedrowcount') || '0') || yAxisDef.count;
            let initialCols = parseInt(getAttr(zEmbeddedData, 'mmedcolcount') || '0') || xAxisDef.count;
            
            if (initialRows === 0 || initialCols === 0) {
                 console.warn(`A tabela "${originalName}" foi ignorada: dimensões do eixo Z inválidas (linhas ou colunas são 0).`);
                 continue;
            }

            if (isTransposed) {
                [initialRows, initialCols] = [initialCols, initialRows];
                [yAxisDef, xAxisDef] = [xAxisDef, yAxisDef];
            }
            
            const finalRows = initialRows;
            const finalCols = initialCols;
            yAxisDef.count = finalRows;
            xAxisDef.count = finalCols;
            
            const minorStrideBitsRaw = getAttr(zEmbeddedData, 'mmedminorstridebits');
            const minorStride = minorStrideBitsRaw ? parseInt(minorStrideBitsRaw, 10) / 8 : 0;
            
            const majorStrideBitsRaw = getAttr(zEmbeddedData, 'mmedmajorstridebits');
            const majorStride = majorStrideBitsRaw ? parseInt(majorStrideBitsRaw, 10) / 8 : 0;
            
            const mathNode = findMainMathNode(table, zAxisNode);
            const equation = getAttr(mathNode, 'equation', 'Equation') || 'X';
            const varNode = mathNode ? findNode(mathNode, 'var', 'VAR') : findNode(zAxisNode, 'var', 'VAR');
            const equationVar = getAttr(varNode, 'id') || 'X';

            let tableName = originalName;
            if (nameCounts[originalName]) {
                nameCounts[originalName]++;
                tableName = `${originalName} (${nameCounts[originalName]})`;
            } else {
                nameCounts[originalName] = 1;
            }

            definitions.push({
                name: tableName,
                address: zAddress,
                rows: finalRows,
                cols: finalCols,
                dataSize,
                isBigEndian,
                equation,
                equationVar,
                xAxisDef,
                yAxisDef,
                isPotential: false,
                minorStride,
                majorStride,
            });
        } catch (e) {
            console.error(`Erro ao analisar a tabela "${originalName}": ${(e as Error).message}`);
        }
    }
    return definitions;
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition, isEndianSwapped = false): AxisDataState {
  const emptyState: AxisDataState = { raw: [], calculated: [] };
  if (!axisDef) return emptyState;
  
  const count = axisDef.count || 0;
  if (count === 0) return emptyState;

  if (axisDef.staticLabels && axisDef.staticLabels.length > 0) {
      if (axisDef.staticLabels.length !== count) {
          console.warn(`O número de etiquetas estáticas (${axisDef.staticLabels.length}) não corresponde à contagem do eixo (${count}). A usar a contagem do eixo.`);
      }
      const calculated = axisDef.staticLabels.slice(0, count);
      const raw = calculated.map((_, i) => i); // Generate dummy raw values for static labels
      return { raw, calculated };
  }
  
  if (axisDef.address === null || isNaN(axisDef.address)) {
      // Create a dummy axis if no address is provided (e.g., for user-created maps)
      const calculated = Array.from({ length: count }, (_, i) => i + 1);
      const raw = calculated;
      return { raw, calculated };
  }
  
  const view = new DataView(binBuffer);
  const sanitizedEquation = (axisDef.equation || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ') 
      .replace(/\b(value)\b/gi, 'X') 
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      .replace(/(X)(\d)/gi, 'X * $2');

  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do eixo "${axisDef.equation}" para "${axisDef.label}" é inválida. (${error})`);
  }
  
  const rawData: number[] = [];
  const calculatedData: (number | string)[] = [];
  
  const stride = (axisDef.majorStride > 0) ? axisDef.majorStride : axisDef.dataSize;
  const useLittleEndian = !(axisDef.isBigEndian ?? false);

  for (let i = 0; i < count; i++) {
    const offset = axisDef.address + (i * stride);
    if (offset + axisDef.dataSize > view.byteLength) {
        console.error(`Leitura do eixo fora dos limites. Endereço: ${axisDef.address}, Offset: ${offset}. O eixo pode estar incompleto.`);
        while(calculatedData.length < count) {
          rawData.push(NaN);
          calculatedData.push(NaN);
        }
        break;
    }
    
    let rawValue;
    if (axisDef.dataSize === 1) {
        rawValue = view.getUint8(offset);
    } else if (axisDef.dataSize === 2) {
        rawValue = view.getUint16(offset, useLittleEndian);
    } else {
        rawData.push(NaN);
        calculatedData.push(NaN);
        continue;
    }
    rawData.push(rawValue);

    try {
        const calculatedValue = equationFunc(rawValue, rawValue);
        calculatedData.push(calculatedValue);
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`Erro ao aplicar a equação de eixo "${axisDef.equation}" no valor raw ${rawValue}: ${errorMsg}. A utilizar o valor raw.`);
        calculatedData.push(rawValue);
    }
  }
  return { raw: rawData, calculated: calculatedData };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    xAxis: AxisDataState,
    yAxis: AxisDataState,
    isEndianSwapped = false
): { calculatedMap: MapData, rawMap: MapData } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [] };

  const view = new DataView(binBuffer);
  const calculatedMap: MapData = [];
  const rawMap: MapData = [];
  
  const sanitizedEquation = (def.equation || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\b(value)\b/gi, 'X')
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      .replace(/(X)(\d)/gi, 'X * $2');
      
  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x', 'y_raw', 'x_raw', 'y_calc', 'x_calc', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do mapa "${def.equation}" para "${def.name}" é inválida. (${error})`);
  }
  
  const minorStride = def.minorStride > 0 ? def.minorStride : def.dataSize;
  const majorStride = def.majorStride > 0 ? def.majorStride : def.cols * minorStride;
  const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;

  for (let r = 0; r < def.rows; r++) {
    const calculatedRow: (number|null)[] = [];
    const rawRow: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * majorStride) + (c * minorStride);
      if (offset + def.dataSize > view.byteLength) {
        console.error(`Leitura do mapa fora dos limites para "${def.name}". Offset: ${offset}`);
        calculatedRow.push(null);
        rawRow.push(null);
        continue;
      }
      
      let rawValue;
      if (def.dataSize === 1) {
          rawValue = view.getUint8(offset);
      } else if (def.dataSize === 2) {
          rawValue = view.getUint16(offset, useLittleEndian);
      } else {
          calculatedRow.push(null);
          rawRow.push(null);
          continue;
      }
      
      rawRow.push(rawValue);

      try {
        const xCalcVal = (c < xAxis.calculated.length && typeof xAxis.calculated[c] === 'number') ? xAxis.calculated[c] as number : 0;
        const yCalcVal = (r < yAxis.calculated.length && typeof yAxis.calculated[r] === 'number') ? yAxis.calculated[r] as number : 0;
        const xRawVal = xAxis.raw[c] ?? 0;
        const yRawVal = yAxis.raw[r] ?? 0;
        
        const calculatedValue = equationFunc(rawValue, rawValue, yRawVal, xRawVal, yCalcVal, xCalcVal);
        calculatedRow.push(calculatedValue);

      } catch(e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.error(`Erro ao aplicar equação "${sanitizedEquation}" na célula [${r},${c}] do mapa "${def.name}": ${errorMessage}. A utilizar o valor "cru".`);
          calculatedRow.push(rawValue);
      }
    }
    calculatedMap.push(calculatedRow);
    rawMap.push(rawRow);
  }
  return { calculatedMap, rawMap };
}

export function generateChecksum(buffer: ArrayBuffer): string {
    const dataView = new DataView(buffer);
    let checksum = 0;
    for (let i = 0; i < buffer.byteLength; i++) {
        checksum = (checksum + dataView.getUint8(i)) % 65536;
    }
    return checksum.toString(16).toUpperCase().padStart(4, '0');
}

export function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Reverses a mathematical equation to find the "raw" value that would produce a given final value.
 * This is a robust implementation that handles simple arithmetic.
 * @param eq The equation string (e.g., "(X-128)/2").
 * @param finalValue The target value we want to achieve.
 * @returns The calculated raw integer value.
 * @throws An error if the equation is too complex to be inverted automatically.
 */
export function invertEquation(
  eq: string,
  finalValue: number,
  axisValues: { x_calc: number; y_calc: number; x_raw: number; y_raw: number; z: number }
): number {
    if (finalValue === null || isNaN(finalValue)) {
        throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
    }

    let sanitizedEq = (eq || 'X').trim()
        .replace(/,/g, '.')
        .replace(/\b(value|x)\b/gi, 'X');
    
    // Substitute axis values into the equation string
    if (axisValues) {
        sanitizedEq = sanitizedEq
            .replace(/\by_calc\b/gi, String(axisValues.y_calc))
            .replace(/\bx_calc\b/gi, String(axisValues.x_calc))
            .replace(/\by_raw\b/gi, String(axisValues.y_raw))
            .replace(/\bx_raw\b/gi, String(axisValues.x_raw));
    }

    if ((sanitizedEq.match(/X/g) || []).length > 1) {
        throw new Error(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente (múltiplas ocorrências de X).`);
    }
    
    // Remove outer parentheses if they exist and don't change the meaning
    while (sanitizedEq.startsWith('(') && sanitizedEq.endsWith(')')) {
        sanitizedEq = sanitizedEq.substring(1, sanitizedEq.length - 1);
    }
    
    // Tokenize by operators, keeping the operators.
    const tokens = sanitizedEq.split(/([()+\-*/])/).map(t => t.trim()).filter(t => t);
    
    const xIndex = tokens.findIndex(t => t.toUpperCase() === 'X');
    if (xIndex === -1) {
      // If X is not found, it might be a constant equation.
      // This is an edge case, but we should handle it.
      // For now, assume the raw value is the final value.
      return Math.round(finalValue);
    }

    let currentVal = finalValue;
    
    // This is a simplified solver and will not handle all algebraic cases.
    // It works from right to left, inverting operations.
    // E.g., for (X - 128) / 2
    // 1. Tokens: ['(', 'X', '-', '128', ')', '/', '2']
    // 2. Start with final_value, multiply by 2.
    // 3. Then add 128.

    function solve(op: string, val: number, isLeft: boolean) {
        if (op === '+') currentVal -= val;
        else if (op === '-') currentVal = isLeft ? val - currentVal : currentVal + val;
        else if (op === '*') currentVal /= val;
        else if (op === '/') currentVal = isLeft ? val / currentVal : currentVal * val;
    }
    
    // Process operations to the right of X
    for (let i = xIndex + 1; i < tokens.length; i += 2) {
        const op = tokens[i];
        const numToken = tokens[i + 1];
        if (!op || !numToken || isNaN(parseFloat(numToken))) continue;
        solve(op, parseFloat(numToken), false);
    }

    // Process operations to the left of X
    for (let i = xIndex - 1; i >= 0; i -= 2) {
        const op = tokens[i];
        const numToken = tokens[i - 1];
        if (!op || !numToken || isNaN(parseFloat(numToken))) continue;
        solve(op, parseFloat(numToken), true);
    }
    
    return Math.round(currentVal);
}


export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
    sourceAxes: { x: AxisDataState, y: AxisDataState },
    isEndianSwapped = false
): MapData {
    const newRawMap: MapData = [];

    for (let r = 0; r < def.rows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < def.cols; c++) {
            const calculatedValue = calculatedMap[r]?.[c];

            if (calculatedValue === null || calculatedValue === undefined) {
                newRawRow.push(null);
                continue;
            }

            try {
                const axisValues = {
                    x_calc: (sourceAxes.x.calculated[c] as number) || 0,
                    y_calc: (sourceAxes.y.calculated[r] as number) || 0,
                    x_raw: sourceAxes.x.raw[c] || 0,
                    y_raw: sourceAxes.y.raw[r] || 0,
                    z: 0
                };
                
                const newRawValue = invertEquation(
                    def.equation,
                    calculatedValue,
                    axisValues
                );
                newRawRow.push(newRawValue);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : "Erro desconhecido";
                console.error(`Não foi possível recalcular o valor raw para a célula [${r}, ${c}]: ${errorMsg}. A utilizar NaN.`);
                newRawRow.push(NaN); // Push NaN or another indicator of failure
            }
        }
        newRawMap.push(newRawRow);
    }
    return newRawMap;
}


export function writeMapToBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    rawMapData: MapData,
    isEndianSwapped = false
): ArrayBuffer {
    if (!def || !binBuffer || !rawMapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const minorStride = def.minorStride > 0 ? def.minorStride : def.dataSize;
    const majorStride = def.majorStride > 0 ? def.majorStride : def.cols * minorStride;

    const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r][c];
            if (rawValue === null || isNaN(rawValue)) {
                continue;
            }

            try {
                const intValue = Math.round(rawValue);
                const offset = def.address + (r * majorStride) + (c * minorStride);

                if (offset + def.dataSize > view.byteLength) {
                    console.error(`Escrita do mapa fora dos limites. Offset: ${offset}. A saltar.`);
                    continue;
                }
                
                if (def.dataSize === 1) {
                    view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
                } else if (def.dataSize === 2) {
                     view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), useLittleEndian);
                }
            } catch (e) {
                 const errorMsg = e instanceof Error ? e.message : String(e);
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${errorMsg}`);
            }
        }
    }
    
    return newBuffer;
}
