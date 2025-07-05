
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
function findNode(parent: Element, ...selectors: string[]): Element | null {
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

    // IMPORTANT: For parsing an axis's own properties, we need to search its *direct children*, not all descendants.
    // We create a non-recursive finder function for this scope.
    const findDirectChild = (parent: Element, ...selectors: string[]) => {
        for (const selector of selectors) {
            for (const child of Array.from(parent.children)) {
                 if (child.tagName.toLowerCase() === selector.toLowerCase()) {
                    return child;
                }
            }
        }
        return null;
    }

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
            if (count === 0) return { staticLabels, count: labels.length, label: localLabel || defaultLabel, equation: 'X', equationVar: 'X' } as AxisDefinition;
            return { staticLabels, count, label: localLabel || defaultLabel, equation: 'X', equationVar: 'X' } as AxisDefinition;
        }
    }

    const embeddedData = findDirectChild(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const addrStr = getAttr(embeddedData, 'mmedaddress');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    const dataSizeBitsStr = getAttr(embeddedData, 'mmedelementsizebits') || findDirectChild(embedInfoNode || axisNode, 'data_size', 'DATA_SIZE')?.textContent || '8';
    const dataSizeBits = parseInt(dataSizeBitsStr, 10);
    const isBigEndian = getAttr(embeddedData, 'bigendian') === '1';
    
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
        label: localLabel || defaultLabel,
    };
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

      let mathNode = findNode(table, 'math[id="z"]', 'MATH[id="z"]');
      if (!mathNode) {
          mathNode = findNode(table, 'math', 'MATH');
      }
      if (!mathNode) {
          mathNode = findNode(zAxisNode, 'math', 'MATH');
      }

      const equation = getAttr(mathNode || zAxisNode, 'equation', 'Equation') || 'X';
      const varNode = findNode(mathNode || zAxisNode, 'var', 'VAR');
      const equationVar = getAttr(varNode, 'id') || 'X';


      if (isNaN(address) || rows === 0 || cols === 0) {
        console.warn(`A tabela "${originalName}" foi ignorada: dimensões ou endereço do eixo Z inválidos.`);
        continue;
      }
      
      const isTransposed = rows < cols;
      const rowsCount = isTransposed ? cols : rows;
      const colsCount = isTransposed ? rows : cols;
      const yAxisId = isTransposed ? 'x' : 'y';
      const xAxisId = isTransposed ? 'y' : 'x';

      let yAxisDef = parseAxis(findNode(table, `XDFAXIS[id="${yAxisId}"]`, `yaxis`), tableMap, 'y');
      let xAxisDef = parseAxis(findNode(table, `XDFAXIS[id="${xAxisId}"]`, `xaxis`), tableMap, 'x');
      
      if (!yAxisDef || yAxisDef.count !== rowsCount) {
          if (yAxisDef) console.warn(`Contagem do eixo Y para "${originalName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rowsCount}). A inferir o eixo.`);
          yAxisDef = { address: null, count: rowsCount, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'RPM' };
      }
      
      if (!xAxisDef || xAxisDef.count !== colsCount) {
          if (xAxisDef) console.warn(`Contagem do eixo X para "${originalName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${colsCount}). A inferir o eixo.`);
          xAxisDef = { address: null, count: colsCount, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'Carga' };
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
  const sanitizedEquation = (axisDef.equation || 'X')
      .replace(/,/g, '.')
      .replace(new RegExp(`\\b${axisDef.equationVar || 'X'}\\b|\\bVALUE\\b`, 'gi'), 'X')
      // Convert `if (cond) { A } else { B }` to ternary `(cond ? A : B)`
      .replace(/if\s*\((.+?)\)\s*\{(.+?)\}\s*else\s*\{(.+?)\}/gi, '($1 ? $2 : $3)')
      // Convert `IF(cond, A, B)` to ternary `(cond ? A : B)`
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)');

  let equationFunc: Function;
  try {
      equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
      console.error(`Equação de eixo inválida "${axisDef.equation}" para "${axisDef.label}": ${e}. A utilizar valores "crus".`);
      equationFunc = (X: number) => X;
  }
  
  const axisData: (number | string)[] = [];
  
  for (let i = 0; i < axisDef.count; i++) {
    const offset = axisDef.address + (i * axisDef.dataSize);
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


export function readMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    xAxis: (number | string)[],
    yAxis: (number | string)[]
): MapData {
  if (!def || !binBuffer) return [];

  const view = new DataView(binBuffer);
  const map: MapData = [];
  
  const sanitizedEquation = (def.equation || 'X')
      .replace(/,/g, '.')
      .replace(new RegExp(`\\b${def.equationVar || 'X'}\\b|\\bVALUE\\b`, 'gi'), 'X')
      // Convert `if (cond) { A } else { B }` to ternary `(cond ? A : B)`
      .replace(/if\s*\((.+?)\)\s*\{(.+?)\}\s*else\s*\{(.+?)\}/gi, '($1 ? $2 : $3)')
      // Convert `IF(cond, A, B)` to ternary `(cond ? A : B)`
      .replace(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/gi, '($1 ? $2 : $3)');

  let equationFunc: Function;
  try {
    equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    console.error(`Equação de mapa inválida "${def.equation}" (sanitizada para "${sanitizedEquation}") para "${def.name}": ${e}. A utilizar valores "crus".`);
    equationFunc = (X: number) => X;
  }

  for (let r = 0; r < def.rows; r++) {
    const row: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * def.cols + c) * def.dataSize;
      if (offset + def.dataSize > view.byteLength) {
        console.error(`Leitura do mapa fora dos limites para "${def.name}". Offset: ${offset}`);
        row.push(null);
        continue;
      }
      
      let rawValue;
      if (def.dataSize === 1) rawValue = view.getUint8(offset);
      else if (def.dataSize === 2) rawValue = view.getUint16(offset, !def.isBigEndian);
      else {
          row.push(null);
          continue;
      }

      try {
        const xVal = (c < xAxis.length && typeof xAxis[c] === 'number') ? xAxis[c] : 0;
        const yVal = (r < yAxis.length && typeof yAxis[r] === 'number') ? yAxis[r] : 0;
        
        const calculatedValue = equationFunc(rawValue, xVal, yVal, 0);
        row.push(calculatedValue);

      } catch(e) {
          console.error(`Erro ao aplicar equação "${sanitizedEquation}" na célula [${r},${c}] do mapa "${def.name}": ${e}. A utilizar o valor "cru".`);
          row.push(rawValue);
      }
    }
    map.push(row);
  }
  return map;
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

function invertEquation(eq: string, eqVar: string, value: number): number {
    if (value === null || isNaN(value)) {
        throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
    }
    
    const cleanEq = (eq || 'X')
        .replace(/,/g, '.')
        .replace(new RegExp(`\\b${eqVar || 'X'}\\b|\\bVALUE\\b`, 'gi'), 'X');

    const ifMatch = cleanEq.match(/IF\((.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)/i);
    if (ifMatch) {
      console.warn(`A inversão da equação não é suportada para a função IF: "${eq}". A tentar escrever o valor diretamente.`);
      return value;
    }
    
    if (cleanEq.trim() === 'X') return value;
    if (cleanEq.trim() === '-X') return -value;

    const pattern = /^\s*(-?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([+\-*/])\s*X\s*|\s*X\s*([+\-*/])\s*(-?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*$/;
    const match = cleanEq.match(pattern);
    
    if (!match) {
        const mulDivPattern = /X\s*([*/])\s*(-?\d*\.?\d+(?:[eE][+-]?\d+)?)|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([*/])\s*X/;
        const mulDivMatch = cleanEq.match(mulDivPattern);
        if (mulDivMatch) {
            let C: number, operator: string, varIsFirst: boolean;
            if(mulDivMatch[1]) {
                varIsFirst = true;
                operator = mulDivMatch[1];
                C = parseFloat(mulDivMatch[2]);
            } else {
                varIsFirst = false;
                C = parseFloat(mulDivMatch[3]);
                operator = mulDivMatch[4];
            }
             if (isNaN(C)) throw new Error(`Não foi possível analisar a constante na equação "${eq}"`);
             switch (operator) {
                case '*':
                    if (C === 0) return 0;
                    return value / C;
                case '/':
                     if (varIsFirst) {
                        return value * C;
                    } else {
                        if (value === 0) throw new Error(`Divisão por zero ao inverter a equação "${eq}" com o valor 0.`);
                        return C / value;
                    }
            }
        }
        throw new Error(`A inversão da equação não é suportada para a complexidade de: "${eq}".`);
    }
    
    let C: number, operator: string, varIsFirst: boolean;

    if (match[3] !== undefined) {
        varIsFirst = true;
        operator = match[3];
        C = parseFloat(match[4]);
    } else {
        varIsFirst = false;
        C = parseFloat(match[1]);
        operator = match[2];
    }
    
    if (isNaN(C)) throw new Error(`Não foi possível analisar a constante na equação "${eq}"`);

    switch (operator) {
        case '+':
            return value - C;
        case '-':
            return varIsFirst ? value + C : C - value;
        case '*':
            if (C === 0) return 0;
            return value / C;
        case '/':
            if (varIsFirst) {
                return value * C;
            } else {
                if (value === 0) throw new Error(`Divisão por zero ao inverter a equação "${eq}" com o valor 0.`);
                return C / value;
            }
    }
    
    throw new Error(`Operador desconhecido "${operator}" na equação "${eq}".`);
}


export function writeMapToBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    mapData: MapData
): ArrayBuffer {
    if (!def || !binBuffer || !mapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const finalValue = mapData[r][c];
            if (finalValue === null) {
                continue;
            }

            try {
                const rawValue = invertEquation(def.equation, def.equationVar, finalValue);
                const intValue = Math.round(rawValue);
                const offset = def.address + (r * def.cols + c) * def.dataSize;

                if (offset + def.dataSize > view.byteLength) {
                    console.error(`Escrita do mapa fora dos limites. Offset: ${offset}. A saltar.`);
                    continue;
                }
                
                if (def.dataSize === 1) {
                    view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
                } else if (def.dataSize === 2) {
                    view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), !def.isBigEndian);
                }
            } catch (e) {
                 const errorMsg = e instanceof Error ? e.message : String(e);
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${errorMsg}`);
            }
        }
    }
    
    return newBuffer;
}
