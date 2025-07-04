// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData } from './types';

function findNode(parent: Element, ...selectors: string[]): Element | null {
  for (const selector of selectors) {
    const node = parent.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function parseAxis(axisNode: Element | null, tableMap: Map<string, Element>): AxisDefinition {
    if (!axisNode) return null;

    const localCountNode = findNode(axisNode, 'indexcount', 'INDEXCOUNT');
    const count = localCountNode ? parseInt(localCountNode.textContent || '0', 10) : 0;
    
    const localLabel = (
        findNode(axisNode, 'units', 'UNITS')?.textContent ||
        findNode(axisNode, 'title', 'TITLE')?.textContent ||
        ''
    ).trim();

    const embedInfoNode = findNode(axisNode, 'embedinfo', 'EMBEDINFO');
    const isLinked = embedInfoNode?.getAttribute('type') === '3';

    if (isLinked) {
        const linkId = embedInfoNode.getAttribute('linkobjid');
        const linkedTable = linkId ? tableMap.get(linkId) : null;
        
        // A linked axis sources its data from the Z-axis of another table.
        const linkedZAxis = linkedTable ? findNode(linkedTable, 'XDFAXIS[id="z"]', 'zaxis') : null;
        if (linkedZAxis) {
            const sourceEmbeddedData = findNode(linkedZAxis, 'embeddeddata', 'EMBEDDEDDATA');
            if (sourceEmbeddedData) {
                const sourceAddrStr = sourceEmbeddedData.getAttribute('mmedaddress');
                const sourceAddr = sourceAddrStr ? parseInt(sourceAddrStr, 16) : null;
                const sourceDataSizeBitsStr = sourceEmbeddedData.getAttribute('mmedelementsizebits') || '8';
                const sourceDataSize = parseInt(sourceDataSizeBitsStr, 10) / 8;
                const sourceIsBigEndian = sourceEmbeddedData.getAttribute('bigendian') === '1';

                const sourceMathNode = findNode(linkedZAxis, 'math', 'MATH');
                const sourceEquation = sourceMathNode?.getAttribute('equation') || 'X';
                const sourceVarNode = findNode(sourceMathNode || linkedZAxis, 'VAR', 'var');
                const sourceEquationVar = sourceVarNode?.getAttribute('id') || 'X';
                
                // For 1D tables used as axes, rows or cols can define the count
                const linkedRows = parseInt(sourceEmbeddedData.getAttribute('mmedrowcount') || '0');
                const linkedCols = parseInt(sourceEmbeddedData.getAttribute('mmedcolcount') || '0');
                const sourceCount = Math.max(linkedRows, linkedCols);

                if (sourceAddr !== null && !isNaN(sourceAddr)) {
                    return {
                        address: sourceAddr,
                        count: count > 0 ? count : sourceCount, // Prefer local count, fallback to linked table's count
                        dataSize: sourceDataSize,
                        isBigEndian: sourceIsBigEndian,
                        equation: sourceEquation.replace(new RegExp(`\\b${sourceEquationVar}\\b`, 'ig'), 'X'),
                        equationVar: 'X',
                        label: localLabel || (axisNode.id.toLowerCase().includes('x') ? 'Carga' : 'RPM'),
                    };
                }
            }
        }
    }

    // --- Fallback to standard parsing (static labels or direct address) ---
    const labelNodes = axisNode.querySelectorAll('label, LABEL');
    let staticLabels: (string | number)[] | undefined = undefined;
    if (labelNodes.length > 0) {
        const labels = Array.from(labelNodes).map(l => l.getAttribute('value') || '');
        if (labels.length > 0) {
            staticLabels = labels.map(l => {
                const num = parseFloat(l);
                return isNaN(num) ? l.trim() : num;
            });
            // If count wasn't defined, infer from labels
            if (count === 0) return { staticLabels, count: labels.length, label: localLabel } as AxisDefinition;
            return { staticLabels, count, label: localLabel } as AxisDefinition;
        }
    }

    const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const addrStr = embeddedData?.getAttribute('mmedaddress');
    const addr = addrStr ? parseInt(addrStr, 16) : null;
    const dataSizeBitsStr = embeddedData?.getAttribute('mmedelementsizebits') || findNode(embedInfoNode || axisNode, 'data_size', 'DATA_SIZE')?.textContent || '8';
    const dataSizeBits = parseInt(dataSizeBitsStr, 10);
    const isBigEndian = embeddedData?.getAttribute('bigendian') === '1';
    
    const mathNode = findNode(axisNode, 'math', 'MATH');
    const equation = mathNode?.getAttribute('equation') || 'X';
    const varNode = findNode(mathNode || axisNode, 'VAR', 'var');
    const equationVar = varNode?.getAttribute('id') || 'X';

    if (count === 0) return null;

    return { 
        address: (addr !== null && !isNaN(addr)) ? addr : null,
        count, 
        dataSize: dataSizeBits / 8, 
        isBigEndian, 
        equation: equation.replace(new RegExp(`\\b${equationVar}\\b`, 'ig'), 'X'),
        equationVar: 'X',
        label: localLabel || (axisNode.id.toLowerCase().includes('x') ? 'Carga' : 'RPM'),
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

  const xdfTables = xmlDoc.querySelectorAll('XDFTABLE, table');
  if (xdfTables.length === 0) {
    throw new Error('Nenhuma definição de <XDFTABLE> ou <table> foi encontrada no ficheiro.');
  }
  
  // First pass: create a lookup map of all tables by their uniqueid for linked axis resolution.
  const tableMap = new Map<string, Element>();
  for (const table of xdfTables) {
      const uniqueid = table.getAttribute('uniqueid');
      // Only add tables with a valid, non-default ID to the map.
      // Ignore "0x0" or "0" as they are likely default/null values and not unique.
      if (uniqueid && uniqueid !== '0x0' && uniqueid !== '0') {
          if (tableMap.has(uniqueid)) {
            // Warn about duplicates but still add, allowing the last one to be used.
            // This mirrors some tools' behavior but is not ideal.
            console.warn(`ID único de tabela duplicado encontrado: ${uniqueid}. A ligação a esta tabela pode ser ambígua.`);
          }
          tableMap.set(uniqueid, table);
      }
  }

  const definitions: XDFDefinition[] = [];
  const nameCounts: Record<string, number> = {};

  // Second pass: parse each table definition
  for (const table of xdfTables) {
    const originalName = table.querySelector('title')?.textContent || table.getAttribute('name') || 'Tabela Sem Nome';
    
    // Add a try-catch block to make parsing robust. One bad table shouldn't stop the whole process.
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
      
      const zAddressStr = zEmbeddedData.getAttribute('mmedaddress');
      if (!zAddressStr) {
          console.warn(`A tabela "${originalName}" foi ignorada: o eixo Z não tem endereço (mmedaddress).`);
          continue;
      }
      const address = parseInt(zAddressStr, 16);
      const rows = parseInt(zEmbeddedData.getAttribute('mmedrowcount') || '0');
      const cols = parseInt(zEmbeddedData.getAttribute('mmedcolcount') || '0');
      const dataSize = parseInt(zEmbeddedData.getAttribute('mmedelementsizebits') || '8') / 8;
      const isBigEndian = zEmbeddedData.getAttribute('bigendian') === '1';

      const mathNode = findNode(zAxisNode, 'math', 'MATH');
      const equation = mathNode?.getAttribute('equation') || 'X';
      const varNode = findNode(mathNode || zAxisNode, 'VAR', 'var');
      const equationVar = varNode?.getAttribute('id') || 'X';

      if (isNaN(address) || rows === 0 || cols === 0) {
        console.warn(`A tabela "${originalName}" foi ignorada: dimensões ou endereço do eixo Z inválidos.`);
        continue;
      }

      let xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'), tableMap);
      let yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'), tableMap);

      if (!xAxisDef || xAxisDef.count !== cols) {
          if (xAxisDef) console.warn(`Contagem do eixo X para "${originalName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${cols}). A inferir o eixo.`);
          xAxisDef = { address: null, count: cols, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'Carga (Inferido)' };
      }
      
      if (!yAxisDef || yAxisDef.count !== rows) {
          if (yAxisDef) console.warn(`Contagem do eixo Y para "${originalName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rows}). A inferir o eixo.`);
          yAxisDef = { address: null, count: rows, dataSize: 2, isBigEndian: false, equation: 'X', equationVar: 'X', label: 'RPM (Inferido)' };
      }

      // Generate a unique name for the map before pushing.
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
        rows, 
        cols, 
        dataSize, 
        isBigEndian, 
        equation: equation.replace(new RegExp(`\\b${equationVar}\\b`, 'ig'), 'X'),
        equationVar: 'X',
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
  // The equation is already sanitized to use 'X' during parsing.
  const sanitizedEquation = axisDef.equation;

  let equationFunc;
  try {
      equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
      if (e instanceof SyntaxError) {
          // If it's a syntax error, it's not a valid JS equation. Treat it as a text label.
          console.warn(`A equação do eixo "${axisDef.equation}" foi tratada como uma etiqueta de texto devido a um erro de sintaxe.`);
          return Array.from({ length: axisDef.count }, () => axisDef.equation);
      }
      console.error(`Equação do eixo inválida "${axisDef.equation}": ${e}`);
      return Array.from({ length: axisDef.count }, () => NaN);
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
    try {
        if (axisDef.dataSize === 1) rawValue = view.getUint8(offset);
        else if (axisDef.dataSize === 2) rawValue = view.getUint16(offset, !axisDef.isBigEndian);
        else {
            axisData.push(NaN);
            continue;
        }
        axisData.push(equationFunc(rawValue, 0, 0, 0));
    } catch (e) {
      if (e instanceof ReferenceError) {
        console.warn(`A equação do eixo "${axisDef.equation}" parece ser uma etiqueta de texto. A usá-la diretamente.`);
        axisData.push(axisDef.equation);
      } else {
        console.error(`Erro ao aplicar equação do eixo: ${e}`);
        axisData.push(NaN);
      }
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
  
  // The equation is already sanitized to use 'X' during parsing.
  const sanitizedEquation = def.equation;
  
  let equationFunc;
  try {
    equationFunc = new Function('X', 'x', 'y', 'z', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    if (e instanceof SyntaxError) {
        console.warn(`A equação do mapa "${def.equation}" foi tratada como inválida devido a um erro de sintaxe. Os valores do mapa serão nulos.`);
        equationFunc = () => null;
    } else {
        console.error(`Equação do mapa inválida "${def.equation}": ${e}`);
        // Create a function that always returns null if the equation is invalid
        equationFunc = () => null;
    }
  }

  for (let r = 0; r < def.rows; r++) {
    const row: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * def.cols + c) * def.dataSize;
      if (offset + def.dataSize > view.byteLength) {
        console.error(`Leitura do mapa fora dos limites. Offset: ${offset}`);
        row.push(null);
        continue;
      }
      let rawValue;
      try {
        if (def.dataSize === 1) rawValue = view.getUint8(offset);
        else if (def.dataSize === 2) rawValue = view.getUint16(offset, !def.isBigEndian);
        else {
            row.push(null);
            continue;
        }

        const xVal = (c < xAxis.length && typeof xAxis[c] === 'number') ? xAxis[c] : 0;
        const yVal = (r < yAxis.length && typeof yAxis[r] === 'number') ? yAxis[r] : 0;

        row.push(equationFunc(rawValue, xVal, yVal, 0));
      } catch(e) {
        if (e instanceof ReferenceError) {
          console.warn(`A equação do mapa "${def.equation}" parece ser uma etiqueta de texto. A usá-la diretamente.`);
          row.push(null); // Or handle as text if needed
        } else {
          console.error(`Erro ao aplicar equação do mapa: ${e}`);
          row.push(null);
        }
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


function invertEquation(eq: string, value: number): number {
  if (value === null || isNaN(value)) {
    throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
  }
  
  eq = eq.trim();
  // Handle simple case: just the variable
  if (eq.toUpperCase() === 'X') return value;

  // Pattern: X [op] C  e.g., X * 0.1
  const matchXFirst = eq.match(/^X\s*([*\/+-])\s*([\d\.]+)$/i);
  if (matchXFirst) {
    const op = matchXFirst[1];
    const C = parseFloat(matchXFirst[2]);
    if (isNaN(C)) throw new Error(`Constante inválida na equação: ${matchXFirst[2]}`);
    if (op === '*') return value / C;
    if (op === '/') return value * C;
    if (op === '+') return value - C;
    if (op === '-') return value + C;
  }

  // Pattern: C [op] X e.g., 1023 - X
  const matchCFirst = eq.match(/^([\d\.]+)\s*([*\/+-])\s*X$/i);
  if (matchCFirst) {
    const C = parseFloat(matchCFirst[1]);
    const op = matchCFirst[2];
    if (isNaN(C)) throw new Error(`Constante inválida na equação: ${matchCFirst[1]}`);
    // Commutative cases
    if (op === '*') return value / C;
    if (op === '+') return value - C;
    // Non-commutative cases
    if (op === '-') return C - value; // e.g. value = C - X  =>  X = C - value
    if (op === '/') return C / value; // e.g. value = C / X  =>  X = C / value
  }

  throw new Error(`A inversão da equação não é suportada para a expressão: "${eq}"`);
}


export function writeMapToBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    mapData: MapData
): ArrayBuffer {
    if (!def || !binBuffer || !mapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const newBuffer = binBuffer.slice(0); // Create a mutable copy
    const view = new DataView(newBuffer);
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const finalValue = mapData[r][c];
            if (finalValue === null) {
                // If a cell is null (e.g. invalid input), we skip writing to it
                // to avoid corrupting the BIN with NaN values.
                continue;
            }

            // Invert the equation to find the raw value to write
            const rawValue = invertEquation(def.equation, finalValue);
            
            // Round to nearest integer, as we'll be writing integer types.
            const intValue = Math.round(rawValue);
            
            const offset = def.address + (r * def.cols + c) * def.dataSize;

            if (offset + def.dataSize > view.byteLength) {
                console.error(`Escrita do mapa fora dos limites. Offset: ${offset}. A saltar.`);
                continue;
            }

            try {
                if (def.dataSize === 1) {
                    // Clamp value to 8-bit range
                    view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
                } else if (def.dataSize === 2) {
                    // Clamp value to 16-bit range
                    view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), !def.isBigEndian);
                }
            } catch (e) {
                console.error(`Erro ao escrever no buffer no offset ${offset}:`, e);
                throw new Error(`Erro ao escrever no buffer no offset ${offset}.`);
            }
        }
    }
    
    return newBuffer;
}
