import type { XDFDefinition, AxisDefinition, MapData, AxisDataState, AxisDimension } from './types';

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
    const allTablesByName = new Map<string, Element>();
    const allTablesById = new Map<string, Element>();

    allTableElements.forEach(table => {
        const name = findNode(table, 'title')?.textContent?.trim() || getAttr(table, 'name');
        if (name) {
            allTablesByName.set(name, table);
        }
        const uniqueId = getAttr(table, 'uniqueid');
        if (uniqueId) {
            allTablesById.set(uniqueId, table);
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

            const rows = parseInt(getAttr(embeddedData, 'mmedrowcount') || getAttr(table, 'rows') || '0', 10);
            const cols = parseInt(getAttr(embeddedData, 'mmedcolcount') || getAttr(table, 'cols') || '0', 10);
            
            if (isNaN(rows) || isNaN(cols) || rows === 0 || cols === 0) return;

            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return;

            let dataSizeBits = parseInt(getAttr(zAxisNode, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '0', 10);
            if (dataSizeBits === 0) {
                const dataType = parseInt(getAttr(embeddedData, 'mmeddatatype') || '0', 10);
                if (dataType === 1) dataSizeBits = 8; else if (dataType === 2) dataSizeBits = 16; else dataSizeBits = 16;
            }
            const dataSize = dataSizeBits / 8;
            
            const minorStrideBits = parseInt(getAttr(embeddedData, 'mmedminorstridebits') || '0', 10);
            const majorStrideBits = parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10);

            const colStrideBytes = (minorStrideBits > 0) ? minorStrideBits / 8 : dataSize;
            const rowStrideBytes = (majorStrideBits > 0) ? majorStrideBits / 8 : cols * colStrideBytes;
            
            const dataOrganizationAttr = getAttr(embeddedData, 'mmeddataorganization');
            const dataOrganization = (dataOrganizationAttr === 'COL_MAJOR' || dataOrganizationAttr === 'COLMAJOR') ? 'COL_MAJOR' : 'ROW_MAJOR';
            const isBigEndian = getAttr(embeddedData, 'bigendian') === '1' || getAttr(embeddedData, 'bigendian')?.toLowerCase() === 'true';
            const mathNode = findNode(zAxisNode, 'math', 'MATH');
            const equation = getAttr(mathNode, 'equation') || 'X';
            const decimalplZ = parseInt(findNode(zAxisNode, 'decimalpl')?.textContent || '2', 10);

            const parseAxis = (axisNode: Element | null): AxisDimension | null => {
                if (!axisNode) return null;
                
                const axisId = getAttr(axisNode, 'id')?.toLowerCase();
                const defaultLabel = axisId === 'x' ? 'Eixo X' : 'Eixo Y';
                const count = axisId === 'x' ? cols : rows;
                const axisDef: Partial<AxisDimension> = { count, label: defaultLabel };

                const linkNode = findNode(axisNode, 'link');
                const linkedTableId = getAttr(linkNode, 'uniqueid');
                const linkedTableName = getAttr(linkNode, 'name')?.trim();
                const linkedTableNode = (linkedTableId ? allTablesById.get(linkedTableId) : null) || (linkedTableName ? allTablesByName.get(linkedTableName) : null);
                
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
                
                let axisDataSizeBits = parseInt(getAttr(sourceNodeForData, 'elementsizebits') || getAttr(axisEmbeddedData, 'mmedelementsizebits') || '0', 10);
                if (axisDataSizeBits === 0) {
                    const axisDataType = parseInt(getAttr(axisEmbeddedData, 'mmeddatatype') || '0', 10);
                    if (axisDataType === 1) axisDataSizeBits = 8; else axisDataSizeBits = 16;
                }
                axisDef.dataSize = axisDataSizeBits / 8;

                const axisMajorStrideBits = parseInt(getAttr(axisEmbeddedData, 'mmedmajorstridebits') || '0', 10);
                const axisMinorStrideBits = parseInt(getAttr(axisEmbeddedData, 'mmedminorstridebits') || '0', 10);

                if (axisMajorStrideBits > 0) {
                    axisDef.stride = axisMajorStrideBits / 8;
                } else if (axisMinorStrideBits > 0) {
                    axisDef.stride = axisMinorStrideBits / 8;
                } else {
                    axisDef.stride = axisDef.dataSize;
                }
                
                axisDef.isBigEndian = getAttr(axisEmbeddedData, 'bigendian') === '1' || getAttr(axisEmbeddedData, 'bigendian')?.toLowerCase() === 'true';

                const axisMathNode = findNode(sourceNodeForData, 'math', 'MATH');
                axisDef.equation = getAttr(axisMathNode, 'equation') || 'X';
                
                axisDef.decimalpl = parseInt(findNode(sourceNodeForData, 'decimalpl')?.textContent || '1', 10);

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

                if (!axisDef.values && (axisDef.address === undefined || isNaN(axisDef.address))) return null; 

                return axisDef as AxisDimension;
            };
            
            const xAxisDef = parseAxis(findNode(table, 'xaxis', 'XDFAXIS[id="x"]'));
            const yAxisDef = parseAxis(findNode(table, 'yaxis', 'XDFAXIS[id="y"]'));

            if (!xAxisDef || !yAxisDef) return;
            
            definitions.push({
                name: tableName,
                address,
                rows,
                cols,
                dataSize,
                colStrideBytes,
                rowStrideBytes,
                dataOrganization,
                isBigEndian,
                equation,
                decimalpl: decimalplZ,
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


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension, isEndianSwapped: boolean): AxisDataState {
    const { count = 0, label = 'Eixo Desconhecido' } = axisDef || {};
    
    if (axisDef?.values?.length > 0) {
        return {
            label,
            raw: axisDef.values.map(v => typeof v === 'number' ? v : 0),
            calculated: axisDef.values,
            originalIndices: Array.from({ length: axisDef.values.length }, (_, i) => i),
        };
    }
    
    const defaultState: AxisDataState = {
        label,
        raw: Array.from({ length: count }, (_, i) => i + 1),
        calculated: Array.from({ length: count }, (_, i) => i + 1),
        originalIndices: Array.from({ length: count }, (_, i) => i),
    };

    if (!axisDef || !binBuffer || axisDef.address === undefined || axisDef.address === null) {
        return defaultState;
    }

    const view = new DataView(binBuffer);
    const { address: addr, dataSize = 2, equation: eq, isBigEndian } = axisDef;
    const useLittleEndian = !(isBigEndian ?? false) !== !isEndianSwapped;
    const equation = normalizeEquation(eq);
    const stride = axisDef.stride || dataSize;

    if (isNaN(addr) || isNaN(count) || isNaN(dataSize)) return defaultState;

    let equationFunc: (val: number) => number | string;
    try {
        equationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch (e) {
        console.error(`Equação de eixo inválida para "${label}": ${equation}`);
        equationFunc = (X: number) => X;
    }

    const raw: number[] = [];
    const calculated: (number | string)[] = [];

    for (let i = 0; i < count; i++) {
        const offset = addr + (i * stride);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue = dataSize === 1 ? view.getUint8(offset) : view.getUint16(offset, useLittleEndian);
        raw.push(rawValue);
        try {
            calculated.push(equationFunc(rawValue));
        } catch (e) {
            calculated.push(rawValue); 
        }
    }
    return { raw, calculated, originalIndices: Array.from({ length: calculated.length }, (_, i) => i), label };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
    isEndianSwapped: boolean
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
    const {
        address, rows, cols, dataSize, isBigEndian, equation: eq,
        dataOrganization
    } = def;
    
    // Use the strides from the definition, which are now correctly parsed.
    const colStrideBytes = def.colStrideBytes;
    const rowStrideBytes = def.rowStrideBytes;

    const axisXData = readAxisFromBin(binBuffer, def.xAxisDef, isEndianSwapped);
    const axisYData = readAxisFromBin(binBuffer, def.yAxisDef, isEndianSwapped);
    
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(isBigEndian ?? false) !== !isEndianSwapped;
    const equation = normalizeEquation(eq);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    const rawMap: MapData = Array.from({ length: rows }, () => Array(cols).fill(null));
    const calculatedMap: MapData = Array.from({ length: rows }, () => Array(cols).fill(null));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);
            
            if (offset + dataSize > view.byteLength) continue;
            
            try {
                const rawValue = dataSize === 1 ? view.getUint8(offset) : view.getUint16(offset, useLittleEndianForZ);
                rawMap[r][c] = rawValue;
                calculatedMap[r][c] = zEquationFunc(rawValue) as number;
            } catch (e) {
                console.error(`Erro ao ler o BIN no offset ${offset}: ${(e as Error).message}`);
            }
        }
    }
    
    const yCalculated = axisYData.calculated.filter(v => typeof v === 'number') as number[];
    if (yCalculated.length > 1 && yCalculated[0] > yCalculated[yCalculated.length - 1]) {
        calculatedMap.reverse();
        rawMap.reverse();
    }

    return { 
        calculatedMap, 
        rawMap, 
        sortedAxes: { x: axisXData, y: axisYData } 
    };
}


export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def) return null;
    const { address, rowStrideBytes, colStrideBytes, dataOrganization } = def;

    if (dataOrganization === 'COL_MAJOR') {
        return address + (colIndex * rowStrideBytes) + (rowIndex * colStrideBytes);
    } 
    return address + (rowIndex * rowStrideBytes) + (colIndex * colStrideBytes);
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
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            if (innerOp === '+') result -= innerVal;
            if (innerOp === '-') result += innerVal;
            return result;
        }
    }

    throw new Error(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente.`);
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
    
    const yCalculated = sourceAxes.y.calculated.filter(v => typeof v === 'number') as number[];
    const mapForCalc = [...calculatedMap];
    if (yCalculated.length > 1 && yCalculated[0] > yCalculated[yCalculated.length - 1]) {
        mapForCalc.reverse();
    }


    const newRawMap: MapData = [];
    for (let r = 0; r < def.rows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < def.cols; c++) {
            const calculatedValue = mapForCalc[r]?.[c];

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

    const {
        address, rows, cols, dataSize, isBigEndian,
        colStrideBytes, rowStrideBytes, dataOrganization
    } = def;

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndian = !(isBigEndian ?? false) !== !isEndianSwapped;
    
    const yAxisData = readAxisFromBin(binBuffer, def.yAxisDef, isEndianSwapped);
    const yCalculated = yAxisData.calculated.filter(v => typeof v === 'number') as number[];
    const mapToWrite = [...rawMapData];

    if (yCalculated.length > 1 && yCalculated[0] > yCalculated[yCalculated.length - 1]) {
        mapToWrite.reverse();
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const rawValue = mapToWrite[r][c];
            if (rawValue === null || isNaN(rawValue)) continue;

            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);

            if (offset + dataSize > view.byteLength) {
                console.error(`Escrita do mapa fora dos limites. Offset: ${offset}. A saltar.`);
                continue;
            }
            
            try {
                const intValue = Math.round(rawValue);
                if (dataSize === 1) {
                    const writeValue = Math.max(0, Math.min(255, intValue));
                    view.setUint8(offset, writeValue);
                    if (colStrideBytes === 2 && offset + 1 < view.byteLength) {
                        view.setUint8(offset + 1, 0);
                    }
                } else if (dataSize === 2) {
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
