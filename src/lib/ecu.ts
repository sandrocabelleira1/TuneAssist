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

function parseAxis(axisNode: Element | null): AxisDefinition {
  if (!axisNode) return null;
  const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
  if (!embeddedData) return null;

  const addr = parseInt(embeddedData.getAttribute('mmedaddress') || '0', 16);
  const count = parseInt(embeddedData.getAttribute('mmedcolcount') || embeddedData.getAttribute('mmedrowcount') || '0');
  const dataSizeBits = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '0');
  const isBigEndian = embeddedData.getAttribute('bigendian') === '1';
  const mathNode = findNode(axisNode, 'math', 'MATH');
  const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
  const label = findNode(axisNode, 'title', 'LABEL')?.textContent || (axisNode.id.toLowerCase() === 'x' ? 'Load' : 'RPM');
  
  if (isNaN(addr) || isNaN(count) || isNaN(dataSizeBits) || !equation) return null;

  return { address: addr, count, dataSize: dataSizeBits / 8, isBigEndian, equation, label };
}

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

      const address = parseInt(embeddedData.getAttribute('mmedaddress') || '0', 16);
      const rows = parseInt(embeddedData.getAttribute('mmedrowcount') || '0');
      const cols = parseInt(embeddedData.getAttribute('mmedcolcount') || '0');
      const dataSize = parseInt(embeddedData.getAttribute('mmedelementsizebits') || '0');
      const isBigEndian = embeddedData.getAttribute('bigendian') === '1';

      const mathNode = findNode(zAxisNode, 'math', 'MATH');
      const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';

      if (isNaN(address) || isNaN(rows) || isNaN(cols) || isNaN(dataSize) || !equation) continue;

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

      const xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
      const yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));

      definitions.push({ name: tableName, address, rows, cols, dataSize: dataSize / 8, isBigEndian, equation, inverseEquation, xAxisDef, yAxisDef });
    } catch (e) {
      console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
    }
  }
  return definitions.filter(d => d.name && d.rows > 0 && d.cols > 0);
}

export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition): number[] {
  if (!axisDef || !binBuffer) return [];
  
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
      const offset = def.address + (r * def.cols + c) * def.dataSize;
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

export function saveBinFile(binBuffer: ArrayBuffer, mapData: MapData, def: XDFDefinition, sortOrder: OriginalSortOrder) {
    if (!mapData || !binBuffer || !def) {
        throw new Error('Faltam dados para guardar o ficheiro BIN.');
    }
    if (!def.inverseEquation) {
        throw new Error('Não é possível guardar: a equação inversa não é suportada ou definida para este mapa.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    const inverseEquationFunc = new Function('X', `return ${def.inverseEquation}`);
    
    // Unsort map data before writing
    let mapToWrite: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));
    for (let r = 0; r < sortOrder.y.length; r++) {
        for (let c = 0; c < sortOrder.x.length; c++) {
            const originalYIndex = sortOrder.y[r].index;
            const originalXIndex = sortOrder.x[c].index;
            if(mapData[r] && mapData[r][c] !== null) {
              mapToWrite[originalYIndex][originalXIndex] = mapData[r][c];
            }
        }
    }
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const realValue = mapToWrite[r][c];
            if(realValue === null || realValue === undefined) continue;

            const offset = def.address + (r * def.cols + c) * def.dataSize;
            const rawValue = Math.round(inverseEquationFunc(realValue));
            
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
