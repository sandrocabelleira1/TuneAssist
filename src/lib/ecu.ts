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


function parseAxis(axisNode: Element | null, tableMap: Map<string, Element>, axisType: 'x' | 'y'): AxisDefinition {
    if (!axisNode) return null;

    const defaultLabel = axisType === 'y' ? 'RPM' : 'Carga';

    const localCountNode = findNode(axisNode, 'indexcount', 'INDEXCOUNT');
    let count = localCountNode ? parseInt(localCountNode.textContent || '0', 10) : 0;
    
    const localLabel = (
        findNode(axisNode, 'units', 'UNITS')?.textContent ||
        findNode(axisNode, 'title', 'TITLE')?.textContent ||
        ''
    ).trim();

    const embedInfoNode = findNode(axisNode, 'embedinfo', 'EMBEDINFO');
    const embedType = getAttr(embedInfoNode, 'type');
    const isLinked = embedType === '3';

    // --- Case 1: Linked Axis ---
    // If the axis is linked to another table's Z-axis data.
    if (isLinked && embedInfoNode) {
        const linkId = getAttr(embedInfoNode, 'linkobjid');
        const linkedTable = linkId ? tableMap.get(linkId) : null;
        
        const linkedZAxis = findNode(linkedTable, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]', 'zaxis');
        if (linkedZAxis) {
            const sourceEmbeddedData = findNode(linkedZAxis, 'embeddeddata', 'EMBEDDEDDATA');
            if (sourceEmbeddedData) {
                const sourceAddrStr = getAttr(sourceEmbeddedData, 'mmedaddress');
                const sourceAddr = sourceAddrStr ? parseInt(sourceAddrStr, 16) : null;
                const sourceDataSizeBitsStr = getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '8';
                const sourceDataSize = parseInt(sourceDataSizeBitsStr, 10) / 8;
                const sourceIsBigEndian = getAttr(sourceEmbeddedData, 'bigendian') === '1';

                const sourceMajorStride = parseInt(getAttr(sourceEmbeddedData, 'mmedmajorstridebits') || '0', 10) / 8;
                const sourceMinorStride = parseInt(getAttr(sourceEmbeddedData, 'mmedminorstridebits') || '0', 10) / 8;

                // For linked axes, the math comes from the linked table's Z-axis.
                const sourceMathNode = findMainMathNode(linkedTable!, linkedZAxis);
                const sourceEquation = getAttr(sourceMathNode || linkedZAxis, 'Equation', 'equation') || 'X';
                
                const sourceVarNode = findNode((sourceMathNode || linkedZAxis), 'var', 'VAR');
                const sourceEquationVar = getAttr(sourceVarNode, 'id') || 'X';
                
                const linkedRows = parseInt(getAttr(sourceEmbeddedData, 'mmedrowcount') || '0');
                const linkedCols = parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || '0');
                // The count for a 1D axis linked to a 2D map is the maximum of its dimensions.
                const sourceCount = Math.max(linkedRows, linkedCols);

                if (sourceAddr !== null && !isNaN(sourceAddr)) {
                    return {
                        address: sourceAddr,
                        // Use the local count if specified, otherwise use the inferred count from the linked map.
                        count: count > 0 ? count : sourceCount,
                        dataSize: sourceDataSize,
                        isBigEndian: sourceIsBigEndian,
                        equation: sourceEquation,
                        equationVar: sourceEquationVar,
                        majorStride: sourceMajorStride,
                        minorStride: sourceMinorStride,
                        label: localLabel || defaultLabel,
                    };
                }
            }
        }
    }

    // --- Case 2: Static Labels ---
    // The axis values are defined directly in the XDF as <label> tags. No BIN reading needed.
    const labelNodes = findNodes(axisNode, 'label');
    if (labelNodes.length > 0) {
        const labels = Array.from(labelNodes).map(l => getAttr(l, 'value') || '');
        if (labels.length > 0) {
            const staticLabels = labels.map(l => {
                const num = parseFloat(l);
                return isNaN(num) ? l.trim() : num;
            });
            // The count should match the number of labels. If `indexcount` is missing, use the number of labels.
            const finalCount = count > 0 ? count : labels.length;
            if (count === 0) count = finalCount;
            return { 
                staticLabels, 
                count: finalCount, 
                label: localLabel || defaultLabel, 
                equation: 'X', 
                equationVar: 'X', 
                majorStride: 0, 
                minorStride: 0,
                address: null,
                dataSize: 1, // Placeholder
                isBigEndian: false, // Placeholder
            };
        }
    }

    // --- Case 3: Directly Addressed Data ---
    // The axis data is at a specific address in the BIN file.
    const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const addrStr = getAttr(embeddedData, 'mmedaddress');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    const dataSizeBitsStr = getAttr(embeddedData, 'mmedelementsizebits') || findNode(embedInfoNode || axisNode, 'data_size', 'DATA_SIZE')?.textContent || '8';
    const dataSizeBits = parseInt(dataSizeBitsStr, 10);
    const isBigEndian = getAttr(embeddedData, 'bigendian') === '1';

    const majorStride = parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10) / 8;
    const minorStride = parseInt(getAttr(embeddedData, 'mmedminorstridebits') || '0', 10) / 8;
    
    // The math for the axis is defined within its own scope.
    const mathNode = findNode(axisNode, 'math', 'MATH');
    const equation = getAttr(mathNode || axisNode, 'equation', 'Equation') || 'X';
    const varNode = findNode(mathNode || axisNode, 'VAR', 'var');
    const equationVar = getAttr(varNode, 'id') || 'X';

    // An axis must have a count, and if it's not static, it must have an address.
    if (count === 0 || (addr === null || isNaN(addr))) {
        // Return a partial definition if possible, the main parser will try to infer the rest.
        return { 
            address: (addr !== null && !isNaN(addr)) ? addr : null,
            count, 
            dataSize: dataSizeBits / 8, 
            isBigEndian, 
            equation,
            equationVar,
            majorStride,
            minorStride,
            label: localLabel || defaultLabel,
        };
    }

    return { 
        address: addr,
        count, 
        dataSize: dataSizeBits / 8, 
        isBigEndian, 
        equation,
        equationVar,
        majorStride,
        minorStride,
        label: localLabel || defaultLabel,
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

  // Helper to check if an element is nested within another table-like element.
  const isNestedInTable = (element: Element | null): boolean => {
    let parent = element?.parentElement;
    while(parent) {
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
  for(const el of Array.from(allElements)) {
      const tagName = el.tagName.toLowerCase();
      if ((tagName === 'xdftable' || tagName === 'table') && !isNestedInTable(el)) {
          xdfTables.push(el);
      }
  }

  if (xdfTables.length === 0) {
    throw new Error('Nenhuma definição de <XDFTABLE> ou <table> foi encontrada no ficheiro.');
  }
  
  // Create a map of tables by their unique ID for resolving links.
  const tableMap = new Map<string, Element>();
  xdfTables.forEach(table => {
      const uniqueid = getAttr(table, 'uniqueid');
      if (uniqueid && uniqueid !== '0x0' && uniqueid !== '0') {
          if (tableMap.has(uniqueid)) {
            console.warn(`ID único de tabela duplicado encontrado: ${uniqueid}. A ligação a esta tabela pode ser ambígua.`);
          }
          tableMap.set(uniqueid, table);
      }
  });

  const definitions: XDFDefinition[] = [];
  const nameCounts: Record<string, number> = {};

  for (const table of xdfTables) {
    const titleNode = findNode(table, 'title', 'TITLE');
    const originalName = titleNode?.textContent || getAttr(table, 'name') || 'Tabela Sem Nome';
    
    try {
      if (originalName === 'Tabela Sem Nome') {
          continue; // Skip tables without a name.
      }

      // Z-Axis is mandatory for a map definition.
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
      if (!zAddressStr) {
          console.warn(`A tabela "${originalName}" foi ignorada: o eixo Z não tem endereço (mmedaddress).`);
          continue;
      }

      // Basic Z-axis properties.
      const address = parseInt(zAddressStr, 16);
      const rows = parseInt(getAttr(zEmbeddedData, 'mmedrowcount') || '0');
      const cols = parseInt(getAttr(zEmbeddedData, 'mmedcolcount') || '0');
      const dataSize = parseInt(getAttr(zEmbeddedData, 'mmedelementsizebits') || '8') / 8;
      const isBigEndian = getAttr(zEmbeddedData, 'bigendian') === '1';
      const majorStride = parseInt(getAttr(zEmbeddedData, 'mmedmajorstridebits') || '0', 10) / 8;
      const minorStride = parseInt(getAttr(zEmbeddedData, 'mmedminorstridebits') || '0', 10) / 8;

      if (isNaN(address) || rows === 0 || cols === 0) {
        console.warn(`A tabela "${originalName}" foi ignorada: dimensões ou endereço do eixo Z inválidos.`);
        continue;
      }
      
      // Handle transposed maps where X and Y axes are swapped.
      const zEmbedInfoNode = findNode(zAxisNode, 'embedinfo', 'EMBEDINFO');
      const embedType = getAttr(zEmbedInfoNode, 'type');
      const isTransposed = embedType === '2';

      const rowsCount = isTransposed ? cols : rows;
      const colsCount = isTransposed ? rows : cols;
      const yAxisId = isTransposed ? 'x' : 'y';
      const xAxisId = isTransposed ? 'y' : 'x';

      const yAxisNode = findNode(table, `XDFAXIS[id="${yAxisId}"]`, `XDFAXIS[id="${yAxisId.toUpperCase()}"]`, `yaxis`);
      const xAxisNode = findNode(table, `XDFAXIS[id="${xAxisId}"]`, `XDFAXIS[id="${xAxisId.toUpperCase()}"]`, `xaxis`);

      let yAxisDef = parseAxis(yAxisNode, tableMap, 'y');
      let xAxisDef = parseAxis(xAxisNode, tableMap, 'x');
      
      // Get Z-axis math.
      const mathNode = findMainMathNode(table, zAxisNode);
      const equation = getAttr(mathNode, 'equation', 'Equation') || 'X';
      const varNode = mathNode ? findNode(mathNode, 'var', 'VAR') : findNode(zAxisNode, 'var', 'VAR');
      const equationVar = getAttr(varNode, 'id') || 'X';

      // --- Robust Axis Handling & Inference ---
      const defaultYDataSize = 2; // RPM is usually 16-bit
      const defaultXDataSize = 2; // Load/TPS also often 16-bit
      const inferredXAddr = address - (colsCount * (xAxisDef?.dataSize || defaultXDataSize));
      const inferredYAddr = inferredXAddr - (rowsCount * (yAxisDef?.dataSize || defaultYDataSize));

      // If Y-axis is missing or incomplete, try to infer it.
      if (!yAxisDef || (yAxisDef.address === null && !yAxisDef.staticLabels)) {
          const wasMissing = !yAxisDef;
          yAxisDef = {
              ...(yAxisDef || {} as Partial<AxisDefinition>),
              address: inferredYAddr >= 0 ? inferredYAddr : null,
              count: rowsCount,
              dataSize: yAxisDef?.dataSize || defaultYDataSize,
              isBigEndian: yAxisDef?.isBigEndian ?? false,
              equation: (yAxisDef?.equation && yAxisDef.equation !== 'X') ? yAxisDef.equation : 'X',
              equationVar: yAxisDef?.equationVar || 'X',
              label: yAxisDef?.label || 'RPM',
          } as AxisDefinition; // Type assertion
          if(yAxisDef.address !== null && wasMissing) {
              console.warn(`Definição do eixo Y em falta para "${originalName}". A inferir um substituto com endereço 0x${yAxisDef.address?.toString(16)}.`);
          }
      } else if (yAxisDef.count === 0) { // If count was explicitly 0 or missing, set it.
          yAxisDef.count = rowsCount;
      } else if (yAxisDef.count !== rowsCount) {
          console.warn(`A contagem do eixo Y para "${originalName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rowsCount}). A ajustar para corresponder.`);
          yAxisDef.count = rowsCount;
      }
      
      // If X-axis is missing or incomplete, try to infer it.
      if (!xAxisDef || (xAxisDef.address === null && !xAxisDef.staticLabels)) {
          const wasMissing = !xAxisDef;
           xAxisDef = {
              ...(xAxisDef || {} as Partial<AxisDefinition>),
              address: inferredXAddr >= 0 ? inferredXAddr : null,
              count: colsCount,
              dataSize: xAxisDef?.dataSize || defaultXDataSize,
              isBigEndian: xAxisDef?.isBigEndian ?? false,
              equation: (xAxisDef?.equation && xAxisDef.equation !== 'X') ? xAxisDef.equation : 'X',
              equationVar: xAxisDef?.equationVar || 'X',
              label: xAxisDef?.label || 'Carga',
          } as AxisDefinition; // Type assertion
          if (xAxisDef.address !== null && wasMissing) {
              console.warn(`Definição do eixo X em falta para "${originalName}". A inferir um substituto com endereço 0x${xAxisDef.address?.toString(16)}.`);
          }
      } else if (xAxisDef.count === 0) { // If count was explicitly 0 or missing, set it.
          xAxisDef.count = colsCount;
      } else if (xAxisDef.count !== colsCount) {
          console.warn(`A contagem do eixo X para "${originalName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${colsCount}). A ajustar para corresponder.`);
          xAxisDef.count = colsCount;
      }

      // Handle duplicate table names by appending a counter.
      let tableName = originalName;
      if (nameCounts[originalName]) {
          nameCounts[originalName]++;
          tableName = `${originalName} (${nameCounts[originalName]})`;
      } else {
          nameCounts[originalName] = 1;
      }

      definitions.push({ 
        name: tableName, 
        address, 
        rows: rowsCount, 
        cols: colsCount, 
        dataSize, 
        isBigEndian, 
        equation,
        equationVar,
        majorStride, 
        minorStride,
        xAxisDef, 
        yAxisDef 
      });
    } catch (e) {
      console.error(`Erro ao analisar a tabela "${originalName}": ${(e as Error).message}`);
    }
  }
  return definitions;
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition): AxisDataState {
  if (!axisDef) return { raw: [], calculated: [] };

  if (axisDef.staticLabels && axisDef.staticLabels.length > 0) {
      if (axisDef.staticLabels.length !== axisDef.count) {
          console.warn(`O número de etiquetas estáticas (${axisDef.staticLabels.length}) não corresponde à contagem do eixo (${axisDef.count}).`);
      }
      const calculated = axisDef.staticLabels.slice(0, axisDef.count);
      const raw = calculated.map((_, i) => i); // Generate dummy raw values for static labels
      return { raw, calculated };
  }

  if (axisDef.address === null) {
      const calculated = Array.from({ length: axisDef.count }, (_, i) => i + 1);
      const raw = calculated.map(v => typeof v === 'number' ? v : 0); // Raw is same as calculated if no address
      return { raw, calculated };
  }
  
  const view = new DataView(binBuffer);
  // Improved sanitizer: handles multi-line if/else and removes newlines within the expression.
  const sanitizedEquation = (axisDef.equation || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ') // Replace newlines and surrounding whitespace with a single space
      .replace(/\b(x|value)\b/gi, 'X') // Standardize variable to 'X'
      // Convert `if (cond) { A } else { B }` to ternary `(cond ? A : B)` - now handles expressions with spaces/newlines
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      // Convert `IF(cond, A, B)` to ternary `(cond ? A : B)`
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      // Add implicit multiplication, e.g., X100 -> X * 100
      .replace(/(X)(\d)/gi, 'X * $2');

  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do eixo "${axisDef.equation}" para "${axisDef.label}" é inválida. (${error})`);
  }
  
  const rawData: number[] = [];
  const calculatedData: (number | string)[] = [];
  
  let stride = Math.max(axisDef.majorStride || 0, axisDef.minorStride || 0);
  if (stride === 0) {
      stride = axisDef.dataSize;
  }

  for (let i = 0; i < axisDef.count; i++) {
    const offset = axisDef.address + (i * stride);
    if (offset + axisDef.dataSize > view.byteLength) {
        console.error(`Leitura do eixo fora dos limites. Endereço: ${axisDef.address}, Offset: ${offset}. O eixo pode estar incompleto.`);
        while(calculatedData.length < axisDef.count) {
          rawData.push(NaN);
          calculatedData.push(NaN);
        }
        break;
    }
    
    let rawValue;
    if (axisDef.dataSize === 1) rawValue = view.getUint8(offset);
    else if (axisDef.dataSize === 2) rawValue = view.getUint16(offset, !axisDef.isBigEndian);
    else {
        rawData.push(NaN);
        calculatedData.push(NaN);
        continue;
    }
    rawData.push(rawValue);

    try {
        const calculatedValue = equationFunc(rawValue, 0, 0, 0);
        calculatedData.push(calculatedValue);
    } catch (e) {
        console.error(`Erro ao aplicar a equação de eixo "${axisDef.equation}" no valor raw ${rawValue}: ${e}. A utilizar o valor raw.`);
        calculatedData.push(rawValue);
    }
  }
  return { raw: rawData, calculated: calculatedData };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    xAxis: AxisDataState,
    yAxis: AxisDataState
): { calculatedMap: MapData, rawMap: MapData } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [] };

  const view = new DataView(binBuffer);
  const calculatedMap: MapData = [];
  const rawMap: MapData = [];
  
  const isPotentiallySignedMap = ['ignição', 'ignition', 'avanço', 'spark', 'timing'].some(kw => def.name.toLowerCase().includes(kw));

  const sanitizedEquation = (def.equation || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\b(value)\b/gi, 'X') // Standardize variable to 'X', but keep 'x' for axis
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      .replace(/(X)(\d)/gi, 'X * $2');
      
  let finalEquation = sanitizedEquation;
  // Replace labels first, with _calc suffix to avoid collision with raw x/y
  if (def.yAxisDef?.label) {
      const yLabelVar = def.yAxisDef.label.replace(/[^a-zA-Z0-9_]/g, '');
      if (yLabelVar) finalEquation = finalEquation.replace(new RegExp(`\\b${yLabelVar}\\b`, 'gi'), 'y_calc');
  }
  if (def.xAxisDef?.label) {
      const xLabelVar = def.xAxisDef.label.replace(/[^a-zA-Z0-9_]/g, '');
      if (xLabelVar) finalEquation = finalEquation.replace(new RegExp(`\\b${xLabelVar}\\b`, 'gi'), 'x_calc');
  }

  // Then replace literal x/y with _raw suffix
  finalEquation = finalEquation.replace(/\by\b/g, 'y_raw').replace(/\bx\b/g, 'x_raw');

  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x_raw', 'y_raw', 'x_calc', 'y_calc', 'z', `return ${finalEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do mapa "${def.equation}" para "${def.name}" é inválida. (${error})`);
  }
  
  const minorStride = def.minorStride > 0 ? def.minorStride : def.dataSize;
  const majorStride = def.majorStride > 0 ? def.majorStride : (def.cols * minorStride);


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
          if (isPotentiallySignedMap) {
              rawValue = view.getInt16(offset, !def.isBigEndian);
          } else {
              rawValue = view.getUint16(offset, !def.isBigEndian);
          }
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
        
        const calculatedValue = equationFunc(rawValue, xRawVal, yRawVal, xCalcVal, yCalcVal, 0);
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
 * This function uses a numerical binary search method, which is robust for complex but monotonic equations.
 * @param eq The equation string (e.g., "(X-256)/514.56").
 * @param eqVar The variable name in the equation (e.g., "X").
 * @param finalValue The target value we want to achieve.
 * @param dataSize The size of the raw data in bytes (1 for 8-bit, 2 for 16-bit).
 * @param mapName The name of the map, used to infer if the data is signed.
 * @param axisValues The values of the x, y, and z axes for the current cell.
 * @returns The calculated raw integer value.
 */
export function invertEquation(
  eq: string,
  eqVar: string,
  finalValue: number,
  dataSize: number,
  mapName: string,
  axisValues: { x_calc: number, y_calc: number, x_raw: number, y_raw: number, z: number },
  axisLabels: { x: string, y: string }
): number {
  if (finalValue === null || isNaN(finalValue)) {
    throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
  }

  // 1. Create the forward function from the equation string.
  const sanitizedEquation = (eq || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\b(value)\b/gi, 'X') // Standardize variable to 'X', but keep 'x' for axis
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      .replace(/(X)(\d)/gi, 'X * $2');
      
  let finalEquation = sanitizedEquation;
  // Replace labels first, with _calc suffix to avoid collision with raw x/y
  if (axisLabels.y) {
      const yLabelVar = axisLabels.y.replace(/[^a-zA-Z0-9_]/g, '');
      if (yLabelVar) finalEquation = finalEquation.replace(new RegExp(`\\b${yLabelVar}\\b`, 'gi'), 'y_calc');
  }
  if (axisLabels.x) {
      const xLabelVar = axisLabels.x.replace(/[^a-zA-Z0-9_]/g, '');
      if (xLabelVar) finalEquation = finalEquation.replace(new RegExp(`\\b${xLabelVar}\\b`, 'gi'), 'x_calc');
  }

  // Then replace literal x/y with _raw suffix
  finalEquation = finalEquation.replace(/\by\b/g, 'y_raw').replace(/\bx\b/g, 'x_raw');


  let equationFunc: (X: number, x_raw: number, y_raw: number, x_calc: number, y_calc: number, z: number) => number;
  try {
    equationFunc = new Function('X', 'x_raw', 'y_raw', 'x_calc', 'y_calc', 'z', `return ${finalEquation || 'X'}`) as any;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação para inversão "${eq}" é inválida. (${error})`);
  }

  // 2. Set up the search range based on data size and map type.
  const isPotentiallySigned = ['ignição', 'ignition', 'avanço', 'spark', 'timing'].some(kw => mapName.toLowerCase().includes(kw));
  let low: number, high: number;

  if (dataSize === 1) {
    low = 0; // 8-bit is typically unsigned.
    high = 255;
  } else if (dataSize === 2) {
    low = isPotentiallySigned ? -32768 : 0;
    high = isPotentiallySigned ? 32767 : 65535;
  } else {
    throw new Error(`Tamanho de dados não suportado para inversão: ${dataSize} bytes.`);
  }

  // Handle the simplest case directly for performance.
  if (finalEquation.trim() === 'X') {
    return Math.round(finalValue);
  }

  // 3. Perform a binary search to find the integer raw value.
  let iterations = 100; // More than enough for a 16-bit range.
  const lowVal = equationFunc(low, axisValues.x_raw, axisValues.y_raw, axisValues.x_calc, axisValues.y_calc, axisValues.z);
  const highVal = equationFunc(high, axisValues.x_raw, axisValues.y_raw, axisValues.x_calc, axisValues.y_calc, axisValues.z);

  // Check if the target value is outside the achievable range.
  if ((finalValue < lowVal && finalValue < highVal) || (finalValue > lowVal && finalValue > highVal)) {
    const diffLow = Math.abs(lowVal - finalValue);
    const diffHigh = Math.abs(highVal - finalValue);
    return diffLow < diffHigh ? low : high;
  }
  
  const isMonotonicIncreasing = highVal > lowVal;

  while (low <= high && iterations > 0) {
    const mid = Math.floor((low + high) / 2);
    if(mid === low || mid === high) break; // Avoid infinite loop if range is small

    const midValue = equationFunc(mid, axisValues.x_raw, axisValues.y_raw, axisValues.x_calc, axisValues.y_calc, axisValues.z);
    
    // This logic handles both increasing and decreasing monotonic functions.
    if ((isMonotonicIncreasing && midValue < finalValue) || (!isMonotonicIncreasing && midValue > finalValue)) {
      low = mid;
    } else {
      high = mid;
    }
    iterations--;
  }
  
  // After the loop, low and high are very close. Check which is the better fit.
  const diffLow = Math.abs(equationFunc(low, axisValues.x_raw, axisValues.y_raw, axisValues.x_calc, axisValues.y_calc, axisValues.z) - finalValue);
  const diffHigh = Math.abs(equationFunc(high, axisValues.x_raw, axisValues.y_raw, axisValues.x_calc, axisValues.y_calc, axisValues.z) - finalValue);
  
  return diffLow <= diffHigh ? low : high;
}


export function writeMapToBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    rawMapData: MapData
): ArrayBuffer {
    if (!def || !binBuffer || !rawMapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const minorStride = def.minorStride > 0 ? def.minorStride : def.dataSize;
    const majorStride = def.majorStride > 0 ? def.majorStride : (def.cols * minorStride);

    const isPotentiallySignedMap = ['ignição', 'ignition', 'avanço', 'spark', 'timing'].some(kw => def.name.toLowerCase().includes(kw));

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r][c];
            if (rawValue === null) {
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
                     if (isPotentiallySignedMap) {
                        view.setInt16(offset, Math.max(-32768, Math.min(32767, intValue)), !def.isBigEndian);
                    } else {
                        view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), !def.isBigEndian);
                    }
                }
            } catch (e) {
                 const errorMsg = e instanceof Error ? e.message : String(e);
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${errorMsg}`);
            }
        }
    }
    
    return newBuffer;
}
