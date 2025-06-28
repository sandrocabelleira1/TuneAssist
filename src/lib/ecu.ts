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

function parseAxis(axisNode: Element | null): AxisDefinition {
  if (!axisNode) return null;

  const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');

  const indexCountNode = findNode(axisNode, 'indexcount');
  let count = indexCountNode ? parseInt(indexCountNode.textContent || '0', 10) : 0;
  
  const labelNodes = axisNode.querySelectorAll('label, LABEL');
  let staticLabels: (string | number)[] | undefined = undefined;
  if (labelNodes.length > 0) {
    const labels = Array.from(labelNodes).map(l => l.getAttribute('value') || '');
    if (labels.length > 0) {
      if (count === 0) {
        count = labels.length;
      }
      staticLabels = labels.map(l => {
        const num = parseFloat(l);
        return isNaN(num) ? l.trim() : num;
      });
    }
  }

  if (count === 0 && embeddedData) {
      const rowCount = parseInt(embeddedData.getAttribute('mmedrowcount') || '0');
      const colCount = parseInt(embeddedData.getAttribute('mmedcolcount') || '0');
      // Infer count from a 1D embedded data structure
      count = Math.max(rowCount, colCount);
  }

  const addrStr = embeddedData?.getAttribute('mmedaddress');
  const addr = addrStr ? parseInt(addrStr, 16) : null;
  
  const dataSizeBitsStr = embeddedData?.getAttribute('mmedelementsizebits') || findNode(axisNode, 'embedinfo > data_size')?.textContent;
  const dataSizeBits = dataSizeBitsStr ? parseInt(dataSizeBitsStr) : 8;
  
  const isBigEndian = embeddedData?.getAttribute('bigendian') === '1';
  const mathNode = findNode(axisNode, 'math', 'MATH');
  const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
  
  const label = (
      findNode(axisNode, 'units')?.textContent ||
      findNode(axisNode, 'title')?.textContent ||
      ''
  ).trim();
  
  if (count === 0 || isNaN(count)) return null; 

  return { 
      address: (addr !== null && !isNaN(addr)) ? addr : null,
      count, 
      dataSize: dataSizeBits / 8, 
      isBigEndian, 
      equation, 
      label: label || (axisNode.id.toLowerCase().includes('x') ? 'Carga' : 'RPM'),
      staticLabels
  };
}


export function parseXDF(xmlString: string): XDFDefinition[] {
  if (typeof DOMParser === 'undefined') {
    // Avoid running on the server
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

  const definitions: XDFDefinition[] = [];
  const nameCounts: Record<string, number> = {};

  for (const table of xdfTables) {
    const originalName = table.querySelector('title')?.textContent || table.getAttribute('name') || 'Tabela Sem Nome';
    if (originalName === 'Tabela Sem Nome') continue;
    
    let tableName = originalName;
    if (nameCounts[originalName]) {
        nameCounts[originalName]++;
        tableName = `${originalName} (${nameCounts[originalName]})`;
    } else {
        nameCounts[originalName] = 1;
    }

    try {
      const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]', 'zaxis');
      if (!zAxisNode) {
          console.warn(`A tabela "${tableName}" foi ignorada: não foi possível encontrar a definição do eixo Z.`);
          continue;
      }
      
      const zEmbeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
      if (!zEmbeddedData) {
          console.warn(`A tabela "${tableName}" foi ignorada: o eixo Z não tem <embeddeddata>.`);
          continue;
      }
      
      const zAddressStr = zEmbeddedData.getAttribute('mmedaddress');
      if (!zAddressStr) {
          console.warn(`A tabela "${tableName}" foi ignorada: o eixo Z não tem endereço (mmedaddress).`);
          continue;
      }
      const address = parseInt(zAddressStr, 16);
      const rows = parseInt(zEmbeddedData.getAttribute('mmedrowcount') || '0');
      const cols = parseInt(zEmbeddedData.getAttribute('mmedcolcount') || '0');
      const dataSize = parseInt(zEmbeddedData.getAttribute('mmedelementsizebits') || '8') / 8;
      const isBigEndian = zEmbeddedData.getAttribute('bigendian') === '1';

      const mathNode = findNode(zAxisNode, 'math', 'MATH');
      const equation = mathNode?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';

      if (isNaN(address) || rows === 0 || cols === 0) {
        console.warn(`A tabela "${tableName}" foi ignorada: dimensões ou endereço do eixo Z inválidos.`);
        continue;
      }

      let xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
      let yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));

      // Sanity check and inference for axes, as requested.
      if (!xAxisDef || xAxisDef.count !== cols) {
          if (xAxisDef) console.warn(`Contagem do eixo X para "${tableName}" (${xAxisDef.count}) não corresponde às colunas do mapa (${cols}). A inferir o eixo.`);
          xAxisDef = { address: null, count: cols, dataSize: 2, isBigEndian: false, equation: 'X', label: 'Carga (Inferido)' };
      }
      
      if (!yAxisDef || yAxisDef.count !== rows) {
          if (yAxisDef) console.warn(`Contagem do eixo Y para "${tableName}" (${yAxisDef.count}) não corresponde às linhas do mapa (${rows}). A inferir o eixo.`);
          yAxisDef = { address: null, count: rows, dataSize: 2, isBigEndian: false, equation: 'X', label: 'RPM (Inferido)' };
      }

      definitions.push({ 
        name: tableName, 
        address, 
        rows, 
        cols, 
        dataSize, 
        isBigEndian, 
        equation, 
        xAxisDef, 
        yAxisDef 
      });
    } catch (e) {
      console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
    }
  }
  return definitions;
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition): (number | string)[] {
  // If axis is defined by static labels, just return them.
  if (axisDef?.staticLabels && axisDef.staticLabels.length > 0) {
      if (axisDef.staticLabels.length !== axisDef.count) {
          console.warn(`O número de etiquetas estáticas (${axisDef.staticLabels.length}) não corresponde à contagem do eixo (${axisDef.count}).`);
      }
      return axisDef.staticLabels;
  }

  // If axis is inferred (no address), return a simple sequence.
  if (!axisDef || axisDef.address === null) {
      const count = axisDef?.count || 0;
      return Array.from({ length: count }, (_, i) => i + 1);
  }
  
  const view = new DataView(binBuffer);
  const equationFunc = new Function('X', 'Y', 'Z', `return ${axisDef.equation || 'X'}`);
  const axisData: number[] = [];
  
  for (let i = 0; i < axisDef.count; i++) {
    const offset = axisDef.address + (i * axisDef.dataSize);
    if (offset + axisDef.dataSize > view.byteLength) {
        console.error(`Leitura do eixo fora dos limites. Endereço: ${axisDef.address}, Offset: ${offset}. O eixo pode estar incompleto.`);
        // Fill remaining with NaNs to avoid crashing.
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
        axisData.push(equationFunc(rawValue, 1, 1));
    } catch (e) {
        console.error(`Erro ao aplicar equação do eixo: ${e}`);
        axisData.push(NaN);
    }
  }
  return axisData;
}


export function readMapFromBin(binBuffer: ArrayBuffer, def: XDFDefinition): MapData {
  if (!def || !binBuffer) return [];

  const view = new DataView(binBuffer);
  const map: MapData = [];
  const equationFunc = new Function('X', 'Y', 'Z', `return ${def.equation || 'X'}`);

  for (let r = 0; r < def.rows; r++) {
    const row: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      // Assuming row-major order. The offset calculation depends on how the data is laid out in the binary.
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
        row.push(equationFunc(rawValue, 1, 1));
      } catch(e) {
        console.error(`Erro ao aplicar equação do mapa: ${e}`);
        row.push(null);
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
