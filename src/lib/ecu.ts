
import type { XDFDefinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig } from './types';

// #region Utility Functions

function evaluateEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        const sanitizedEq = equation.trim().toLowerCase().replace(/\s/g, '');
        if (sanitizedEq === 'x' || sanitizedEq === '') return value;

        const expr = sanitizedEq.replace(/x/g, `(${value.toString()})`);
        
        // This is a security risk in a real application.
        // For this specific use case, we are assuming XDF equations are safe.
        // A proper math parser would be a safer long-term solution.
        // eslint-disable-next-line no-new-func
        return new Function('return ' + expr)();
    } catch (e) {
        console.error(`Error evaluating equation "${equation}" with value ${value}:`, e);
        return value; 
    }
}


function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    for (const selector of selectors) {
        const node = parent.querySelector(`:scope > ${selector}`);
        if (node) return node;
    }
    return null;
}

function getAttr(element: Element | null, attrName: string): string | null {
    return element?.getAttribute(attrName) ?? null;
}

function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    return attr === '1' || attr?.toLowerCase() === 'true';
}

// Ensure address parsing handles potential BigInts from hex strings
function parseAddress(addressStr: string | null): number {
    if (!addressStr) return NaN;
    // Use BigInt for parsing to handle addresses larger than Number.MAX_SAFE_INTEGER
    // then convert to Number. This is generally safe as buffer offsets won't exceed this.
    try {
        return Number(BigInt(addressStr.startsWith('0x') ? addressStr : '0x' + addressStr));
    } catch {
        return NaN;
    }
}

function getDataSizeInBytes(element: Element | null, axisNode: Element | null): number {
    const sizeBits = parseInt(getAttr(element, 'mmedelementsizebits') || getAttr(axisNode, 'elementsizebits') || '8', 10);
    return sizeBits / 8;
}

// #endregion

// #region XDF Parsing

function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>): AxisDimension {
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;
    const indexcount = parseInt(findNode(axisNode, 'indexcount')?.textContent || '0', 10);
    const defaultLabel = findNode(axisNode, 'units')?.textContent?.trim() || 'Eixo Desconhecido';
    
    // Case 1: Axis data is linked from another table (correct way for breakpoints)
    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        
        // A tabela vinculada (de breakpoint) geralmente define seus dados no eixo Z
        const zAxisOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisOf-linked-table) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada ${linkId}`);
        
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        if (isNaN(address)) throw new Error(`Endereço inválido na tabela vinculada ${linkId}`);

        // O número de elementos é a contagem de colunas ou linhas da tabela de breakpoint
        const count = parseInt(getAttr(embeddedData, 'mmedcolcount') || getAttr(embeddedData, 'mmedrowcount') || '0', 10);

        return {
            label: findNode(linkedTable, 'title')?.textContent?.trim() || defaultLabel,
            count: count,
            address: address,
            dataSize: getDataSizeInBytes(embeddedData, zAxisOfLinkedTable),
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Case 2: Axis data is embedded directly in the axis definition (less common for main maps)
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA', 'embedinfo');
    const sourceAddress = parseAddress(getAttr(sourceEmbeddedData, 'mmedaddress'));
    if (sourceEmbeddedData && !isNaN(sourceAddress)) {
         const count = parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || getAttr(sourceEmbeddedData, 'mmedrowcount') || `${indexcount}` || '0', 10);
        return {
            label: defaultLabel,
            count: count,
            address: sourceAddress,
            dataSize: getDataSizeInBytes(sourceEmbeddedData, axisNode),
            isBigEndian: getIsBigEndian(sourceEmbeddedData),
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Case 3: Axis uses hardcoded text labels
    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL'));
    if (labels.length > 0) {
        return {
            label: defaultLabel,
            count: labels.length || indexcount,
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
            decimalpl: 0,
        };
    }
    
    throw new Error(`Definição de eixo não suportada ou incompleta para: ${defaultLabel}`);
}


export function parseXDF(xmlString: string): { definitions: XDFDefinition[], brand: string | null } {
    if (typeof DOMParser === 'undefined') throw new Error("O ambiente não suporta DOMParser.");
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) throw new Error(`Erro de análise do XDF: ${parseError.textContent}`);

    const allTablesMap = new Map<string, Element>();
    xmlDoc.querySelectorAll('XDFTABLE').forEach(tableEl => {
        const id = getAttr(tableEl, 'uniqueid');
        if (id) allTablesMap.set(id, tableEl);
    });

    const definitions: XDFDefinition[] = [];
    const header = findNode(xmlDoc, 'XDFHEADER');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    allTablesMap.forEach(tableEl => {
        const uniqueId = getAttr(tableEl, 'uniqueid');
        const tableName = findNode(tableEl, 'title')?.textContent?.trim();
        if (!tableName || !uniqueId) return;

        try {
            const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]');
            if (!zAxisNode) return;

            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
            // Se a tabela não tem um endereço para seus dados Z, provavelmente é uma tabela de eixos, não um mapa principal.
            if (isNaN(address)) return;

            const xAxisNode = findNode(tableEl, 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'XDFAXIS[id="y"]');
            if (!xAxisNode || !yAxisNode) return;

            const xAxisDef = parseAxisDimension(xAxisNode, allTablesMap);
            const yAxisDef = parseAxisDimension(yAxisNode, allTablesMap);

            // Se os eixos não puderam ser definidos (sem contagem), ignore este mapa.
            if (xAxisDef.count === 0 || yAxisDef.count === 0) return;
            
            definitions.push({
                uniqueId: uniqueId,
                name: tableName,
                address,
                rows: yAxisDef.count,
                cols: xAxisDef.count,
                dataSize: getDataSizeInBytes(embeddedData, zAxisNode),
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
// #endregion

// #region BIN Reading and Processing

function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisData {
    const defaultState: AxisData = { label: 'Indefinido', raw: [], calculated: [], address: null, originalIndices: [] };
    if (!axisDef) return defaultState;
    
    if (axisDef.values) {
        const indices = axisDef.values.map((_, i) => i);
        return { label: axisDef.label, raw: [], calculated: axisDef.values, address: null, originalIndices: indices };
    }

    const { address, count, dataSize = 2, equation = 'X', isBigEndian = false } = axisDef;
    if (address === undefined || address === null || isNaN(address) || count === 0) {
        return { ...defaultState, label: axisDef.label };
    }
    
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const raw: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = address + (i * dataSize);
        if (offset + dataSize > view.byteLength) {
            console.warn(`Offset de leitura do eixo ${axisDef.label} fora dos limites do ficheiro.`);
            continue;
        };

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else if (dataSize === 4) rawValue = view.getUint32(offset, useLittleEndian);
        else rawValue = 0;
        
        raw.push(rawValue);
    }
    
    const calculated = raw.map(r => evaluateEquation(equation, r));
    const originalIndices = raw.map((_, i) => i);
    
    return { raw, calculated, label: axisDef.label, address, originalIndices };
}


function processAndSortMap(
    binBuffer: ArrayBuffer, 
    def: XDFDefinition, 
    xAxisData: AxisData, 
    yAxisData: AxisData
): ProcessedMap {
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !def.isBigEndian;
    
    const rawMap: MapData = Array.from({ length: def.rows }, () => Array(def.cols).fill(null));

    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const offset = getCellAddress(def, r, c);
            if (offset === null || offset + def.dataSize > view.byteLength) continue;
            
            let rawValue;
            if (def.dataSize === 1) rawValue = view.getUint8(offset);
            else if (def.dataSize === 2) rawValue = view.getUint16(offset, useLittleEndianForZ);
            else if (def.dataSize === 4) rawValue = view.getUint32(offset, useLittleEndianForZ);
            else rawValue = 0;
            
            rawMap[r][c] = rawValue;
        }
    }
    
    // SORTING AND REMAPPING
    const createSortMap = (axis: AxisData) => {
        const indexed = axis.calculated.map((val, index) => ({ val, index }));
        if (typeof indexed[0]?.val === 'number') {
            indexed.sort((a, b) => (a.val as number) - (b.val as number));
        } else {
             indexed.sort((a,b) => String(a.val).localeCompare(String(b.val)));
        }
        return {
            sortedValues: indexed.map(item => item.val),
            originalIndices: indexed.map(item => item.index),
        };
    };

    const xSort = createSortMap(xAxisData);
    const ySort = createSortMap(yAxisData);

    const calculatedMap: MapData = [];
    for (const yOrigIndex of ySort.originalIndices) {
        const sortedRow: (number | null)[] = [];
        for (const xOrigIndex of xSort.originalIndices) {
            const rawValue = rawMap[yOrigIndex]?.[xOrigIndex];
            sortedRow.push(rawValue !== null && !isNaN(rawValue) ? evaluateEquation(def.equation, rawValue) : null);
        }
        calculatedMap.push(sortedRow);
    }

    const sortedXAxis: AxisData = { ...xAxisData, calculated: xSort.sortedValues, originalIndices: xSort.originalIndices };
    const sortedYAxis: AxisData = { ...yAxisData, calculated: ySort.sortedValues, originalIndices: ySort.originalIndices };
    
    return { 
        calculatedMap: calculatedMap,
        rawMap, 
        axes: { x: sortedXAxis, y: sortedYAxis } 
    };
}


export function readAndCalculateMapFromBin(binBuffer: ArrayBuffer, def: XDFDefinition): ProcessedMap {
    const xAxisData = readAxisFromBin(binBuffer, def.xAxisDef);
    const yAxisData = readAxisFromBin(binBuffer, def.yAxisDef);
    return processAndSortMap(binBuffer, def, xAxisData, yAxisData);
}

export function readAndCalculateMapFromBinManual(binBuffer: ArrayBuffer, def: XDFDefinition, manualConfig: ManualAxisConfig): ProcessedMap {
    const manualToAxisDim = (manual: ManualAxisConfig['x']): AxisDimension => ({
        label: manual.label,
        count: parseInt(manual.count, 10),
        address: parseAddress(manual.address),
        dataSize: parseInt(manual.dataSize, 10) / 8,
        isBigEndian: manual.isBigEndian === 'true',
        equation: manual.equation
    });

    const xAxisDef = manualToAxisDim(manualConfig.x);
    const yAxisDef = manualToAxisDim(manualConfig.y);

    const xAxisData = readAxisFromBin(binBuffer, xAxisDef);
    const yAxisData = readAxisFromBin(binBuffer, yAxisDef);

    const newDef = {...def, cols: xAxisDef.count, rows: yAxisDef.count };

    return processAndSortMap(binBuffer, newDef, xAxisData, yAxisData);
}


export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def || rowIndex < 0 || rowIndex >= def.rows || colIndex < 0 || colIndex >= def.cols) {
        return null;
    }
    const rowStride = def.cols * def.dataSize;
    return def.address + (rowIndex * rowStride) + (colIndex * def.dataSize);
}


export function recalculateRawMapFromCalculated(calculatedMap: MapData, def: XDFDefinition, originalAxes: {x: AxisData, y: AxisData}): MapData {
   throw new Error("A funcionalidade de salvar precisa ser atualizada para lidar com eixos ordenados.");
}

export function writeMapToBin(binBuffer: ArrayBuffer, def: XDFDefinition, rawMapData: MapData): ArrayBuffer {
    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    const useLittleEndianForZ = !def.isBigEndian;
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r]?.[c];
            if (rawValue === null || isNaN(rawValue)) continue;

            const offset = getCellAddress(def, r, c);
            if (offset === null || offset + def.dataSize > view.byteLength) continue;
            
            const intValue = Math.round(rawValue);
            if (def.dataSize === 1) {
                view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
            } else if (def.dataSize === 2) {
                view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), useLittleEndianForZ);
            } else if (def.dataSize === 4) {
                 view.setUint32(offset, Math.max(0, Math.min(4294967295, intValue)), useLittleEndianForZ);
            }
        }
    }
    return newBuffer;
}
// #endregion
