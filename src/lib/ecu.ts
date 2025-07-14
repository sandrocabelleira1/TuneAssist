

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


function parseAxis(axisNode: Element | null, tableMap: Map<string, Element>, axisType: 'y' | 'x'): AxisDefinition {
    if (!axisNode) return null;

    const defaultLabel = axisType === 'y' ? 'RPM' : 'TPS';

    const localCountNode = findNode(axisNode, 'indexcount', 'INDEXCOUNT');
    let count = localCountNode ? parseInt(localCountNode.textContent || '0', 10) : 0;
    
    const localLabel = (
        findNode(axisNode, 'units', 'UNITS')?.textContent ||
        findNode(axisNode, 'title', 'TITLE')?.textContent ||
        ''
    ).trim() || defaultLabel;

    const mathNode = findNode(axisNode, 'math', 'MATH');
    const equation = getAttr(mathNode || axisNode, 'equation', 'Equation') || 'X';
    const varNode = findNode(mathNode || axisNode, 'VAR', 'var');
    const equationVar = getAttr(varNode, 'id') || 'X';

    // --- Case 1: Static Labels ---
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
                label: localLabel, 
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
    
    // --- Case 2: Data stored in BIN file (most common) ---
    // The data source can be <embeddeddata> or <embedinfo>
    const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const embedInfoNode = findNode(axisNode, 'embedinfo', 'EMBEDINFO');
    
    const sourceNode = embeddedData || embedInfoNode;
    if (!sourceNode) {
        // Cannot determine data source, return a minimal definition
        return {
            address: null, count: count, dataSize: 1, isBigEndian: false,
            equation, equationVar, label: localLabel, majorStride: 0, minorStride: 0
        };
    }

    const addrStr = getAttr(sourceNode, 'mmedaddress', 'address');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    
    const dataSizeBitsStr = getAttr(sourceNode, 'mmedelementsizebits', 'datasize');
    const dataSizeNode = findNode(sourceNode, 'data_size'); // Another possible location for data size
    const dataSize = parseInt(dataSizeBitsStr || dataSizeNode?.textContent || '8', 10) / 8;

    const isBigEndian = getAttr(sourceNode, 'bigendian')?.toLowerCase() === 'true' || getAttr(sourceNode, 'bigendian') === '1';
    
    const majorStride = parseInt(getAttr(sourceNode, 'mmedmajorstridebits', 'major_stride') || '0', 10) / 8;
    const minorStride = parseInt(getAttr(sourceNode, 'mmedminorstridebits', 'minor_stride') || '0', 10) / 8;

    // --- Special Case: Linked Axis ---
    const embedType = getAttr(embedInfoNode, 'type');
    if (embedType === '3' && embedInfoNode) {
        const linkId = getAttr(embedInfoNode, 'linkobjid');
        const linkedTable = linkId ? tableMap.get(linkId) : null;
        
        const linkedZAxis = findNode(linkedTable, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]', 'zaxis');
        if (linkedZAxis) {
            const sourceEmbeddedData = findNode(linkedZAxis, 'embeddeddata', 'EMBEDDEDDATA');
            if (sourceEmbeddedData) {
                const sourceAddrStr = getAttr(sourceEmbeddedData, 'mmedaddress');
                const sourceAddr = sourceAddrStr ? parseInt(sourceAddrStr, 16) : null;
                const sourceDataSize = parseInt(getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '8', 10) / 8;
                const sourceIsBigEndian = getAttr(sourceEmbeddedData, 'bigendian')?.toLowerCase() === 'true' || getAttr(sourceEmbeddedData, 'bigendian') === '1';
                const sourceMajorStride = parseInt(getAttr(sourceEmbeddedData, 'mmedmajorstridebits') || '0', 10) / 8;
                const sourceMinorStride = parseInt(getAttr(sourceEmbeddedData, 'mmedminorstridebits') || '0', 10) / 8;

                const linkedRows = parseInt(getAttr(sourceEmbeddedData, 'mmedrowcount') || '0');
                const linkedCols = parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || '0');
                const sourceCount = Math.max(linkedRows, linkedCols);

                if (sourceAddr !== null && !isNaN(sourceAddr)) {
                    return {
                        address: sourceAddr,
                        count: count > 0 ? count : sourceCount,
                        dataSize: sourceDataSize,
                        isBigEndian: sourceIsBigEndian,
                        equation: equation, // Math from this axis, not the linked one
                        equationVar: equationVar,
                        majorStride: sourceMajorStride,
                        minorStride: sourceMinorStride,
                        label: localLabel,
                    };
                }
            }
        }
    }

    return { 
        address: addr,
        count, 
        dataSize, 
        isBigEndian, 
        equation,
        equationVar,
        majorStride,
        minorStride,
        label: localLabel,
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
      
      // Get the Z address with correct priority.
      // 1. From the table's 'address' attribute (most common and authoritative).
      // 2. Fallback to the z-axis's 'mmedaddress' attribute.
      const tableAddressStr = getAttr(table, 'address');
      const zAddressStr = getAttr(zEmbeddedData, 'mmedaddress');
      const finalAddressStr = tableAddressStr || zAddressStr;

      if (!finalAddressStr) {
          console.warn(`A tabela "${originalName}" foi ignorada: não foi possível encontrar o endereço do mapa principal (nem em 'table[address]' nem em 'zaxis[mmedaddress]').`);
          continue;
      }

      // Basic Z-axis properties.
      const address = parseInt(finalAddressStr, 16);
      const rows = parseInt(getAttr(zEmbeddedData, 'mmedrowcount') || '0');
      const cols = parseInt(getAttr(zEmbeddedData, 'mmedcolcount') || '0');
      const dataSize = parseInt(getAttr(zEmbeddedData, 'mmedelementsizebits') || '8') / 8;
      const isBigEndian = getAttr(zEmbeddedData, 'bigendian')?.toLowerCase() === 'true' || getAttr(zEmbeddedData, 'bigendian') === '1';
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

      // Correctly swap axis IDs if transposed
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

      // --- Robust Axis Handling & Validation ---
      
      // If an axis is missing, we create a placeholder but do NOT infer an address.
      if (!yAxisDef) {
          yAxisDef = {
              address: null, count: rowsCount, dataSize: 2, isBigEndian: false,
              equation: 'X', equationVar: 'X', label: 'RPM (Inferido)', majorStride: 0, minorStride: 0
          };
          console.warn(`Definição do eixo Y em falta para "${originalName}". Foi criado um substituto sem endereço.`);
      } else if (yAxisDef.count !== rowsCount && yAxisDef.count > 0) {
          console.warn(`A contagem do eixo Y para "${originalName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rowsCount}). A ajustar para corresponder.`);
          yAxisDef.count = rowsCount;
      } else if (yAxisDef.count === 0) {
           yAxisDef.count = rowsCount;
      }

      if (!xAxisDef) {
          xAxisDef = {
              address: null, count: colsCount, dataSize: 2, isBigEndian: false,
              equation: 'X', equationVar: 'X', label: 'TPS (Inferido)', majorStride: 0, minorStride: 0
          };
          console.warn(`Definição do eixo X em falta para "${originalName}". Foi criado um substituto sem endereço.`);
      } else if (xAxisDef.count !== colsCount && xAxisDef.count > 0) {
          console.warn(`A contagem do eixo X para "${originalName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${colsCount}). A ajustar para corresponder.`);
          xAxisDef.count = colsCount;
      } else if (xAxisDef.count === 0) {
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
  const emptyState: AxisDataState = { raw: [], calculated: [] };
  if (!axisDef) return emptyState;

  if (axisDef.staticLabels && axisDef.staticLabels.length > 0) {
      if (axisDef.count > 0 && axisDef.staticLabels.length !== axisDef.count) {
          console.warn(`O número de etiquetas estáticas (${axisDef.staticLabels.length}) não corresponde à contagem do eixo (${axisDef.count}).`);
      }
      const finalCount = axisDef.count > 0 ? axisDef.count : axisDef.staticLabels.length;
      const calculated = axisDef.staticLabels.slice(0, finalCount);
      const raw = calculated.map((_, i) => i); // Generate dummy raw values for static labels
      return { raw, calculated };
  }
  
  const count = axisDef.count || 0;
  if (axisDef.address === null || isNaN(axisDef.address) || count === 0) {
      const calculated = Array.from({ length: count }, (_, i) => i + 1);
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
    if (axisDef.dataSize === 1) rawValue = view.getUint8(offset);
    else if (axisDef.dataSize === 2) rawValue = view.getUint16(offset, true);
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
    yAxis: AxisDataState
): { calculatedMap: MapData, rawMap: MapData } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [] };

  const view = new DataView(binBuffer);
  const calculatedMap: MapData = [];
  const rawMap: MapData = [];
  
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
          rawValue = view.getUint16(offset, true);
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
 * This is a robust implementation that handles simple arithmetic.
 * @param eq The equation string (e.g., "(X-128)/2").
 * @param finalValue The target value we want to achieve.
 * @returns The calculated raw integer value.
 * @throws An error if the equation is too complex to be inverted automatically.
 */
export function invertEquation(
  eq: string,
  eqVar: string, // Unused, for signature consistency
  finalValue: number,
  dataSize: number, // Unused
  isBigEndian: boolean, // Unused
  mapName: string, // Unused
  axisValues: { x_calc: number, y_calc: number, x_raw: number, y_raw: number, z: number }, // Unused
  axisLabels: { x: string, y: string } // Unused
): number {
    if (finalValue === null || isNaN(finalValue)) {
        throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
    }
    
    // Normalize equation: uppercase, replace VALUE with X, handle commas.
    let sanitizedEq = (eq || 'X').trim().toUpperCase().replace(/VALUE/g, 'X').replace(/,/g, '.');
    if (sanitizedEq === 'X') {
        return Math.round(finalValue);
    }

    // Check for multiple instances of X, which is too complex for this solver.
    if ((sanitizedEq.match(/X/g) || []).length > 1) {
        throw new Error(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente (múltiplas ocorrências de X).`);
    }

    // This is a simple, right-to-left parser for inverting simple arithmetic.
    // It's not a full algebraic solver but handles common XDF patterns.
    let currentVal = finalValue;

    // Remove all parentheses to simplify tokenization. This is a limitation but works for simple cases.
    let flatEq = sanitizedEq.replace(/[()]/g, '');
    const tokens = flatEq.split(/(\s+)/).filter(t => t.trim().length > 0);

    // Find the position of 'X'.
    const xIndex = tokens.indexOf('X');
    if (xIndex === -1) {
        throw new Error(`A variável 'X' não foi encontrada na equação para inversão: "${eq}"`);
    }

    // Invert operations to the RIGHT of X.
    // Example: X + 5 = 10  ->  currentVal becomes 10 - 5 = 5
    for (let i = xIndex + 1; i < tokens.length; i += 2) {
        const op = tokens[i];
        const numToken = tokens[i + 1];
        if (!numToken) continue;
        const num = parseFloat(numToken);
        if (isNaN(num)) throw new Error(`Token numérico inválido "${numToken}" na equação "${eq}"`);

        if (op === '+') currentVal -= num;
        else if (op === '-') currentVal += num;
        else if (op === '*') currentVal /= num;
        else if (op === '/') currentVal *= num;
    }

    // Invert operations to the LEFT of X (in reverse order).
    // Example: 10 - X = 5 -> currentVal becomes 10 - 5 = 5
    for (let i = xIndex - 1; i >= 0; i -= 2) {
        const op = tokens[i];
        const numToken = tokens[i - 1];
        if (!numToken) continue;
        const num = parseFloat(numToken);
        if (isNaN(num)) throw new Error(`Token numérico inválido "${numToken}" na equação "${eq}"`);
        
        if (op === '+') currentVal -= num;
        else if (op === '-') currentVal = num - currentVal; // Special case: N - X
        else if (op === '*') currentVal /= num;
        else if (op === '/') currentVal = num / currentVal; // Special case: N / X
    }

    return Math.round(currentVal);
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
                     view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), true);
                }
            } catch (e) {
                 const errorMsg = e instanceof Error ? e.message : String(e);
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${errorMsg}`);
            }
        }
    }
    
    return newBuffer;
}


