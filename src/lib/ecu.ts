

// This file contains functions that can only be run on the client
// due to the use of browser-specific APIs like DOMParser.

import type { XDFDefinition, AxisDefinition, MapData, AxisDataState } from './types';

/**
 * Finds a DIRECT child element by query selector. Case-insensitive support is not needed
 * as modern browsers handle CSS selectors in a standard way.
 */
function findNode(parent: Element | null, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
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
 * The definitive, robust XDF parser, inspired by the user's provided functional code.
 */
export function parseXDF(xmlString: string): XDFDefinition[] {
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
    
    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> ou <table> foi encontrada no ficheiro. Este não parece ser um ficheiro XDF válido.");
    }

    const definitions: XDFDefinition[] = [];

    allTableElements.forEach(table => {
        try {
            const tableName = findNode(table, 'title')?.textContent || getAttr(table, 'name') || 'Tabela sem nome';
            if (tableName === 'Tabela sem nome') return; // Skip tables without a name

            const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            if (!zAxisNode) return;
            
            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            if (!embeddedData) return; // Z-Axis must have embedded data

            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            const rows = parseInt(getAttr(embeddedData, 'mmedrowcount') || '', 10);
            const cols = parseInt(getAttr(embeddedData, 'mmedcolcount') || '', 10);
            const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '', 10);
            const isBigEndian = getAttr(embeddedData, 'bigendian') === '1' || getAttr(embeddedData, 'bigendian')?.toLowerCase() === 'true';

            const mathNode = findNode(zAxisNode, 'math', 'MATH');
            const equation = getAttr(mathNode, 'equation')?.replace(/x/g, 'X') || 'X';

            if (isNaN(address) || isNaN(rows) || isNaN(cols) || isNaN(dataSizeBits)) {
                return; // Skip if essential data is missing
            }

            const xAxisNode = findNode(table, 'xaxis', 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(table, 'yaxis', 'XDFAXIS[id="y"]');
            
            // Dummy axis definitions that can be populated by readAxisFromBin
            const xAxisDef: AxisDefinition = {
                node: xAxisNode,
                count: cols,
                label: findNode(xAxisNode, 'title')?.textContent || getAttr(xAxisNode, 'title') || 'Eixo X',
            };
            const yAxisDef: AxisDefinition = {
                node: yAxisNode,
                count: rows,
                label: findNode(yAxisNode, 'title')?.textContent || getAttr(yAxisNode, 'title') || 'Eixo Y',
            };
            
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
                equationVar: 'X',
                majorStride: 0,
                minorStride: 0,
            });
        } catch (e) {
            console.error(`Erro ao analisar a tabela "${getAttr(table, 'title')}": ${(e as Error).message}`);
        }
    });

    return definitions;
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition, isEndianSwapped = false): AxisDataState {
    const count = axisDef?.count || 0;
    const defaultCalculated = Array.from({ length: count }, (_, i) => i + 1);
    const emptyState: AxisDataState = { raw: defaultCalculated, calculated: defaultCalculated };

    if (!axisDef || !binBuffer || !axisDef.node) {
        return emptyState;
    }

    const embeddedData = findNode(axisDef.node, 'embeddeddata', 'EMBEDDEDDATA');
    if (!embeddedData) {
        // Handle axes without direct data (e.g., just labels or implicit count)
        return emptyState;
    }

    const view = new DataView(binBuffer);
    const addr = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
    
    const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '8', 10);
    const dataSize = dataSizeBits / 8;
    const useLittleEndian = !(getAttr(embeddedData, 'bigendian') === '1');
    const mathNode = findNode(axisDef.node, 'math');
    const equation = getAttr(mathNode, 'equation')?.replace(/x/g, 'X') || 'X';

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
  const rawMapUnsorted: MapData = [];
  
  const sanitizedEquation = (def.equation || 'X').replace(/x/g, 'X');
      
  let equationFunc: Function;
  try {
    equationFunc = new Function('X', `return ${sanitizedEquation || 'X'}`);
  } catch(e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`A equação do mapa "${def.equation}" para "${def.name}" é inválida. (${error})`);
  }
  
  const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;

  // 1. Read the map data as it is in the file (unsorted)
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
    rawMapUnsorted.push(rawRow);
  }

  // 2. Get the sort order from the axis data
  const ySortOrder = yAxisState.calculated.map((val, index) => ({ val: Number(val), index })).sort((a, b) => a.val - b.val);
  const xSortOrder = xAxisState.calculated.map((val, index) => ({ val: Number(val), index })).sort((a, b) => a.val - b.val);

  // 3. Reorder the raw map and calculate the final values
  const finalCalculatedMap: MapData = [];
  const finalRawMapSorted: MapData = [];

  ySortOrder.forEach(yItem => {
      const calculatedRow: (number | null)[] = [];
      const rawSortedRow: (number | null)[] = [];
      const originalRow = rawMapUnsorted[yItem.index];

      xSortOrder.forEach(xItem => {
          const rawValue = originalRow[xItem.index];
          rawSortedRow.push(rawValue);
          if (rawValue === null) {
              calculatedRow.push(null);
          } else {
              try {
                  const calculatedValue = equationFunc(rawValue);
                  calculatedRow.push(calculatedValue);
              } catch (e) {
                  const errorMessage = e instanceof Error ? e.message : String(e);
                  console.error(`Erro ao aplicar equação "${sanitizedEquation}" no valor raw "${rawValue}": ${errorMessage}. A utilizar o valor "cru".`);
                  calculatedRow.push(rawValue);
              }
          }
      });
      finalCalculatedMap.push(calculatedRow);
      finalRawMapSorted.push(rawSortedRow);
  });

  return { calculatedMap: finalCalculatedMap, rawMap: finalRawMapSorted };
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
        if (!isNaN(factor)) return finalValue + factor;
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

