// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData } from './types';

/**
 * Finds a child element in a case-insensitive manner for tags and attributes.
 * THIS IS NOW RECURSIVE: It searches all descendants, not just direct children.
 * Supports simple tag selectors ('math') and simple attribute selectors ('XDFAXIS[id="z"]').
 * @param parent The element to search within.
 * @param selectors The possible selectors.
 * @returns The found element or null.
 */
function findNode(parent: Element | null, ...selectors: string[]): Element | null {
    if (!parent) return null;

    for (const selector of selectors) {
        // Use getElementsByTagName('*') for a recursive search of all descendants
        const elementsToSearch = Array.from(parent.getElementsByTagName('*'));
        elementsToSearch.unshift(parent); // Also check the parent element itself

        // Simple tag name selector, e.g., "math"
        const isSimpleTag = /^[a-zA-Z0-9]+$/.test(selector);
        if (isSimpleTag) {
            for (const el of elementsToSearch) {
                if (el.tagName.toLowerCase() === selector.toLowerCase()) {
                    return el;
                }
            }
        } else {
            // More complex selector like 'XDFAXIS[id="z"]'
            const match = selector.match(/^([a-zA-Z0-9]+)\[([a-zA-Z]+)="(.+?)"\]$/);
            if (match) {
                const [, tagName, attrName, attrValue] = match;
                for (const el of elementsToSearch) {
                    if (el.tagName.toLowerCase() === tagName.toLowerCase()) {
                        const val = getAttr(el, attrName);
                        if (val && val.toLowerCase() === attrValue.toLowerCase()) {
                            return el;
                        }
                    }
                }
            } else {
              // Fallback to querySelector for any other complex cases, though it might be case-sensitive.
              try {
                const node = parent.querySelector(selector);
                if (node) return node;
              } catch (e) {
                console.warn(`Could not execute querySelector for "${selector}", it might be invalid.`, e);
              }
            }
        }
    }
    return null;
}

/**
 * Finds a DIRECT child element by tag name, case-insensitively.
 * @param parent The element to search within.
 * @param tagNames The possible tag names.
 * @returns The found direct child element or null.
 */
function findDirectChild(parent: Element | null, ...tagNames: string[]): Element | null {
    if (!parent) return null;
    for (const tagName of tagNames) {
        const lowerTagName = tagName.toLowerCase();
        for (const child of Array.from(parent.children)) {
            if (child.tagName.toLowerCase() === lowerTagName) {
                return child;
            }
        }
    }
    return null;
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

    const localCountNode = findDirectChild(axisNode, 'indexcount', 'INDEXCOUNT');
    const count = localCountNode ? parseInt(localCountNode.textContent || '0', 10) : 0;
    
    const localLabel = (
        findDirectChild(axisNode, 'units', 'UNITS')?.textContent ||
        findDirectChild(axisNode, 'title', 'TITLE')?.textContent ||
        ''
    ).trim();

    const embedInfoNode = findDirectChild(axisNode, 'embedinfo', 'EMBEDINFO');
    const embedType = getAttr(embedInfoNode, 'type');
    const isLinked = embedType === '3';

    if (isLinked && embedInfoNode) {
        const linkId = getAttr(embedInfoNode, 'linkobjid');
        const linkedTable = linkId ? tableMap.get(linkId) : null;
        
        const linkedZAxis = linkedTable ? findNode(linkedTable, 'XDFAXIS[id="z"]', 'zaxis') : null;
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

                const sourceMathNode = findNode(linkedZAxis, 'math', 'MATH');
                const sourceEquation = getAttr(sourceMathNode || linkedZAxis, 'Equation', 'equation') || 'X';
                
                const sourceVarNode = findNode(sourceMathNode || linkedZAxis, 'var', 'VAR');
                const sourceEquationVar = getAttr(sourceVarNode, 'id') || 'X';
                
                const linkedRows = parseInt(getAttr(sourceEmbeddedData, 'mmedrowcount') || '0');
                const linkedCols = parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || '0');
                const sourceCount = Math.max(linkedRows, linkedCols);

                if (sourceAddr !== null && !isNaN(sourceAddr)) {
                    return {
                        address: sourceAddr,
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

    // --- Fallback to standard parsing (static labels or direct address) ---
    const labelNodes = axisNode.querySelectorAll('label, LABEL');
    let staticLabels: (string | number)[] | undefined = undefined;
    if (labelNodes.length > 0) {
        const labels = Array.from(labelNodes).map(l => getAttr(l, 'value') || '');
        if (labels.length > 0) {
            staticLabels = labels.map(l => {
                const num = parseFloat(l);
                return isNaN(num) ? l.trim() : num;
            });
            if (count === 0) return { staticLabels, count: labels.length, label: localLabel || defaultLabel, equation: 'X', equationVar: 'X', majorStride: 0, minorStride: 0 } as AxisDefinition;
            return { staticLabels, count, label: localLabel || defaultLabel, equation: 'X', equationVar: 'X', majorStride: 0, minorStride: 0 } as AxisDefinition;
        }
    }

    const embeddedData = findDirectChild(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const addrStr = getAttr(embeddedData, 'mmedaddress');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    const dataSizeBitsStr = getAttr(embeddedData, 'mmedelementsizebits') || findDirectChild(embedInfoNode || axisNode, 'data_size', 'DATA_SIZE')?.textContent || '8';
    const dataSizeBits = parseInt(dataSizeBitsStr, 10);
    const isBigEndian = getAttr(embeddedData, 'bigendian') === '1';

    const majorStride = parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10) / 8;
    const minorStride = parseInt(getAttr(embeddedData, 'mmedminorstridebits') || '0', 10) / 8;
    
    const mathNode = findDirectChild(axisNode, 'math', 'MATH');
    const equation = getAttr(mathNode || axisNode, 'equation', 'Equation') || 'X';
    const varNode = findDirectChild(mathNode || axisNode, 'VAR', 'var');
    const equationVar = getAttr(varNode, 'id') || 'X';

    if (count === 0) return null;

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

/**
 * Finds the main <math> node for the Z-axis data, intelligently excluding axis-specific math nodes.
 * @param tableNode The main table element.
 * @param zAxisNode The Z-axis element.
 * @param xAxisNode The X-axis element.
 * @param yAxisNode The Y-axis element.
 * @returns The main math node, or null if not found.
 */
function findMainMathNode(tableNode: Element, zAxisNode: Element, xAxisNode: Element | null, yAxisNode: Element | null): Element | null {
    // Priority 1: A <math> node that is a DIRECT child of the Z-axis definition. This is the most specific.
    const zMath = findDirectChild(zAxisNode, 'math', 'MATH');
    if (zMath) {
        return zMath;
    }

    // Priority 2: A <math> node that is a DIRECT child of the TABLE definition.
    // This is a common pattern in some XDFs.
    const tableMath = findDirectChild(tableNode, 'math', 'MATH');
    if (tableMath) {
        return tableMath;
    }
    
    // Fallback: Find all math nodes in the table, and exclude any that are descendants of the X or Y axes.
    const allMathNodes = Array.from(tableNode.getElementsByTagName('math'));

    for (const mathNode of allMathNodes) {
        let isAxisMath = false;
        // Check if this math node belongs to the X or Y axis by checking if it's a descendant.
        if (xAxisNode && xAxisNode.contains(mathNode)) {
            isAxisMath = true;
        }
        if (yAxisNode && yAxisNode.contains(mathNode)) {
            isAxisMath = true;
        }

        // If it's not an axis math node, it must be the main one. Return the first one we find.
        if (!isAxisMath) {
            return mathNode;
        }
    }
    
    // If no other math node is found, there might not be one.
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

  const allElements = xmlDoc.getElementsByTagName('*');
  const xdfTables: Element[] = [];
  for (const el of Array.from(allElements)) {
      if (el.tagName.toLowerCase() === 'xdftable' || el.tagName.toLowerCase() === 'table') {
          if (!el.parentElement || (el.parentElement.tagName.toLowerCase() !== 'xdftable' && el.parentElement.tagName.toLowerCase() !== 'table')) {
            xdfTables.push(el);
          }
      }
  }

  if (xdfTables.length === 0) {
    throw new Error('Nenhuma definição de <XDFTABLE> ou <table> foi encontrada no ficheiro.');
  }
  
  const tableMap = new Map<string, Element>();
  for (const table of xdfTables) {
      const uniqueid = getAttr(table, 'uniqueid');
      if (uniqueid && uniqueid !== '0x0' && uniqueid !== '0') {
          if (tableMap.has(uniqueid)) {
            console.warn(`ID único de tabela duplicado encontrado: ${uniqueid}. A ligação a esta tabela pode ser ambígua.`);
          }
          tableMap.set(uniqueid, table);
      }
  }

  const definitions: XDFDefinition[] = [];
  const nameCounts: Record<string, number> = {};

  for (const table of xdfTables) {
    const originalName = findNode(table, 'title')?.textContent || getAttr(table, 'name') || 'Tabela Sem Nome';
    
    try {
      if (originalName === 'Tabela Sem Nome') {
          continue;
      }

      const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'zaxis');
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
      
      // Robust transposition detection using the official 'type' attribute.
      const zEmbedInfoNode = findNode(zAxisNode, 'embedinfo', 'EMBEDINFO');
      const embedType = getAttr(zEmbedInfoNode, 'type');
      const isTransposed = embedType === '2';

      const rowsCount = isTransposed ? cols : rows;
      const colsCount = isTransposed ? rows : cols;
      const yAxisId = isTransposed ? 'x' : 'y';
      const xAxisId = isTransposed ? 'y' : 'x';

      const yAxisNode = findNode(table, `XDFAXIS[id="${yAxisId}"]`, `yaxis`);
      const xAxisNode = findNode(table, `XDFAXIS[id="${xAxisId}"]`, `xaxis`);

      let yAxisDef = parseAxis(yAxisNode, tableMap, 'y');
      let xAxisDef = parseAxis(xAxisNode, tableMap, 'x');
      
      const mathNode = findMainMathNode(table, zAxisNode, xAxisNode, yAxisNode);
      const equation = getAttr(mathNode, 'equation', 'Equation') || 'X';
      const varNode = findNode(mathNode, 'var', 'VAR');
      const equationVar = getAttr(varNode, 'id') || 'X';

      if (!yAxisDef || yAxisDef.count !== rowsCount) {
          if (yAxisDef) console.warn(`Contagem do eixo Y para "${originalName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rowsCount}). A inferir o eixo.`);
          yAxisDef = { address: null, count: rowsCount, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'RPM', majorStride: 0, minorStride: 0 };
      }
      
      if (!xAxisDef || xAxisDef.count !== colsCount) {
          if (xAxisDef) console.warn(`Contagem do eixo X para "${originalName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${colsCount}). A inferir o eixo.`);
          xAxisDef = { address: null, count: colsCount, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'Carga', majorStride: 0, minorStride: 0 };
      }

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


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition): (number | string)[] {
  if (!axisDef) return [];
  if (axisDef.staticLabels && axisDef.staticLabels.length > 0) {
      if (axisDef.staticLabels.length !== axisDef.count) {
          console.warn(`O número de etiquetas estáticas (${axisDef.staticLabels.length}) não corresponde à contagem do eixo (${axisDef.count}).`);
      }
      return axisDef.staticLabels.slice(0, axisDef.count);
  }

  if (axisDef.address === null) {
      return Array.from({ length: axisDef.count }, (_, i) => i + 1);
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
  
  const axisData: (number | string)[] = [];
  
  let stride = Math.max(axisDef.majorStride || 0, axisDef.minorStride || 0);
  if (stride === 0) {
      stride = axisDef.dataSize;
  }

  for (let i = 0; i < axisDef.count; i++) {
    const offset = axisDef.address + (i * stride);
    if (offset + axisDef.dataSize > view.byteLength) {
        console.error(`Leitura do eixo fora dos limites. Endereço: ${axisDef.address}, Offset: ${offset}. O eixo pode estar incompleto.`);
        while(axisData.length < axisDef.count) axisData.push(NaN);
        break;
    }
    
    let rawValue;
    if (axisDef.dataSize === 1) rawValue = view.getUint8(offset);
    else if (axisDef.dataSize === 2) rawValue = view.getUint16(offset, !axisDef.isBigEndian);
    else {
        axisData.push(NaN);
        continue;
    }

    try {
        const calculatedValue = equationFunc(rawValue, 0, 0, 0);
        axisData.push(calculatedValue);
    } catch (e) {
        console.error(`Erro ao aplicar a equação de eixo "${axisDef.equation}" no valor raw ${rawValue}: ${e}. A utilizar o valor raw.`);
        axisData.push(rawValue);
    }
  }
  return axisData;
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    xAxis: (number | string)[],
    yAxis: (number | string)[]
): { calculatedMap: MapData, rawMap: MapData } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [] };

  const view = new DataView(binBuffer);
  const calculatedMap: MapData = [];
  const rawMap: MapData = [];
  
  const isPotentiallySignedMap = ['ignição', 'ignition', 'avanço', 'spark', 'timing'].some(kw => def.name.toLowerCase().includes(kw));

  const sanitizedEquation = (def.equation || 'X')
      .replace(/,/g, '.')
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\b(x|value)\b/gi, 'X')
      .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
      .replace(/(X)(\d)/gi, 'X * $2');

  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
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
        const xVal = (c < xAxis.length && typeof xAxis[c] === 'number') ? xAxis[c] : 0;
        const yVal = (r < yAxis.length && typeof yAxis[r] === 'number') ? yAxis[r] : 0;
        
        const calculatedValue = equationFunc(rawValue, xVal, yVal, 0);
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
 * @returns The calculated raw integer value.
 */
export function invertEquation(
  eq: string,
  eqVar: string,
  finalValue: number,
  dataSize: number,
  mapName: string
): number {
  if (finalValue === null || isNaN(finalValue)) {
    throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
  }

  // 1. Create the forward function from the equation string.
  const sanitizedEquation = (eq || 'X')
    .replace(/,/g, '.')
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\b(x|value)\b/gi, 'X') // Standardize variable to 'X'
    .replace(/if\s*\((.*?)\)\s*\{(.*?)\}\s*else\s*\{(.*?)\}/gi, '($1 ? $2 : $3)')
    .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)')
    .replace(/(X)(\d)/gi, 'X * $2');

  let equationFunc: (x: number) => number;
  try {
    equationFunc = new Function('X', `return ${sanitizedEquation}`) as (x: number) => number;
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
  if (sanitizedEquation.trim() === 'X') {
    return Math.round(finalValue);
  }

  // 3. Perform a binary search to find the integer raw value.
  let iterations = 100; // More than enough for a 16-bit range.
  const lowVal = equationFunc(low);
  const highVal = equationFunc(high);

  // Check if the target value is outside the achievable range.
  if ((finalValue < lowVal && finalValue < highVal) || (finalValue > lowVal && finalValue > highVal)) {
    // It's out of range, return the raw value that produces the closest result.
    const diffLow = Math.abs(lowVal - finalValue);
    const diffHigh = Math.abs(highVal - finalValue);
    return diffLow < diffHigh ? low : high;
  }
  
  const isMonotonicIncreasing = highVal > lowVal;

  while (low <= high && iterations > 0) {
    const mid = Math.floor((low + high) / 2);
    if(mid === low || mid === high) break; // Avoid infinite loop if range is small

    const midValue = equationFunc(mid);
    
    // This logic handles both increasing and decreasing monotonic functions.
    if ((isMonotonicIncreasing && midValue < finalValue) || (!isMonotonicIncreasing && midValue > finalValue)) {
      low = mid;
    } else {
      high = mid;
    }
    iterations--;
  }
  
  // After the loop, low and high are very close. Check which is the better fit.
  const diffLow = Math.abs(equationFunc(low) - finalValue);
  const diffHigh = Math.abs(equationFunc(high) - finalValue);
  
  return diffLow < diffHigh ? low : high;
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
