import type { XDFDefinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig } from './types';

// #region Utility Functions

function evaluateEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        const sanitizedEq = equation.trim().toLowerCase().replace(/\s/g, '');
        if (sanitizedEq === 'x' || sanitizedEq === '') return value;

        // More robust replacement for 'x'
        const expr = sanitizedEq.replace(/x/g, `(${value.toString()})`);
        
        // Very basic safety check, allows numbers, x, and basic operators.
        // Avoids using Function constructor for security.
        if (!/^[0-9().+\-*/x\s]+$/.test(sanitizedEq)) {
             console.warn(`Potentially unsafe or complex equation: "${equation}". Evaluating with limited capabilities.`);
        }
        
        // This is a safer, but more limited evaluator.
        // It won't handle things like Math.pow, etc. but is fine for basic arithmetic.
        let match;
        
        // Order of operations is NOT handled here, it's a simple left-to-right eval.
        // For XDFs, it's usually one or two operations, so this is often sufficient.
        
        // (x-a)/b
        match = expr.match(/^\(x-([0-9.-]+)\)\/([0-9.-]+)$/);
        if (match) return (value - parseFloat(match[1])) / parseFloat(match[2]);
        
        // x/a
        match = expr.match(/^x\/([0-9.-]+)$/);
        if (match) return value / parseFloat(match[1]);

        // x*a
        match = expr.match(/^x\*([0-9.-]+)$/);
        if (match) return value * parseFloat(match[1]);

        // x+a
        match = expr.match(/^x\+([0-9.-]+)$/);
        if (match) return value + parseFloat(match[1]);
        
        // x-a
        match = expr.match(/^x-([0-9.-]+)$/);
        if (match) return value - parseFloat(match[1]);
        
        // For more complex but still safe equations, a proper parser would be needed.
        // For now, we return the value if the equation is not a simple pattern.
        // console.warn(`Equation "${equation}" is too complex for the simple evaluator. Using original value.`);
        return value;

    } catch (e) {
        console.error(`Error evaluating equation "${equation}" with value ${value}:`, e);
        return value; // Return original value on error
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

function getDataSize(element: Element | null, axisNode: Element | null): number {
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
    
    // Case 1: Axis data is linked from another table
    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        
        const zAxisOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada ${linkId}`);
        
        return {
            label: findNode(linkedTable, 'title')?.textContent?.trim() || defaultLabel,
            count: parseInt(getAttr(embeddedData, 'mmedrowcount') || getAttr(embeddedData, 'mmedcolcount') || `${indexcount}` || '0', 10),
            address: parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16),
            dataSize: getDataSize(embeddedData, zAxisOfLinkedTable),
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Case 2: Axis data is embedded directly in the axis definition
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA', 'embedinfo');
    if (sourceEmbeddedData && getAttr(sourceEmbeddedData, 'mmedaddress')) {
        return {
            label: defaultLabel,
            count: parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || getAttr(sourceEmbeddedData, 'mmedrowcount') || `${indexcount}` || '0', 10),
            address: parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16),
            dataSize: getDataSize(sourceEmbeddedData, axisNode),
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
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return;

            const xAxisNode = findNode(tableEl, 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'XDFAXIS[id="y"]');
            if (!xAxisNode || !yAxisNode) return;

            const xAxisDef = parseAxisDimension(xAxisNode, allTablesMap);
            const yAxisDef = parseAxisDimension(yAxisNode, allTablesMap);

            if (xAxisDef.count === 0 || yAxisDef.count === 0) return;
            
            definitions.push({
                uniqueId: uniqueId,
                name: tableName,
                address,
                rows: yAxisDef.count,
                cols: xAxisDef.count,
                dataSize: getDataSize(embeddedData, zAxisNode),
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
        if (offset + dataSize > view.byteLength) continue;

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
             // Optional: sort alphabetically if strings, otherwise keep original order
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
            sortedRow.push(rawValue !== null ? evaluateEquation(def.equation, rawValue) : null);
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
        count: parseInt(manual.count),
        address: parseInt(manual.address, 16),
        dataSize: parseInt(manual.dataSize) / 8,
        isBigEndian: manual.isBigEndian === 'true',
        equation: manual.equation
    });

    const xAxisDef = manualToAxisDim(manualConfig.x);
    const yAxisDef = manualToAxisDim(manualConfig.y);

    const xAxisData = readAxisFromBin(binBuffer, xAxisDef);
    const yAxisData = readAxisFromBin(binBuffer, yAxisDef);

    // Ensure the map dimensions in the definition match the manual counts
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
