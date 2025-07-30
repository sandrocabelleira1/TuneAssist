
import type { XDFDefinition, AxisDataState, AxisDimension, MapData } from './types';

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
    // Use uma expressão regular para substituir 'x' por 'X' apenas quando não estiver dentro de '0x'
    let sanitizedEq = eq.trim().replace(/(?<![0-9a-fA-F])x(?![0-9a-fA-F])/gi, 'X');
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    return sanitizedEq;
}

function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    return attr === '1' || attr?.toLowerCase() === 'true';
}

function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>): AxisDimension {
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;
    const indexcount = parseInt(findNode(axisNode, 'indexcount')?.textContent || '0', 10);
    
    let primaryTitle = findNode(axisNode, 'title')?.textContent?.trim() || getAttr(axisNode, 'units');

    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) {
            throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        }
        
        const zAxisNodeOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisNodeOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);

        const embeddedData = findNode(zAxisNodeOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada ${linkId}`);
        
        const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
        const linkedTableTitle = findNode(linkedTable, 'title')?.textContent?.trim();
        const count = parseInt(getAttr(embeddedData, 'mmedrowcount') || getAttr(embeddedData, 'mmedcolcount') || `${indexcount}` || '0', 10);

        return {
            isLinked: true,
            count: count,
            label: linkedTableTitle || primaryTitle || 'Eixo Vinculado',
            address: parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16),
            dataSize: dataSizeBits / 8,
            stride: (parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10) || dataSizeBits) / 8,
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisNodeOfLinkedTable, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(zAxisNodeOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA');
    if (sourceEmbeddedData && getAttr(sourceEmbeddedData, 'mmedaddress')) {
        const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10);
        return {
            isLinked: false,
            count: indexcount,
            label: primaryTitle || 'Eixo Embutido',
            address: parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16),
            dataSize: dataSizeBits / 8,
            stride: (parseInt(getAttr(sourceEmbeddedData, 'mmedmajorstridebits') || '0', 10) || dataSizeBits) / 8,
            isBigEndian: getIsBigEndian(sourceEmbeddedData),
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }

    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL'));
    if (labels.length > 0 && labels.some(l => (getAttr(l, 'value') || l.textContent || '').trim() !== '')) {
        return {
            isLinked: false,
            count: labels.length || indexcount,
            label: primaryTitle || 'Eixo (Label)',
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    if (!sourceEmbeddedData || !indexcount) {
      return { count: indexcount || 0, label: primaryTitle || 'Eixo Inválido', decimalpl: 1 };
    }

    const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10);
    return {
        isLinked: false,
        count: indexcount,
        label: primaryTitle || 'Eixo Desconhecido',
        address: parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16),
        dataSize: dataSizeBits / 8,
        stride: (parseInt(getAttr(sourceEmbeddedData, 'mmedmajorstridebits') || '0', 10) || dataSizeBits) / 8,
        isBigEndian: getIsBigEndian(sourceEmbeddedData),
        equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
        decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
    };
}


export function parseXDF(xmlString: string): { definitions: XDFDefinition[], brand: string | null } {
    if (typeof DOMParser === 'undefined') {
        throw new Error("O ambiente não suporta DOMParser.");
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        console.error("Erro de análise do XDF:", parseError.textContent);
        throw new Error(`Erro de análise do XDF: ${parseError.textContent}`);
    }

    const allTableElements = Array.from(xmlDoc.querySelectorAll('XDFTABLE'));
    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> foi encontrada no ficheiro.");
    }
    
    const header = findNode(xmlDoc, 'XDFHEADER');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    const allTablesMap = new Map<string, Element>();
    allTableElements.forEach(tableEl => {
        const id = getAttr(tableEl, 'uniqueid');
        if (id) {
            allTablesMap.set(id, tableEl);
        }
    });
    
    const definitions: XDFDefinition[] = [];

    allTableElements.forEach(tableEl => {
        const uniqueId = getAttr(tableEl, 'uniqueid');
        const tableName = findNode(tableEl, 'title')?.textContent?.trim();
        if (!tableName || !uniqueId) return;

        try {
            const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]');
            if (!zAxisNode) return;

            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return;

            const xAxisNode = findNode(tableEl, 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'XDFAXIS[id="y"]');
            
            if (!xAxisNode || !yAxisNode) return;
            
            const xAxisDef = parseAxisDimension(xAxisNode, allTablesMap);
            const yAxisDef = parseAxisDimension(yAxisNode, allTablesMap);

            const cols = xAxisDef.count;
            const rows = yAxisDef.count;
            
            if (cols === 0 || rows === 0) {
                // Silently ignore tables with zero dimensions
                return;
            }

            const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            const dataOrganizationStr = getAttr(zAxisNode, 'data_organization')?.toUpperCase();
            const dataOrganization: 'ROW_MAJOR' | 'COL_MAJOR' = dataOrganizationStr === 'COL_MAJOR' ? 'COL_MAJOR' : 'ROW_MAJOR';
            
            const colStrideBits = parseInt(getAttr(embeddedData, 'mmedminorstridebits') || `${dataSizeBits}`, 10);
            const rowStrideBits = parseInt(getAttr(embeddedData, 'mmedrowstridebits') || `${cols * colStrideBits}`, 10);
            
            definitions.push({
                uniqueId: uniqueId,
                name: tableName,
                address,
                rows,
                cols,
                dataSize: dataSizeBits / 8,
                colStrideBytes: colStrideBits / 8, 
                rowStrideBytes: rowStrideBits / 8,
                dataOrganization,
                isBigEndian: getIsBigEndian(embeddedData),
                equation: getAttr(findNode(zAxisNode, 'math', 'MATH'), 'equation') || 'X',
                decimalpl: parseInt(findNode(zAxisNode, 'decimalpl')?.textContent || '2', 10),
                xAxisDef,
                yAxisDef,
            });
        } catch (e) {
             if (e instanceof Error) {
                 console.warn(`Aviso ao analisar a tabela "${tableName}" (ID: ${uniqueId}): ${e.message}. Esta tabela será ignorada.`);
            }
        }
    });

    return { definitions, brand };
}


export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisDataState {
    const { count = 0, label = 'Eixo Desconhecido' } = axisDef || {};
    
    if (axisDef?.values && axisDef.values.length > 0) {
        const numValues = axisDef.values.map(v => typeof v === 'number' ? v : (parseFloat(v as string) || v) );
        return {
            label,
            raw: Array.from({ length: numValues.length }, (_, i) => i),
            calculated: numValues,
        };
    }
    
    const defaultState: AxisDataState = {
        label,
        raw: [],
        calculated: [],
    };

    if (!axisDef || !binBuffer || axisDef.address === undefined || axisDef.address === null || isNaN(axisDef.address)) {
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

        let rawValue;
        if (dataSize === 1) {
            rawValue = view.getUint8(offset);
        } else if (dataSize === 2) {
            rawValue = view.getUint16(offset, useLittleEndian);
        } else {
            rawValue = 0;
        }
        
        raw.push(rawValue);
        try {
            const result = equationFunc(rawValue);
            calculated.push(result);
        } catch (e) {
            calculated.push(rawValue);
        }
    }
    return { raw, calculated, label };
}

export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
): { calculatedMap: MapData, rawMap: MapData, axes: { x: AxisDataState, y: AxisDataState } } {
    
    const xAxis = readAxisFromBin(binBuffer, def.xAxisDef);
    const yAxis = readAxisFromBin(binBuffer, def.yAxisDef);

    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    const equation = normalizeEquation(def.equation);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    const rawMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));
    const calculatedMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const offset = getCellAddress(def, r, c);
            
            if (offset === null || offset + def.dataSize > view.byteLength) continue;
            
            try {
                let rawValue;
                if (def.dataSize === 1) {
                    rawValue = view.getUint8(offset);
                } else if (def.dataSize === 2) {
                    rawValue = view.getUint16(offset, useLittleEndianForZ);
                } else {
                    rawValue = 0;
                }
                rawMap[r][c] = rawValue;

                const calcResult = zEquationFunc(rawValue);
                calculatedMap[r][c] = typeof calcResult === 'number' ? calcResult : parseFloat(calcResult as string);

            } catch (e) {
                // Silenciosamente ignorar células que falham
            }
        }
    }
    
    return { 
        calculatedMap, 
        rawMap, 
        axes: { x: xAxis, y: yAxis } 
    };
}


export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def) return null;
    const { address, rowStrideBytes, colStrideBytes, dataOrganization, rows, cols } = def;

    if (rowIndex < 0 || rowIndex >= rows || colIndex < 0 || colIndex >= cols) {
        return null;
    }

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
    
    // Y = (X - C1) / C2  => X = (Y * C2) + C1
    let match = sanitizedEq.match(/^\(\s*X\s*-\s*([\d.]+)\s*\)\s*\/\s*([\d.]+)$/i);
    if (match) return (finalValue * parseFloat(match[2])) + parseFloat(match[1]);
    
    // Y = (X - C1) * C2  => X = (Y / C2) + C1
    match = sanitizedEq.match(/^\(\s*X\s*-\s*([\d.]+)\s*\)\s*\*\s*([\d.]+)$/i);
    if (match) return (finalValue / parseFloat(match[2])) + parseFloat(match[1]);
    
    // Y = (C1 - X) * C2 => X = C1 - (Y / C2)
    match = sanitizedEq.match(/^\(\s*([\d.]+)\s*-\s*X\s*\)\s*\*\s*([\d.]+)$/i);
    if (match) return parseFloat(match[1]) - (finalValue / parseFloat(match[2]));
    
    // Y = (X + C1) * C2 => X = (Y / C2) - C1
    match = sanitizedEq.match(/^\(\s*X\s*\+\s*([\d.]+)\s*\)\s*\*\s*([\d.]+)$/i);
    if (match) return (finalValue / parseFloat(match[2])) - parseFloat(match[1]);

    // Y = X / C  => X = Y * C
    match = sanitizedEq.match(/^X\s*\/\s*([\d.]+)$/i);
    if (match) return finalValue * parseFloat(match[1]);
    
    // Y = C / X  => X = C / Y
    match = sanitizedEq.match(/^([\d.]+)\s*\/\s*X$/i);
    if (match) {
      if (finalValue === 0) return Infinity; // Evita divisão por zero
      return parseFloat(match[1]) / finalValue;
    }

    // Y = X * C  => X = Y / C
    match = sanitizedEq.match(/^X\s*\*\s*([\d.]+)$/i);
    if (match) {
        const C = parseFloat(match[1]);
        if (C === 0) return Infinity;
        return finalValue / C;
    }

    // Y = X + C  => X = Y - C
    match = sanitizedEq.match(/^X\s*\+\s*([\d.]+)$/i);
    if (match) return finalValue - parseFloat(match[1]);
    
    // Y = C + X  => X = Y - C
    match = sanitizedEq.match(/^([\d.]+)\s*\+\s*X$/i);
    if (match) return finalValue - parseFloat(match[1]);

    // Y = X - C  => X = Y + C
    match = sanitizedEq.match(/^X\s*-\s*([\d.]+)$/i);
    if (match) return finalValue + parseFloat(match[1]);

    // Y = C - X  => X = C - Y
    match = sanitizedEq.match(/^([\d.]+)\s*-\s*X$/i);
    if (match) return parseFloat(match[1]) - finalValue;

    console.warn(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente. A devolver o valor original.`);
    return finalValue;
}

export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
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
                const newRawValue = invertEquation(def.equation, calculatedValue as number);
                newRawRow.push(newRawValue);
            } catch (e) {
                console.error(`Não foi possível recalcular o valor raw para a célula [${r}, ${c}]: ${(e as Error).message}. A usar NaN.`);
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

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r]?.[c];
            if (rawValue === null || rawValue === undefined || isNaN(rawValue)) continue;

            const offset = getCellAddress(def, r, c);

            if (offset === null || offset + def.dataSize > view.byteLength) {
                continue;
            }
            
            try {
                const intValue = Math.round(rawValue);
                if (def.dataSize === 1) {
                    view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
                } else if (def.dataSize === 2) {
                     view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), useLittleEndianForZ);
                }
            } catch (e) {
                 // Ignorar erros de escrita de célula
            }
        }
    }
    
    return newBuffer;
}
