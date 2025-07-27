

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

function normalizeEquation(eq: string | null | undefined): string {
    if (!eq) return 'X';
    let sanitizedEq = eq.trim().toUpperCase();
    
    // Handles cases like X100 -> X*100 and 100X -> 100*X
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    
    // Ensure "X" is uppercase
    return sanitizedEq.replace(/x/g, 'X');
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
        const name = findNode(table, 'title')?.textContent?.trim() || getAttr(table, 'name');
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

    allTableElements.forEach(table => {
        try {
            const tableName = findNode(table, 'title')?.textContent?.trim() || getAttr(table, 'name');
            if (!tableName) return;

            const zAxisNode = findNode(table, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            if (!zAxisNode) return;
            
            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            if (!embeddedData) return;

            const rowsStr = getAttr(embeddedData, 'mmedrowcount');
            const colsStr = getAttr(embeddedData, 'mmedcolcount');

            const rows = parseInt(rowsStr || getAttr(table, 'rows') || '0', 10);
            const cols = parseInt(colsStr || getAttr(table, 'cols') || '0', 10);
            
            if (isNaN(rows) || isNaN(cols) || rows === 0 || cols === 0) { 
                return;
            }

            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            
            let dataSizeBits = parseInt(getAttr(zAxisNode, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '0', 10);
            if (dataSizeBits === 0) {
                const dataType = parseInt(getAttr(embeddedData, 'mmeddatatype') || '0', 10);
                if (dataType === 1) dataSizeBits = 8;
                else if (dataType === 2) dataSizeBits = 16;
                else if (tableName.toLowerCase().includes('ign')) dataSizeBits = 8;
                else dataSizeBits = 16;
            }
            
            const minorStrideBits = parseInt(getAttr(embeddedData, 'mmedminorstridebits') || '0', 10);
            const majorStrideBits = parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10);
            
            const dataOrganizationAttr = getAttr(embeddedData, 'mmeddataorganization');
            const dataOrganization = (dataOrganizationAttr === 'COL_MAJOR' || dataOrganizationAttr === 'COLMAJOR') ? 'COL_MAJOR' : 'ROW_MAJOR';
            const isBigEndian = getAttr(embeddedData, 'bigendian') === '1' || getAttr(embeddedData, 'bigendian')?.toLowerCase() === 'true';
            const mathNode = findNode(zAxisNode, 'math', 'MATH');
            const equation = getAttr(mathNode, 'equation') || 'X';

            if (isNaN(address)) {
                return;
            }

            const parseAxis = (axisNode: Element | null): AxisDefinition => {
                if (!axisNode) return null;
                
                const axisId = getAttr(axisNode, 'id')?.toLowerCase();
                const defaultLabel = axisId === 'x' ? 'Eixo X' : 'Eixo Y';
                const axisDef: Partial<AxisDefinition> = { node: axisNode, label: defaultLabel };

                const linkedTableName = findNode(axisNode, 'link')?.getAttribute('name')?.trim();
                const linkedTableNode = linkedTableName ? allTablesMap.get(linkedTableName) : null;
                
                let sourceNodeForData = axisNode; 
                let label = findNode(axisNode, 'title')?.textContent?.trim() || findNode(axisNode, 'units')?.textContent?.trim() || getAttr(axisNode, 'title') || getAttr(axisNode, 'label') || defaultLabel;

                if (linkedTableNode) {
                    const linkedTitle = findNode(linkedTableNode, 'title')?.textContent?.trim();
                    const linkedUnits = findNode(linkedTableNode, 'units')?.textContent?.trim();
                    if (linkedTitle || linkedUnits) label = linkedTitle || linkedUnits || label;
                    
                    const linkedZAxis = findNode(linkedTableNode, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
                    if (linkedZAxis) {
                      sourceNodeForData = linkedZAxis;
                    }
                }
                
                axisDef.label = label;
                const axisEmbeddedData = findNode(sourceNodeForData, 'embeddeddata', 'EMBEDDEDDATA');
                if (!axisEmbeddedData) return null;

                axisDef.address = parseInt(getAttr(axisEmbeddedData, 'mmedaddress') || '', 16);
                axisDef.count = parseInt(getAttr(axisEmbeddedData, 'mmedcolcount') || getAttr(axisNode, 'indexcount') || '0', 10);
                
                let axisDataSizeBits = parseInt(getAttr(sourceNodeForData, 'elementsizebits') || getAttr(axisEmbeddedData, 'mmedelementsizebits') || '0', 10);
                if (axisDataSizeBits === 0) {
                    const axisDataType = parseInt(getAttr(axisEmbeddedData, 'mmeddatatype') || '0', 10);
                    if (axisDataType === 1) axisDataSizeBits = 8;
                    else if (axisDataType === 2) axisDataSizeBits = 16;
                    else axisDataSizeBits = 16; // Default
                }
                axisDef.dataSize = axisDataSizeBits / 8;
                
                const axisMajorStrideBits = parseInt(getAttr(axisEmbeddedData, 'mmedmajorstridebits') || '0', 10);
                const axisMinorStrideBits = parseInt(getAttr(axisEmbeddedData, 'mmedminorstridebits') || '0', 10);

                // Correct stride logic for axes
                axisDef.stride = (axisMajorStrideBits || axisMinorStrideBits || axisDef.dataSize * 8) / 8;

                axisDef.isBigEndian = getAttr(axisEmbeddedData, 'bigendian') === '1' || getAttr(axisEmbeddedData, 'bigendian')?.toLowerCase() === 'true';

                const axisMathNode = findNode(sourceNodeForData, 'math', 'MATH');
                axisDef.equation = getAttr(axisMathNode, 'equation') || 'X';

                const labelNodes = sourceNodeForData.querySelectorAll(':scope > label, :scope > LABEL');
                if (labelNodes.length > 0) {
                    const values: (string|number)[] = [];
                    labelNodes.forEach(ln => {
                        const val = ln.getAttribute('value') || ln.textContent || '';
                        const numVal = parseFloat(val);
                        values.push(isNaN(numVal) ? val : numVal);
                    });
                    axisDef.values = values;
                }

                if (!axisDef.values && (axisDef.address === undefined || isNaN(axisDef.address))) {
                   return null; 
                }

                return axisDef as AxisDefinition;
            };

            const xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
            const yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));
            
            if (!xAxisDef || !yAxisDef) return;
            // Ensure counts are correct for the main table definition
            xAxisDef.count = cols;
            yAxisDef.count = rows;
            
            definitions.push({
                name: tableName,
                address,
                rows,
                cols,
                dataSize: dataSizeBits / 8,
                minorStrideBits,
                majorStrideBits,
                dataOrganization,
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


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDefinition, isEndianSwapped: boolean): AxisDataState {
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

    if (!axisDef || !binBuffer || (axisDef.address === undefined || axisDef.address === null)) {
        return defaultState;
    }

    const view = new DataView(binBuffer);
    const addr = axisDef.address;
    const dataSize = axisDef.dataSize || 2;
    const stride = axisDef.stride || dataSize;
    const useLittleEndian = !(axisDef.isBigEndian ?? false) !== !isEndianSwapped;
    const equation = normalizeEquation(axisDef.equation);


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
        const offset = addr + (i * stride);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue;
        if (dataSize === 1) {
            rawValue = view.getUint8(offset);
        } else if (dataSize === 2) {
            rawValue = view.getUint16(offset, useLittleEndian);
        } else {
            continue;
        }

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
    isEndianSwapped: boolean
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
    if (!def || !binBuffer) {
        return { 
            calculatedMap: [], 
            rawMap: [], 
            sortedAxes: { 
                x: { raw: [], calculated: [], originalIndices:[], label: 'X'}, 
                y: { raw: [], calculated: [], originalIndices:[], label: 'Y'} 
            } 
        };
    }

    const axisXData = readAxisFromBin(binBuffer, def.xAxisDef, isEndianSwapped);
    const axisYData = readAxisFromBin(binBuffer, def.yAxisDef, isEndianSwapped);
    
    const view = new DataView(binBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false) !== !isEndianSwapped;

    const equation = normalizeEquation(def.equation);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }
    
    const colStrideBytes = (def.minorStrideBits > 0 ? def.minorStrideBits / 8 : def.dataSize);
    const rowStrideBytes = (def.majorStrideBits > 0 ? def.majorStrideBits / 8 : (def.cols * colStrideBytes));

    const rawMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));
    const calculatedMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            let offset: number;
            if (def.dataOrganization === 'COL_MAJOR') {
                offset = def.address + (c * rowStrideBytes) + (r * colStrideBytes);
            } else { // ROW_MAJOR (default)
                offset = def.address + (r * rowStrideBytes) + (c * colStrideBytes);
            }
            
            if (offset + def.dataSize > view.byteLength) {
                console.error(`Offset de leitura ${offset} está fora dos limites do ficheiro BIN. A saltar.`);
                continue;
            }
            
            let rawValue: number | null = null;
            try {
                if (def.dataSize === 1) {
                    rawValue = view.getUint8(offset);
                } else if (def.dataSize === 2) {
                    rawValue = view.getUint16(offset, useLittleEndianForZ);
                }
                rawMap[r][c] = rawValue;
                if (rawValue !== null) {
                    calculatedMap[r][c] = zEquationFunc(rawValue) as number;
                }
            } catch (e) {
                console.error(`Erro ao ler o BIN no offset ${offset}: ${(e as Error).message}`);
            }
        }
    }
    
    return { 
        calculatedMap: calculatedMap, 
        rawMap: rawMap, 
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

    const sanitizedEq = normalizeEquation(eq);

    if (sanitizedEq.toUpperCase() === 'X') {
        return finalValue;
    }

    const parts = sanitizedEq.split(/([*\/+-])/).map(p => p.trim());
    
    if (parts.length === 3) {
      const operator = parts[1];
      const isXFirst = parts[0].toUpperCase() === 'X';
      const operandStr = isXFirst ? parts[2] : parts[0];
      const operand = parseFloat(operandStr);

      if (isNaN(operand)) {
          throw new Error(`Operando inválido na equação "${eq}".`);
      }

      switch (operator) {
        case '*': return finalValue / operand;
        case '/': return finalValue * operand;
        case '+': return finalValue - operand;
        case '-':
            if (isXFirst) {
                return finalValue + operand;
            } else {
                return operand - finalValue;
            }
      }
    }
    
    const match = sanitizedEq.match(/\(\s*X\s*([+\-])\s*(\d+\.?\d*)\s*\)\s*([*\/])\s*(\d+\.?\d*)/);
    if(match) {
        const [, innerOp, innerValStr, outerOp, outerValStr] = match;
        const innerVal = parseFloat(innerValStr);
        const outerVal = parseFloat(outerValStr);
        
        if (!isNaN(innerVal) && !isNaN(outerVal)) {
            let result = finalValue;
            // Reverse outer operation
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            // Reverse inner operation
            if (innerOp === '+') result -= innerVal;
            if (innerOp === '-') result += innerVal;
            return result;
        }
    }

    console.warn(`A equação "${eq}" é demasiado complexa para ser invertida. A utilizar o valor final como valor raw.`);
    return Math.round(finalValue);
}


export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
    sourceAxes: { x: AxisDataState, y: AxisDataState },
    isEndianSwapped: boolean
): MapData {
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }
    
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
    isEndianSwapped: boolean
): ArrayBuffer {
    if (!def || !binBuffer || !rawMapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndian = !(def.isBigEndian ?? false) !== !isEndianSwapped;
    
    const colStrideBytes = (def.minorStrideBits > 0 ? def.minorStrideBits / 8 : def.dataSize);
    const rowStrideBytes = (def.majorStrideBits > 0 ? def.majorStrideBits / 8 : (def.cols * colStrideBytes));

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r][c];
            if (rawValue === null || isNaN(rawValue)) {
                continue;
            }

            try {
                const intValue = Math.round(rawValue);
                let offset: number;

                 if (def.dataOrganization === 'COL_MAJOR') {
                    offset = def.address + (c * rowStrideBytes) + (r * colStrideBytes);
                 } else { // ROW_MAJOR
                    offset = def.address + (r * rowStrideBytes) + (c * colStrideBytes);
                 }

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
