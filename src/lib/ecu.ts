// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData, AxisDataState } from './types';

/**
 * Finds a DIRECT child element by query selector. Case-insensitive support is not needed
 * as modern browsers handle CSS selectors in a standard way.
 */
function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
        // Use querySelector for direct children. `>` is implicit but good for clarity.
        const node = parent.querySelector(`:scope > ${selector}`);
        if (node) return node;
    }
    return null;
}


/**
 * Gets an attribute from an element.
 */
function getAttr(element: Element | null, attrName: string): string | null {
    if (!element) return null;
    return element.getAttribute(attrName);
}

/**
 * The definitive, robust XDF parser.
 */
export function parseXDF(xmlString: string): { definitions: XDFDefinition[], brand: string | null } {
    if (typeof DOMParser === 'undefined') {
        throw new Error("O ambiente não suporta DOMParser.");
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        throw new Error(`Erro de análise do XDF: ${parseError.textContent}`);
    }

    const allTableElements = xmlDoc.querySelectorAll('XDFTABLE, table');
    const allTablesMap = new Map<string, Element>();
    allTableElements.forEach(table => {
        const name = table.querySelector('title')?.textContent || table.getAttribute('name');
        if (name) {
            allTablesMap.set(name, table);
        }
    });

    const header = findNode(xmlDoc, 'XDF', 'xdfile');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> ou <table> foi encontrada no ficheiro. Este não parece ser um ficheiro XDF válido.");
    }

    const definitions: XDFDefinition[] = [];

    allTablesMap.forEach(table => {
        try {
            const tableName = table.querySelector('title')?.textContent || getAttr(table, 'name');
            if (!tableName) return; // Skip tables without a name

            const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            if (!zAxisNode) return;
            
            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            if (!embeddedData) return; 

            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            const rows = parseInt(getAttr(embeddedData, 'mmedrowcount') || '', 10);
            const cols = parseInt(getAttr(embeddedData, 'mmedcolcount') || '', 10);
            const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '', 10);
            const isBigEndian = getAttr(embeddedData, 'bigendian') === '1' || getAttr(embeddedData, 'bigendian')?.toLowerCase() === 'true';

            const mathNode = findNode(zAxisNode, 'math', 'MATH');
            const equation = getAttr(mathNode, 'equation')?.replace(/x/g, 'X') || 'X';

            if (isNaN(address) || isNaN(rows) || isNaN(cols) || isNaN(dataSizeBits)) {
                return; // Skip if essential Z-axis data is missing
            }

            const parseAxis = (axisNode: Element | null): AxisDefinition => {
                if (!axisNode) return null;
                
                let count = 0;
                if(getAttr(axisNode, 'id')?.toLowerCase() === 'x') count = cols;
                if(getAttr(axisNode, 'id')?.toLowerCase() === 'y') count = rows;
                
                const label = findNode(axisNode, 'title')?.textContent || getAttr(axisNode, 'title') || (getAttr(axisNode, 'id') === 'x' ? 'Eixo X' : 'Eixo Y');

                const axisDef: AxisDefinition = { label, count, node: axisNode };

                const axisEmbeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
                if (axisEmbeddedData) {
                    axisDef.address = parseInt(getAttr(axisEmbeddedData, 'mmedaddress') || '', 16);
                    axisDef.dataSize = parseInt(getAttr(axisEmbeddedData, 'mmedelementsizebits') || '16', 10) / 8;
                    axisDef.isBigEndian = getAttr(axisEmbeddedData, 'bigendian') === '1';
                    axisDef.equation = findNode(axisNode, 'math')?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
                } else {
                    const linkedTableName = findNode(axisNode, 'link')?.getAttribute('name');
                    const linkedTableNode = linkedTableName ? allTablesMap.get(linkedTableName) : null;
                    if(linkedTableNode) {
                        const linkedAxis = findNode(linkedTableNode, 'XDFAXIS[id="z"]');
                        const linkedEmbeddedData = findNode(linkedAxis, 'embeddeddata');
                         if (linkedEmbeddedData && linkedAxis) {
                            axisDef.address = parseInt(getAttr(linkedEmbeddedData, 'mmedaddress') || '', 16);
                            axisDef.dataSize = parseInt(getAttr(linkedEmbeddedData, 'mmedelementsizebits') || '16', 10) / 8;
                            axisDef.isBigEndian = getAttr(linkedEmbeddedData, 'bigendian') === '1';
                            axisDef.equation = findNode(linkedAxis, 'math')?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';
                         }
                    }
                }
                return axisDef;
            };

            const xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
            const yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));

            if (!xAxisDef || !yAxisDef) return;
            
            definitions.push({
                name: tableName,
                address,
                rows,
                cols,
                dataSize: dataSizeBits / 8,
                isBigEndian,
                equation,
                xAxisDef,
                yAxisDef,
                isPotential: false,
                equationVar: 'X', // default, can be refined
                majorStride: 0,
                minorStride: 0,
            });
        } catch (e) {
            const tableName = getAttr(table, 'name') || 'desconhecida';
            console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
        }
    });

    return { definitions, brand };
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition, isEndianSwapped = false): AxisDataState {
    const count = axisDef?.count || 0;
    const defaultCalculated = Array.from({ length: count }, (_, i) => i + 1);
    const emptyState: AxisDataState = { raw: defaultCalculated, calculated: defaultCalculated };

    if (!axisDef || !binBuffer || (!axisDef.address && axisDef.address !== 0)) {
        return emptyState;
    }

    const view = new DataView(binBuffer);
    const addr = axisDef.address;
    const dataSize = axisDef.dataSize || 2; // Default to 2 bytes
    const useLittleEndian = !(axisDef.isBigEndian ?? false);
    const equation = axisDef.equation || 'X';

    if (isNaN(addr) || isNaN(count) || isNaN(dataSize)) return emptyState;
    
    let equationFunc: Function;
    try {
        equationFunc = new Function('X', `return ${equation}`);
    } catch(e) {
        console.error(`Equação de eixo inválida para "${axisDef.label}": ${equation}`);
        equationFunc = (X: number) => X;
    }

    const rawData: number[] = [];
    const calculatedData: (number | string)[] = [];

    for(let i=0; i < count; i++) {
        const offset = addr + (i * dataSize);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue;
        if(dataSize === 1) rawValue = view.getUint8(offset);
        else if(dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else continue;
        
        rawData.push(rawValue);
        calculatedData.push(equationFunc(rawValue));
    }
    return { raw: rawData, calculated: calculatedData };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    xAxisState: AxisDataState,
    yAxisState: AxisDataState,
    isEndianSwapped = false
): { calculatedMap: MapData, rawMap: MapData } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [] };

  const view = new DataView(binBuffer);
  
  const sanitizedEquation = (def.equation || 'X').replace(/x/g, 'X');
      
  let equationFunc: Function;
  try {
    equationFunc = new Function('X', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do mapa "${def.equation}" para "${def.name}" é inválida. (${error})`);
  }
  
  const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;

  // 1. Read the raw map data from the file
  const rawMap: MapData = [];
  for (let r = 0; r < def.rows; r++) {
    const rawRow: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * def.cols + c) * def.dataSize;

      if (offset + def.dataSize > view.byteLength) {
        console.error(`Leitura do mapa fora dos limites para "${def.name}". Offset: ${offset}`);
        rawRow.push(null);
        continue;
      }
      
      let rawValue;
      if (def.dataSize === 1) {
          rawValue = view.getUint8(offset);
      } else if (def.dataSize === 2) {
          rawValue = view.getUint16(offset, useLittleEndian);
      } else {
          rawRow.push(null);
          continue;
      }
      rawRow.push(rawValue);
    }
    rawMap.push(rawRow);
  }

  // 2. Calculate the final map values using the equation
  const calculatedMap: MapData = rawMap.map(row => 
    row.map(cell => {
      if (cell === null) return null;
      try {
        return equationFunc(cell);
      } catch (e) {
        return cell;
      }
    })
  );

  return { calculatedMap: calculatedMap, rawMap: rawMap };
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
 */
export function invertEquation(
  eq: string,
  finalValue: number
): number {
    if (finalValue === null || isNaN(finalValue)) {
        throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
    }

    let sanitizedEq = (eq || 'X').trim()
        .replace(/,/g, '.')
        .replace(/\b(value|x)\b/gi, 'X');

    // Basic inversion logic based on common patterns
    if (sanitizedEq.includes('/') && !sanitizedEq.includes('+') && !sanitizedEq.includes('-')) {
        const factor = parseFloat(sanitizedEq.split('/')[1]);
        if (!isNaN(factor)) return finalValue * factor;
    }
    if (sanitizedEq.includes('*') && !sanitizedEq.includes('+') && !sanitizedEq.includes('-')) {
        const factor = parseFloat(sanitizedEq.split('*')[1]);
        if (!isNaN(factor)) return finalValue / factor;
    }
    if (sanitizedEq.includes('+')) {
        const factor = parseFloat(sanitizedEq.split('+')[1]);
        if (!isNaN(factor)) return finalValue - factor;
    }
    if (sanitizedEq.includes('-')) {
        const factor = parseFloat(sanitizedEq.split('-')[1]);
        if (!isNaN(factor)) return finalValue - factor;
    }
    if (sanitizedEq.toUpperCase() === 'X') {
        return finalValue;
    }

    console.warn(`A equação "${eq}" é demasiado complexa para ser invertida. A utilizar o valor final como valor raw.`);
    return Math.round(finalValue);
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
                const newRawValue = invertEquation(def.equation, calculatedValue);
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
    
    const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r][c];
            if (rawValue === null || isNaN(rawValue)) {
                continue;
            }

            try {
                const intValue = Math.round(rawValue);
                const offset = def.address + (r * def.cols * def.dataSize + c * def.dataSize);

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
