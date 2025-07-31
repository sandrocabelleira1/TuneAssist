
import type { XDFDefinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig } from './types';

// #region Utility Functions

function evaluateEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        // Sanitize equation: allow basic math, 'x' variable, hex/decimal numbers.
        const sanitizedEq = equation.trim().toLowerCase().replace(/\s/g, '');
        if (sanitizedEq === 'x' || sanitizedEq === '') return value;

        // More robust replacement to avoid replacing 'x' in hex values like '0x...'
        const expr = sanitizedEq.replace(/(?<![a-f0-9])x(?![a-f0-9])/g, `(${value.toString()})`);
        
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
        // Use a more specific selector to avoid grabbing nested elements incorrectly
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
    // Default to false (little-endian) if attribute is missing or not "1"
    return attr === '1' || attr?.toLowerCase() === 'true';
}

function parseAddress(addressStr: string | null): number {
    if (!addressStr) return NaN;
    try {
        // Ensure it's treated as hex even if '0x' is missing
        return Number(BigInt(addressStr.startsWith('0x') ? addressStr : '0x' + addressStr));
    } catch {
        return NaN;
    }
}

// Gets data size in bytes, looking at various possible attributes
function getDataSizeInBytes(element: Element | null, axisNode: Element | null): number {
    // mmedelementsizebits is the most specific attribute on embedded data
    // elementsizebits is a fallback on the axis itself
    const sizeBitsAttr = getAttr(element, 'mmedelementsizebits') || getAttr(axisNode, 'elementsizebits');
    const sizeBits = parseInt(sizeBitsAttr || '16', 10); // Default to 16-bit if missing
    if (isNaN(sizeBits) || sizeBits === 0) return 2; // Default to 16-bit (2 bytes) if invalid
    return sizeBits / 8;
}

// #endregion

// #region XDF Parsing

function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>): AxisDimension {
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;
    const indexcount = parseInt(findNode(axisNode, 'indexcount')?.textContent || '0', 10);
    
    let defaultLabel = findNode(axisNode, 'units')?.textContent?.trim() || 'Eixo Desconhecido';
    
    // Case 1: Axis is linked to another table for its definition
    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        
        // The definition for a linked axis comes from the Z-AXIS of the linked table
        const zAxisOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada ${linkId}`);
        
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        if (isNaN(address)) throw new Error(`Endereço inválido na tabela vinculada ${linkId}`);

        // The count comes from the linked table's embedded data (rows or cols)
        const count = parseInt(getAttr(embeddedData, 'mmedcolcount') || getAttr(embeddedData, 'mmedrowcount') || '0', 10) || indexcount;
        if (count === 0) throw new Error(`Contagem de eixo inválida para a tabela vinculada ${linkId}`);
        
        const label = findNode(linkedTable, 'title')?.textContent?.trim() || defaultLabel;

        return {
            label: label,
            count: count,
            address: address,
            dataSize: getDataSizeInBytes(embeddedData, zAxisOfLinkedTable),
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Case 2: Axis data is embedded directly
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
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Case 3: Axis has hardcoded labels
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
        const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]');
        
        // This table is a primary map, not a breakpoint/axis table
        if (!tableName || !uniqueId || !zAxisNode) return;

        try {
            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
            // If the Z-axis has no address, it can't be a primary map, so we skip it.
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
                dataSize: getDataSizeInBytes(embeddedData, zAxisNode),
                isBigEndian: getIsBigEndian(embeddedData),
                equation: getAttr(findNode(zAxisNode, 'math', 'MATH'), 'equation') || 'x',
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
    
    // If axis has hardcoded values, just use them.
    if (axisDef.values) {
        const indices = axisDef.values.map((_, i) => i);
        return { label: axisDef.label, raw: [], calculated: axisDef.values, address: null, originalIndices: indices };
    }

    const { address, count, dataSize = 2, equation = 'x', isBigEndian = false } = axisDef;
    if (address === undefined || address === null || isNaN(address) || count === 0) {
        return { ...defaultState, label: axisDef.label };
    }
    
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const raw: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = address + (i * dataSize);
        if (offset + dataSize > view.byteLength) {
            console.warn(`Offset de leitura do eixo ${axisDef.label} (0x${offset.toString(16)}) fora dos limites do ficheiro.`);
            continue;
        };

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else if (dataSize === 4) rawValue = view.getUint32(offset, useLittleEndian);
        else rawValue = 0; // Unsupported data size
        
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
    
    // This function creates a mapping from original index to sorted index.
    const createSortMap = (axis: AxisData) => {
        if (!axis || !Array.isArray(axis.calculated) || axis.calculated.length === 0) {
             return { sortedValues: [], originalIndices: [] };
        }
        const indexed = axis.calculated.map((val, index) => ({ val, index }));
        
        // Sort numerically if possible, otherwise by string representation.
        if (typeof indexed[0]?.val === 'number') {
            indexed.sort((a, b) => (a.val as number) - (b.val as number));
        } else {
             indexed.sort((a,b) => String(a.val).localeCompare(String(b.val)));
        }
        return {
            sortedValues: indexed.map(item => item.val),
            originalIndices: indexed.map(item => item.index), // This maps sorted position -> original position
        };
    };

    const xSort = createSortMap(xAxisData);
    const ySort = createSortMap(yAxisData);

    const calculatedMap: MapData = [];
    // Iterate through the newly sorted Y-axis indices
    for (const yOrigIndex of ySort.originalIndices) {
        const sortedRow: (number | null)[] = [];
        // For each Y, iterate through the newly sorted X-axis indices
        for (const xOrigIndex of xSort.originalIndices) {
            const rawValue = rawMap[yOrigIndex]?.[xOrigIndex];
            // Apply the Z-axis equation to the raw map value
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
    if (!def.xAxisDef || !def.yAxisDef) throw new Error(`Definições de eixo para o mapa "${def.name}" estão em falta.`);
    const xAxisData = readAxisFromBin(binBuffer, def.xAxisDef);
    const yAxisData = readAxisFromBin(binBuffer, def.yAxisDef);
    
    if (xAxisData.calculated.length !== def.cols || yAxisData.calculated.length !== def.rows) {
        throw new Error(`A contagem de eixos lida do BIN não corresponde às dimensões do mapa. X: ${xAxisData.calculated.length}/${def.cols}, Y: ${yAxisData.calculated.length}/${def.rows}`);
    }

    return processAndSortMap(binBuffer, def, xAxisData, yAxisData);
}

export function readAndCalculateMapFromBinManual(binBuffer: ArrayBuffer, def: XDFDefinition, manualConfig: ManualAxisConfig): ProcessedMap {
    const manualToAxisDim = (manual: ManualAxisConfig['x'] | ManualAxisConfig['y']): AxisDimension => ({
        label: manual.label,
        count: parseInt(manual.count, 10),
        address: parseAddress(manual.address),
        dataSize: parseInt(manual.dataSize, 10) / 8,
        isBigEndian: manual.isBigEndian === 'true',
        equation: manual.equation,
        decimalpl: 2, // Default decimal places for manual config
    });

    const xAxisDef = manualToAxisDim(manualConfig.x);
    const yAxisDef = manualToAxisDim(manualConfig.y);
    
    if(isNaN(xAxisDef.count) || isNaN(yAxisDef.count) || xAxisDef.count <= 0 || yAxisDef.count <= 0) {
        throw new Error("A contagem dos eixos (linhas/colunas) deve ser um número maior que zero.");
    }
    if(isNaN(xAxisDef.address) || isNaN(yAxisDef.address)) {
        throw new Error("Endereço inválido para eixos manuais. Use o formato hexadecimal (ex: 8AF4).");
    }

    // Create a new definition object with the manual overrides for rows/cols
    const newDef = {...def, cols: xAxisDef.count, rows: yAxisDef.count };

    const xAxisData = readAxisFromBin(binBuffer, xAxisDef);
    const yAxisData = readAxisFromBin(binBuffer, yAxisDef);

    return processAndSortMap(binBuffer, newDef, xAxisData, yAxisData);
}


export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def || rowIndex < 0 || rowIndex >= def.rows || colIndex < 0 || colIndex >= def.cols) {
        return null;
    }
    // Standard row-major order calculation
    const rowStride = def.cols * def.dataSize;
    return def.address + (rowIndex * rowStride) + (colIndex * def.dataSize);
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
            
            // Invert the equation to get the raw value back for writing
            // This is a complex problem and requires an inverse math parser.
            // For now, we assume the raw value is what we need to write.
            // THIS WILL NOT WORK FOR MAPS WITH COMPLEX EQUATIONS.
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

    