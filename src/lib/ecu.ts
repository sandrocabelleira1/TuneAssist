
import type { XDFDefinition, AxisDataState, AxisDimension } from './types';

function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
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
    sanitizedEq = sanitizedEq.replace(/x/g, 'X');
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    return sanitizedEq;
}

function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    if (attr === '0' || attr?.toLowerCase() === 'false') {
        return false;
    }
    return true; 
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
    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> ou <table> foi encontrada no ficheiro. Este não parece ser um ficheiro XDF válido.");
    }
    
    const allTablesById = new Map<string, Element>();
    allTableElements.forEach(tableEl => {
        const uniqueId = getAttr(tableEl, 'uniqueid');
        if (uniqueId) {
            allTablesById.set(uniqueId, tableEl);
        }
    });

    const header = findNode(xmlDoc, 'XDF', 'xdfile');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    const definitions: XDFDefinition[] = [];

    const parseAxis = (axisNode: Element | null, defaultCount: number, defaultLabel: string): AxisDimension | null => {
        if (!axisNode) return null;
    
        const linkInfoNode = findNode(axisNode, 'embedinfo');
        const linkedTableId = getAttr(linkInfoNode, 'linkobjid');
    
        if (linkedTableId && allTablesById.has(linkedTableId)) {
            const linkedTableElement = allTablesById.get(linkedTableId)!;
            // Recursively parse the Z-axis of the linked table to get the true axis definition
            const linkedZAxisNode = findNode(linkedTableElement, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            if (linkedZAxisNode) {
                // Pass the original axis's count as the default, in case the linked one doesn't have one
                const axisCountFromOriginal = parseInt(findNode(axisNode, 'indexcount')?.textContent || `${defaultCount}`, 10);
                const recursiveAxisDef = parseAxis(linkedZAxisNode, axisCountFromOriginal, defaultLabel);
                
                if (recursiveAxisDef) {
                    // Prioritize the original axis's label/title over the linked one
                    const originalLabel = findNode(axisNode, 'title')?.textContent?.trim() || findNode(axisNode, 'units')?.textContent?.trim() || getAttr(axisNode, 'title') || getAttr(axisNode, 'label');
                    recursiveAxisDef.label = originalLabel || recursiveAxisDef.label;
                    recursiveAxisDef.count = axisCountFromOriginal;
                    return recursiveAxisDef;
                }
            }
        }
        
        let label = findNode(axisNode, 'title')?.textContent?.trim() || findNode(axisNode, 'units')?.textContent?.trim() || getAttr(axisNode, 'title') || getAttr(axisNode, 'label') || defaultLabel;
        const count = parseInt(findNode(axisNode, 'indexcount')?.textContent || `${defaultCount}`, 10);
        
        const embeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
        if(embeddedData) {
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if(isNaN(address)) return null;
            
            const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            const dataSize = dataSizeBits / 8;
            
            const isBigEndian = getIsBigEndian(embeddedData);
            const equation = getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X';
            const decimalpl = parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10);
            return { count, label, address, dataSize, stride: dataSize, isBigEndian, equation, decimalpl };
        }
        
        const valuesNodeList = axisNode.querySelectorAll(':scope > label, :scope > LABEL');
        if (valuesNodeList.length > 0) {
            const values: (string | number)[] = [];
            valuesNodeList.forEach(ln => {
                const val = ln.getAttribute('value') || ln.textContent || '';
                const numVal = parseFloat(val);
                values.push(isNaN(numVal) ? val : numVal);
            });
            return { count: values.length, label, values };
        }

        return { count, label, values: Array.from({ length: count }, (_, i) => i + 1) };
    };


    allTableElements.forEach(tableEl => {
        try {
            const zAxis = findNode(tableEl, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            
            // Only consider tables with their own Z-axis data as primary maps.
            if (!zAxis || !findNode(zAxis, 'embeddeddata', 'EMBEDDEDDATA')) {
                return;
            }
            
            const tableName = findNode(tableEl, 'title')?.textContent?.trim() || getAttr(tableEl, 'name');
            if (!tableName) return;

            const xAxisNode = findNode(tableEl, 'xaxis', 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'yaxis', 'XDFAXIS[id="y"]');
            if (!xAxisNode || !yAxisNode) return;
            
            const colsFromXDF = parseInt(getAttr(tableEl, 'cols') || '0', 10);
            const rowsFromXDF = parseInt(getAttr(tableEl, 'rows') || '0', 10);

            const xAxisDef = parseAxis(xAxisNode, colsFromXDF, 'Eixo X');
            const yAxisDef = parseAxis(yAxisNode, rowsFromXDF, 'Eixo Y');

            if (!xAxisDef || !yAxisDef) return;
            
            const rows = yAxisDef.count;
            const cols = xAxisDef.count;

            const embeddedData = findNode(zAxis, 'embeddeddata', 'EMBEDDEDDATA')!; 
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return;

            const dataSizeBits = parseInt(getAttr(zAxis, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            const dataSize = dataSizeBits / 8;
            
            const colStrideBytes = dataSize;
            const rowStrideBytes = cols * colStrideBytes;
            
            const dataOrganization = 'ROW_MAJOR';

            // Inherit Z-axis properties from linked table if necessary
            const linkInfoNode = findNode(zAxis, 'embedinfo');
            const linkedTableId = getAttr(linkInfoNode, 'linkobjid');
            const parentTable = linkedTableId ? allTablesById.get(linkedTableId) : null;
            const parentZAxis = parentTable ? findNode(parentTable, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]') : null;

            const finalZAxisNode = parentZAxis || zAxis;
            
            const isBigEndian = getIsBigEndian(findNode(finalZAxisNode, 'embeddeddata', 'EMBEDDEDDATA'));
            const mathNode = findNode(finalZAxisNode, 'math', 'MATH');
            const equation = getAttr(mathNode, 'equation') || 'X';
            const decimalplZ = parseInt(findNode(finalZAxisNode, 'decimalpl')?.textContent || '2', 10);
            
            definitions.push({
                uniqueId: getAttr(tableEl, 'uniqueid') || tableName,
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
            const tableName = getAttr(tableEl, 'name') || 'desconhecida';
            console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
        }
    });

    return { definitions, brand };
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisDataState {
    const { count = 0, label = 'Eixo Desconhecido' } = axisDef || {};
    
    if (axisDef?.values && axisDef.values.length > 0) {
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
    const useLittleEndian = !(isBigEndian ?? false);
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
    
    const axisCount = axisDef.count || count;

    for (let i = 0; i < axisCount; i++) {
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
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
    const {
        address, rows, cols, dataSize, equation: eq,
        dataOrganization, colStrideBytes, rowStrideBytes
    } = def;
    
    const axisXData = readAxisFromBin(binBuffer, def.xAxisDef);
    const axisYData = readAxisFromBin(binBuffer, def.yAxisDef);

    const actualRows = def.yAxisDef.count || rows;
    const actualCols = def.xAxisDef.count || cols;
    
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    const equation = normalizeEquation(eq);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    const rawMap: MapData = Array.from({ length: actualRows }, () => Array(actualCols).fill(null));
    const calculatedMap: MapData = Array.from({ length: actualRows }, () => Array(actualCols).fill(null));

    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
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
): MapData {
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }
    
    const mapForCalc = [...calculatedMap];
    
    const actualRows = def.yAxisDef.count || def.rows;
    const actualCols = def.xAxisDef.count || def.cols;

    const newRawMap: MapData = [];
    for (let r = 0; r < actualRows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < actualCols; c++) {
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
): ArrayBuffer {
    if (!def || !binBuffer || !rawMapData) {
        throw new Error('Parâmetros inválidos fornecidos para writeMapToBin.');
    }

    const {
        address, rows, cols, dataSize,
        colStrideBytes, rowStrideBytes, dataOrganization
    } = def;

    const actualRows = def.yAxisDef.count || rows;
    const actualCols = def.xAxisDef.count || def.cols;

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    
    const mapToWrite = [...rawMapData];

    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
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
                } else if (dataSize === 2) {
                     view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), useLittleEndianForZ);
                }
            } catch (e) {
                 const errorMsg = e instanceof Error ? e.message : String(e);
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${errorMsg}`);
            }
        }
    }
    
    return newBuffer;
}
