
// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData, OriginalSortOrder } from './types';

function findNode(parent: Element, ...selectors: string[]): Element | null {
  for (const selector of selectors) {
    const node = parent.querySelector(selector);
    if (node) return node;
  }
  return null;
}

// More robust axis parsing to handle different XDF structures
function parseAxis(axisNode: Element | null): AxisDefinition {
  if (!axisNode) return null;

  const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');

  // Try to find count from multiple sources, prioritizing <indexcount>
  const indexCountNode = findNode(axisNode, 'indexcount');
  let count = indexCountNode ? parseInt(indexCountNode.textContent || '0', 10) : 0;
  if (count === 0 && embeddedData) {
      count = parseInt(embeddedData.getAttribute('mmedcolcount') || embeddedData.getAttribute('mmedrowcount') || '0');
  }
  // If no count can be found, it's not a valid axis for our purpose.
  if (count === 0 || isNaN(count)) return null; 

  // Address can be null if it's a static/calculated axis
  const addrStr = embeddedData?.getAttribute('mmedaddress');
  const addr = addrStr ? parseInt(addrStr, 16) : null;
  
  // Data size can be in different places
  const dataSizeBitsStr = embeddedData?.getAttribute('mmedelementsizebits') || findNode(axisNode, 'embedinfo > data_size')?.textContent;
  const dataSizeBits = dataSizeBitsStr ? parseInt(dataSizeBitsStr) : 8; // Default to 8 bits if not found
  
  const isBigEndian = embeddedData?.getAttribute('bigendian') === '1';
  const mathNode = findNode(axisNode, 'math', 'MATH');
  const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
  const label = findNode(axisNode, 'title', 'LABEL')?.textContent || (axisNode.id.toLowerCase() === 'x' ? 'Carga' : 'RPM');
  
  return { 
      address: (addr !== null && !isNaN(addr)) ? addr : null,
      count, 
      dataSize: dataSizeBits / 8, 
      isBigEndian, 
      equation, 
      label 
  };
}

// Stricter XDF parsing
export function parseXDF(xmlString: string): XDFDefinition[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Erro ao analisar o ficheiro XDF.');
  }

  const xdfTables = xmlDoc.querySelectorAll('table, XDFTABLE');
  if (xdfTables.length === 0) {
    throw new Error('Nenhuma tabela encontrada no ficheiro XDF.');
  }

  const definitions: XDFDefinition[] = [];
  for (const table of xdfTables) {
    const tableName = table.querySelector('title')?.textContent || table.getAttribute('name') || 'Tabela Sem Nome';
    if (tableName === 'Tabela Sem Nome') continue;

    try {
      const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
      if (!zAxisNode) continue;
      
      const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
      if (!embeddedData) continue;
      
      const addressStr = embeddedData.getAttribute('mmedaddress');
      // Stricter check: if address is missing, it's not a valid map definition.
      if (!addressStr) continue;
      const address = parseInt(addressStr, 16);

      const binaryWidth = parseInt(embeddedData.getAttribute('mmedcolcount') || '0');
      let rows = parseInt(embeddedData.getAttribute('mmedrowcount') || '0');
      let cols = binaryWidth; // Start with the binary width
      
      const dataSize = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '0');
      const isBigEndian = embeddedData.getAttribute('bigendian') === '1';

      const mathNode = findNode(zAxisNode, 'math', 'MATH');
      const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
      
      const xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
      const yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));

      // **FIX:** Prioritize axis definition count over table definition count to prevent misalignment.
      // This ensures the map dimensions always match the axis dimensions.
      if (yAxisDef?.count) {
          rows = yAxisDef.count;
      }
      if (xAxisDef?.count) {
          cols = xAxisDef.count;
      }

      if (isNaN(address) || isNaN(rows) || isNaN(cols) || isNaN(dataSize) || !equation || rows === 0 || cols === 0 || binaryWidth === 0) continue;

      let inverseEquation = '';
      if (equation.includes('*') && equation.includes('+')) {
        const parts = equation.replace(/ /g, '').split('+');
        const factor = parseFloat(parts[0].replace('X*', ''));
        const offset = parseFloat(parts[1]);
        inverseEquation = `(X - ${offset}) / ${factor}`;
      } else if (equation.includes('*') && equation.includes('-')) {
        const parts = equation.replace(/ /g, '').split('-');
        const factor = parseFloat(parts[0].replace('X*', ''));
        const offset = parseFloat(parts[1]);
        inverseEquation = `(X + ${offset}) / ${factor}`;
      } else if (equation.includes('*')) {
        const factor = parseFloat(equation.replace('X*', ''));
        inverseEquation = `X / ${factor}`;
      } else if (equation.includes('/')) {
        const factor = parseFloat(equation.replace('X/', ''));
        inverseEquation = `X * ${factor}`;
      } else if (equation.trim().toUpperCase() === 'X') {
        inverseEquation = 'X';
      }

      definitions.push({ name: tableName, address, rows, cols, binaryWidth, dataSize: dataSize / 8, isBigEndian, equation, inverseEquation, xAxisDef, yAxisDef });
    } catch (e) {
      console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
    }
  }
  return definitions;
}

export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition): number[] {
  if (!axisDef || !binBuffer || axisDef.address === null) return [];
  
  const view = new DataView(binBuffer);
  const equationFunc = new Function('X', `return ${axisDef.equation}`);
  const axisData = [];
  
  for (let i = 0; i < axisDef.count; i++) {
    const offset = axisDef.address + (i * axisDef.dataSize);
    let rawValue;
    if (offset + axisDef.dataSize > view.byteLength) {
        console.error(`Leitura do eixo fora dos limites. Offset: ${offset}`);
        continue;
    }
    if (axisDef.dataSize === 1) rawValue = view.getUint8(offset);
    else if (axisDef.dataSize === 2) rawValue = view.getUint16(offset, !axisDef.isBigEndian);
    else continue;
    axisData.push(equationFunc(rawValue));
  }
  return axisData;
}

export function readMapFromBin(binBuffer: ArrayBuffer, def: XDFDefinition): MapData {
  if (!def || !binBuffer) return [];

  const view = new DataView(binBuffer);
  const map: MapData = [];
  const equationFunc = new Function('X', `return ${def.equation}`);

  for (let r = 0; r < def.rows; r++) {
    const row: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * def.binaryWidth + c) * def.dataSize;
      if (offset + def.dataSize > view.byteLength) {
        console.error(`Leitura do mapa fora dos limites. Offset: ${offset}`);
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
      row.push(equationFunc(rawValue));
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
    return checksum.toString(16);
}

export function saveBinFile(binBuffer: ArrayBuffer, correctedSortedMap: MapData, def: XDFDefinition, sortOrder: OriginalSortOrder) {
    if (!correctedSortedMap || !binBuffer || !def) {
        throw new Error('Faltam dados para guardar o ficheiro BIN.');
    }
    if (!def.inverseEquation) {
        throw new Error('Não é possível guardar: a equação inversa não é suportada ou definida para este mapa.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    const inverseEquationFunc = new Function('X', `return ${def.inverseEquation}`);

    // Iterate through the corrected (and sorted) map
    for (let sortedY = 0; sortedY < def.rows; sortedY++) {
        for (let sortedX = 0; sortedX < def.cols; sortedX++) {
            
            // Find the original position in the BIN file for this sorted cell
            const originalRowIndex = sortOrder.y[sortedY]?.index;
            const originalColIndex = sortOrder.x[sortedX]?.index;

            if (originalRowIndex === undefined || originalColIndex === undefined) {
                console.warn(`Could not find original index for sorted cell [${sortedY}, ${sortedX}]. Skipping.`);
                continue;
            }

            const valueToWrite = correctedSortedMap[sortedY]?.[sortedX];

            // If the cell has no value (e.g., it was null in the original and not corrected), skip it.
            if (valueToWrite === null || valueToWrite === undefined || isNaN(valueToWrite)) {
                continue;
            }

            // Calculate the flat address in the BIN file based on original row/col order
            const offset = def.address + (originalRowIndex * def.binaryWidth + originalColIndex) * def.dataSize;
            
            if (offset + def.dataSize > view.byteLength) {
                console.error(`Escrita do mapa fora dos limites. Offset: ${offset}`);
                continue;
            }

            const rawValue = Math.round(inverseEquationFunc(valueToWrite));

            if (isNaN(rawValue)) {
                console.warn(`Calculated raw value is NaN for value ${valueToWrite}. Skipping cell.`);
                continue;
            }

            // Write the new raw value to the buffer
            if (def.dataSize === 1) {
                view.setUint8(offset, rawValue);
            } else if (def.dataSize === 2) {
                view.setUint16(offset, rawValue, !def.isBigEndian);
            }
        }
    }
    
    const blob = new Blob([newBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TuneAssist_AI_afinado.bin';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


    
