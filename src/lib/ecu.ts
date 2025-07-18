
import type { XDFDefinition, AxisDefinition, MapData, AxisDataState } from './types';

function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
        // :scope is crucial for searching only direct children
        const node = parent.querySelector(`:scope > ${selector}`);
        if (node) return node;
    }
    return null;
}

function getAttr(element: Element | null, attrName: string): string | null {
    if (!element) return null;
    return element.getAttribute(attrName);
}

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
        const name = findNode(table, 'title')?.textContent || getAttr(table, 'name');
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
            const tableName = findNode(table, 'title')?.textContent || getAttr(table, 'name');
            if (!tableName) return;

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
                return;
            }

            const parseAxis = (axisNode: Element | null): AxisDefinition => {
                if (!axisNode) return null;
                
                let count = 0;
                const axisId = getAttr(axisNode, 'id')?.toLowerCase();
                if(axisId === 'x') count = cols;
                if(axisId === 'y') count = rows;
                
                const label = findNode(axisNode, 'title')?.textContent || getAttr(axisNode, 'title') || getAttr(axisNode, 'label') || (axisId === 'x' ? 'Eixo X' : 'Eixo Y');
                
                const axisDef: Partial<AxisDefinition> = { label, count, node: axisNode };
                
                let sourceNodeForEquation: Element | null = axisNode;
                const linkedTableName = findNode(axisNode, 'link')?.getAttribute('name');
                const linkedTableNode = linkedTableName ? allTablesMap.get(linkedTableName) : null;
                
                if (linkedTableNode) {
                    const linkedAxisNode = findNode(linkedTableNode, 'XDFAXIS[id="z"]');
                     if(linkedAxisNode) {
                        const linkedEmbeddedData = findNode(linkedAxisNode, 'embeddeddata');
                         if (linkedEmbeddedData) {
                            axisDef.address = parseInt(getAttr(linkedEmbeddedData, 'mmedaddress') || '', 16);
                            axisDef.dataSize = parseInt(getAttr(linkedEmbeddedData, 'mmedelementsizebits') || '16', 10) / 8;
                            axisDef.isBigEndian = getAttr(linkedEmbeddedData, 'bigendian') === '1';
                            sourceNodeForEquation = linkedAxisNode;
                         }
                     }
                } else {
                    const axisEmbeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
                    if(axisEmbeddedData) {
                         axisDef.address = parseInt(getAttr(axisEmbeddedData, 'mmedaddress') || '', 16);
                         axisDef.dataSize = parseInt(getAttr(axisEmbeddedData, 'mmedelementsizebits') || '16', 10) / 8;
                         axisDef.isBigEndian = getAttr(axisEmbeddedData, 'bigendian') === '1';
                    } else {
                        const labelNodes = axisNode.querySelectorAll(':scope > label');
                        if(labelNodes.length > 0) {
                            const values: (string|number)[] = [];
                            labelNodes.forEach(ln => {
                                const val = ln.textContent || '';
                                const numVal = parseFloat(val);
                                values.push(isNaN(numVal) ? val : numVal);
                            });
                            axisDef.values = values;
                            axisDef.count = values.length;
                        }
                    }
                }
                
                axisDef.equation = findNode(sourceNodeForEquation, 'math')?.getAttribute('equation')?.replace(/x/g, 'X') || 'X';

                if ((axisDef.values === undefined) && (isNaN(axisDef.address!) || isNaN(axisDef.dataSize!) || !axisDef.equation)) {
                    return null;
                }

                return axisDef as AxisDefinition;
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
            });
        } catch (e) {
            const tableName = getAttr(table, 'name') || 'desconhecida';
            console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
        }
    });

    return { definitions, brand };
}


function normalizeEquation(eq: string): string {
    let sanitizedEq = (eq || 'X').trim().toUpperCase();
    
    // Handles cases like X100 -> X*100 and 100X -> 100*X
    sanitizedEq = sanitizedEq.replace(/(\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d+)/g, '$1*$2');
    
    return sanitizedEq.replace(/x/g, 'X');
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition, isEndianSwapped = false): AxisDataState {
    const count = axisDef?.count || 0;
    const label = axisDef?.label || 'Eixo Desconhecido';
    
    if (axisDef?.values && axisDef.values.length > 0) {
        return {
            label: label,
            raw: axisDef.values.map(v => typeof v === 'number' ? v : 0),
            calculated: axisDef.values,
            originalIndices: Array.from({ length: axisDef.values.length }, (_, i) => i),
        };
    }
    
    const defaultState: AxisDataState = {
        label: label,
        raw: Array.from({ length: count }, (_, i) => i + 1),
        calculated: Array.from({ length: count }, (_, i) => i + 1),
        originalIndices: Array.from({ length: count }, (_, i) => i),
    };

    if (!axisDef || !binBuffer || (!axisDef.address && axisDef.address !== 0)) {
        return defaultState;
    }

    const view = new DataView(binBuffer);
    const addr = axisDef.address;
    const dataSize = axisDef.dataSize || 2;
    const useLittleEndian = !(axisDef.isBigEndian ?? false) !== !isEndianSwapped;
    const equation = normalizeEquation(axisDef.equation || 'X');


    if (isNaN(addr) || isNaN(count) || isNaN(dataSize)) return defaultState;

    let equationFunc: (val: number) => number | string;
    try {
        equationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch (e) {
        console.error(`Equação de eixo inválida para "${axisDef.label}": ${equation}`);
        equationFunc = (X: number) => X;
    }

    const raw: number[] = [];
    const calculated: (number | string)[] = [];
    const originalIndices: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = addr + (i * dataSize);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else continue;

        raw.push(rawValue);
        try {
            calculated.push(equationFunc(rawValue));
        } catch (e) {
            console.error(`Erro ao aplicar equação "${equation}" ao valor raw ${rawValue} para o eixo "${axisDef.label}"`);
            calculated.push(rawValue);
        }
        originalIndices.push(i);
    }
    return { raw, calculated, originalIndices, label };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    isEndianSwapped = false
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
  if (!def || !binBuffer) return { calculatedMap: [], rawMap: [], sortedAxes: { x: { raw: [], calculated: [], originalIndices:[], label: 'X'}, y: { raw: [], calculated: [], originalIndices:[], label: 'Y'} } };

  const view = new DataView(binBuffer);
  const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;
  
  const axisXData = readAxisFromBin(binBuffer, def.xAxisDef, isEndianSwapped);
  const axisYData = readAxisFromBin(binBuffer, def.yAxisDef, isEndianSwapped);
  
  const rawMap: MapData = [];
  for (let r = 0; r < def.rows; r++) {
    const rawRow: (number|null)[] = [];
    for (let c = 0; c < def.cols; c++) {
      const offset = def.address + (r * def.cols + c) * def.dataSize;
      if (offset + def.dataSize > view.byteLength) {
        rawRow.push(null);
        continue;
      }
      let rawValue;
      if (def.dataSize === 1) rawValue = view.getUint8(offset);
      else if (def.dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
      else { rawRow.push(null); continue; }
      rawRow.push(rawValue);
    }
    rawMap.push(rawRow);
  }

  let zEquationFunc: (val: number) => number | string;
  try {
    const normalizedEquation = normalizeEquation(def.equation);
    zEquationFunc = new Function('X', `return ${normalizedEquation}`) as (val: number) => number;
  } catch(e) {
    throw new Error(`A equação do mapa "${def.equation}" para "${def.name}" é inválida.`);
  }

  const calculatedMap: MapData = rawMap.map(row => 
    row.map(cell => (cell !== null ? zEquationFunc(cell) : null))
  );

  return { 
    calculatedMap, 
    rawMap, 
    sortedAxes: { x: axisXData, y: axisYData }
  };
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
    
    sanitizedEq = normalizeEquation(sanitizedEq);

    const parts = sanitizedEq.split(/([*\/+-])/).map(p => p.trim());

    if (parts.length === 3) {
      const operator = parts[1];
      const operandStr = parts[0].toUpperCase() === 'X' ? parts[2] : parts[0];
      const operand = parseFloat(operandStr);

      if (isNaN(operand)) {
          throw new Error(`Operando inválido na equação "${eq}".`);
      }

      switch (operator) {
        case '*': return finalValue / operand;
        case '/': return finalValue * operand;
        case '+': return finalValue - operand;
        case '-':
            // Handle both "X - num" and "num - X"
            if (parts[0].toUpperCase() === 'X') {
                return finalValue + operand;
            } else {
                return operand - finalValue;
            }
      }
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
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }

    const unsortedCalculatedMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const originalRowIndex = sourceAxes.y.originalIndices[r];
            const originalColIndex = sourceAxes.x.originalIndices[c];
            unsortedCalculatedMap[originalRowIndex][originalColIndex] = calculatedMap[r][c];
        }
    }

    const newRawMap: MapData = [];
    for (let r = 0; r < def.rows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < def.cols; c++) {
            const calculatedValue = unsortedCalculatedMap[r]?.[c];

            if (calculatedValue === null || calculatedValue === undefined) {
                newRawRow.push(null);
                continue;
            }

            try {
                const newRawValue = invertEquation(def.equation, calculatedValue as number);
                newRawRow.push(newRawValue);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : "Erro desconhecido";
                console.error(`Não foi possível recalcular o valor raw para a célula [${r}, ${c}]: ${errorMsg}. A utilizar NaN.`);
                newRawRow.push(NaN);
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
