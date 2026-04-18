
import type { XDFinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig, ModifiedCell, PotentialMap, ScanConfig, FoundAxis } from './types';
import iconv from 'iconv-lite';

// #region Utility Functions

export function evaluateEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        const sanitizedEq = equation.trim().toLowerCase().replace(/\s/g, '');
        if (sanitizedEq === 'x' || sanitizedEq === '') return value;

        if (/[^a-zA-Z0-9x\s\.\+\-\*\/()\^]/.test(sanitizedEq.replace(/pi/g, '').replace(/e/g, ''))) {
             throw new Error(`Equação contém caracteres inválidos: "${equation}"`);
        }

        // Use \b for word boundary to only replace standalone 'x'
        const expr = sanitizedEq.replace(/\bx\b/g, `(${value.toString()})`);
        // eslint-disable-next-line no-new-func
        const result = new Function('return ' + expr)();
        if (typeof result !== 'number' || !isFinite(result)) {
            return NaN;
        }
        return result;

    } catch (e) {
        console.error(`Erro ao avaliar a equação "${equation}" com o valor ${value}:`, e);
        return NaN; 
    }
}

function invertEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        const sanitizedEq = equation.trim().toLowerCase().replace(/\s/g, '');
        if (sanitizedEq === 'x' || sanitizedEq === '') return value;

        // Simple inverse for common patterns: y = x * a -> x = y / a, y = x + a -> x = y - a etc.
        const mult = /^\s*x\s*\*\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (mult) return value / parseFloat(mult[1]);

        const div = /^\s*x\s*\/\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (div) return value * parseFloat(div[1]);

        const add = /^\s*x\s*\+\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (add) return value - parseFloat(add[1]);

        const sub = /^\s*x\s*-\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (sub) return value + parseFloat(sub[1]);
        
        console.warn(`A inversão da equação "${equation}" não é suportada, o valor bruto pode estar incorreto.`);
        return value;

    } catch (e) {
        console.error(`Erro ao inverter a equação "${equation}" com o valor ${value}:`, e);
        return NaN;
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
    if (!element) return null;
    return element.getAttribute(attrName) || element.getAttribute(attrName.toUpperCase()) || null;
}

function getIsBigEndian(element: Element | null, manualOverride?: boolean | null): boolean {
    if (typeof manualOverride === 'boolean') {
        return manualOverride;
    }
    if (!element) return false;
    const attr = getAttr(element, 'bigendian');
    return attr === '1' || attr?.toLowerCase() === 'true';
}

function parseAddress(addressStr: string | null): number {
    if (!addressStr) return NaN;
    try {
        const cleanedStr = addressStr.trim().startsWith('0x') ? addressStr.trim() : '0x' + addressStr.trim();
        if (BigInt(cleanedStr) > Number.MAX_SAFE_INTEGER) {
             console.warn(`Endereço ${addressStr} é muito grande, potencial para problemas de precisão.`);
        }
        return Number(BigInt(cleanedStr));
    } catch {
        return NaN;
    }
}


function getDataSizeInBytes(element: Element | null, defaultSize: number = 1): number {
    if (!element) return defaultSize;

    let sizeBitsAttr = getAttr(element, 'mmedelementsizebits');
    
    if (!sizeBitsAttr && element.parentElement) {
         sizeBitsAttr = getAttr(element.parentElement, 'elementsizebits');
    }

    if (sizeBitsAttr) {
        const sizeBits = parseInt(sizeBitsAttr, 10);
        if (!isNaN(sizeBits) && sizeBits > 0) {
            return sizeBits / 8;
        }
    }
    return defaultSize; 
}

// #endregion

// #region XDF Parsing

function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>, manualEndian?: boolean | null): AxisDimension {
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;
    
    const indexCountNode = findNode(axisNode, 'indexcount', 'INDEXCOUNT', 'count', 'COUNT');
    const indexcount = indexCountNode ? parseInt(indexCountNode.textContent || '1', 10) : 1;
    
    const defaultLabel = findNode(axisNode, 'units', 'UNITS')?.textContent?.trim() || 'Eixo';
    
    const sortFlag = Array.from(axisNode.querySelectorAll(':scope > FLAG, :scope > flag'))
                          .some(flag => flag.textContent?.trim().toLowerCase() === 'sort');
    const requiresSort = sortFlag || getAttr(axisNode, 'sort') === '1';


    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID "${linkId}" não encontrada.`);
        
        const zAxisOfLinkedTable = linkedTable.querySelector('XDFAXIS[id="z"], XDFAXIS[ID="z"], XDFAXIS[id="Z"]');
        if (!zAxisOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada "${linkId}".`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA', 'embedinfo');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada "${linkId}".`);
        
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        if (isNaN(address)) throw new Error(`Endereço inválido na tabela vinculada "${linkId}".`);
        
        return {
            label: findNode(linkedTable, 'title', 'TITLE')?.textContent?.trim() || defaultLabel,
            count: indexcount,
            address,
            dataSize: getDataSizeInBytes(embeddedData),
            isBigEndian: getIsBigEndian(embeddedData, manualEndian),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl', 'DECIMALPL')?.textContent || '1', 10),
            requiresSort: requiresSort
        };
    }
    
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA', 'embedinfo', 'embeddeddata');
    const sourceAddress = parseAddress(getAttr(sourceEmbeddedData, 'mmedaddress'));
    if (sourceEmbeddedData && !isNaN(sourceAddress)) {
        return {
            label: defaultLabel,
            count: indexcount,
            address: sourceAddress,
            dataSize: getDataSizeInBytes(sourceEmbeddedData),
            isBigEndian: getIsBigEndian(sourceEmbeddedData, manualEndian),
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl', 'DECIMALPL')?.textContent || '1', 10),
            requiresSort: requiresSort
        };
    }
    
    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL, :scope > label'));
    if (labels.length > 0) {
        return {
            label: defaultLabel,
            count: labels.length || indexcount,
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
            decimalpl: -1,
            requiresSort: requiresSort
        };
    }
    
    // Default fallback for cases with fixed index count but no external data
    return {
        label: defaultLabel,
        count: indexcount,
        requiresSort: false,
        decimalpl: 0
    };
}


export function parseXDF(xmlString: string, manualEndian?: boolean | null): { definitions: XDFinition[], allTables: Map<string, Element> } {
    if (typeof DOMParser === 'undefined') throw new Error("O ambiente não suporta DOMParser.");
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) throw new Error(`Erro de análise do XDF: ${parseError.textContent}`);

    const allTables = new Map<string, Element>();
    const definitions: XDFinition[] = [];
    const usedIds = new Set<string>();

    // Index all tables first for cross-referencing
    xmlDoc.querySelectorAll('XDFTABLE').forEach(tableEl => {
        const id = getAttr(tableEl, 'uniqueid');
        if (id && id !== "0x0") allTables.set(id, tableEl);
    });

    xmlDoc.querySelectorAll('XDFTABLE').forEach(tableEl => {
        const originalId = getAttr(tableEl, 'uniqueid');
        const tableName = findNode(tableEl, 'title', 'TITLE')?.textContent?.trim();
        const zAxisNode = tableEl.querySelector('XDFAXIS[id="z"], XDFAXIS[ID="z"], XDFAXIS[id="Z"]');
        
        if (!tableName || !zAxisNode) return;
        
        const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA', 'embedinfo');
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        
        let uniqueId = originalId;
        if (!uniqueId || uniqueId === "0x0" || usedIds.has(uniqueId)) {
            uniqueId = `${tableName}-${getAttr(embeddedData, 'mmedaddress') || Math.random()}`;
        }
        usedIds.add(uniqueId);

        try {
            if (isNaN(address)) return;

            const xAxisNode = tableEl.querySelector('XDFAXIS[id="x"], XDFAXIS[ID="x"], XDFAXIS[id="X"]');
            const yAxisNode = tableEl.querySelector('XDFAXIS[id="y"], XDFAXIS[ID="y"], XDFAXIS[id="Y"]');
            
            // Allow 1D tables or tables with missing axis definitions by creating placeholders
            const xAxisDef = xAxisNode ? parseAxisDimension(xAxisNode, allTables, manualEndian) : { label: 'Colunas', count: 1, requiresSort: false, decimalpl: 0 };
            const yAxisDef = yAxisNode ? parseAxisDimension(yAxisNode, allTables, manualEndian) : { label: 'Linhas', count: 1, requiresSort: false, decimalpl: 0 };
            
            const tableFlags = Array.from(zAxisNode.querySelectorAll(':scope > FLAG, :scope > flag')).map(f => f.textContent?.trim().toLowerCase());
            const isRowMajor = tableFlags.includes('row_major') || !tableFlags.includes('col_major');
            
            const zDataSizeBitsAttr = getAttr(embeddedData, 'mmedelementsizebits');
            const zDataSizeBits = zDataSizeBitsAttr ? parseInt(zDataSizeBitsAttr, 10) : 0;
            const dataSize = (zDataSizeBits > 0) ? zDataSizeBits / 8 : 1;
            
            let rowStride;
            const rowStrideAttr = getAttr(zAxisNode, 'rowstride') || getAttr(zAxisNode, 'ROWSTRIDE');
            if(rowStrideAttr) {
                rowStride = parseInt(rowStrideAttr, 16);
            }

            definitions.push({
                uniqueId,
                name: tableName,
                address,
                rows: yAxisDef.count,
                cols: xAxisDef.count,
                dataSize,
                isBigEndian: getIsBigEndian(embeddedData, manualEndian),
                isRowMajor,
                equation: getAttr(findNode(zAxisNode, 'math', 'MATH'), 'equation') || 'x',
                decimalpl: parseInt(findNode(zAxisNode, 'decimalpl', 'DECIMALPL')?.textContent || '2', 10),
                xAxisDef,
                yAxisDef,
                rowStride
            });

        } catch (e) {
             console.warn(`Aviso ao analisar a tabela "${tableName}": ${e instanceof Error ? e.message : String(e)}`);
        }
    });

    return { definitions, allTables };
}
// #endregion

// #region BIN Reading and Processing

export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension, stride?: number): AxisData {
    if (!axisDef) throw new Error("Definição de eixo fornecida é inválida.");
    
    if (axisDef.address === undefined || axisDef.address === null || isNaN(axisDef.address)) {
        const count = axisDef.count > 0 ? axisDef.count : (axisDef.values?.length || 1);
        const calculated = axisDef.values || Array.from({ length: count }, (_, i) => i);
        return {
            label: axisDef.label || 'Índice',
            raw: [],
            calculated: calculated as (string | number)[],
            address: null,
            originalIndices: Array.from({ length: count }, (_, i) => i)
        };
    }

    const { address, count, dataSize = 1, equation = 'x', isBigEndian = false } = axisDef;
    const effectiveStride = stride ?? dataSize;
    
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const rawValues: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = address + (i * effectiveStride);
        if (offset + dataSize > view.byteLength) {
             rawValues.push(0);
             continue;
        };

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else if (dataSize === 4) rawValue = view.getUint32(offset, useLittleEndian);
        else rawValue = 0;
        
        rawValues.push(rawValue);
    }
    
    const calculatedValues = rawValues.map(r => evaluateEquation(equation, r));
    const originalIndices = rawValues.map((_, i) => i);
    
    return { raw: rawValues, calculated: calculatedValues, label: axisDef.label, address, originalIndices };
}


function processMap(
    binBuffer: ArrayBuffer, 
    mapDef: XDFinition, 
    xAxisData: AxisData, 
    yAxisData: AxisData,
    sortX: boolean,
    sortY: boolean,
    zStride?: number,
    rowStrideOverride?: number,
): ProcessedMap {
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !mapDef.isBigEndian;
    const effectiveZStride = zStride ?? mapDef.dataSize;

    const rawMap: MapData = Array.from({ length: mapDef.rows }, () => Array(mapDef.cols).fill(null));
    const addressMap: MapData = Array.from({ length: mapDef.rows }, () => Array(mapDef.cols).fill(null));
    
    const rowStride = rowStrideOverride ?? mapDef.rowStride ?? (mapDef.cols * effectiveZStride);
    const colStride = mapDef.rows * effectiveZStride;

    for (let r = 0; r < mapDef.rows; r++) {
        for (let c = 0; c < mapDef.cols; c++) {
            let offset: number;
            
            if (mapDef.isRowMajor) {
                 offset = mapDef.address + (r * rowStride) + (c * effectiveZStride);
            } else {
                 offset = mapDef.address + (c * colStride) + (r * effectiveZStride);
            }
            
            addressMap[r][c] = offset;

            if (offset === null || isNaN(offset) || offset + effectiveZStride > view.byteLength) continue;
            
            let rawValue;
            if (effectiveZStride === 1) rawValue = view.getUint8(offset);
            else if (effectiveZStride === 2) rawValue = view.getUint16(offset, useLittleEndianForZ);
            else if (effectiveZStride === 4) rawValue = view.getUint32(offset, useLittleEndianForZ);
            else rawValue = 0;
            
            rawMap[r][c] = rawValue;
        }
    }
    
    const createSortMap = (axis: AxisData, shouldSort: boolean) => {
        const indexed = axis.calculated.map((val, index) => ({ val, index }));
        
        if (shouldSort) {
            if (typeof indexed[0]?.val === 'number') {
                indexed.sort((a, b) => (a.val as number) - (b.val as number));
            } else {
                 indexed.sort((a,b) => String(a.val).localeCompare(String(b.val)));
            }
        }
        return {
            sortedValues: indexed.map(item => item.val),
            originalIndices: indexed.map(item => item.index),
        };
    };

    const xSortMap = createSortMap(xAxisData, sortX);
    const ySortMap = createSortMap(yAxisData, sortY);

    const calculatedMap: MapData = [];
    const sortedAddresses: MapData = [];
    const finalRawMap: MapData = [];

    for (const yOrigIndex of ySortMap.originalIndices) {
        const sortedRow: (number | null)[] = [];
        const sortedAddressRow: (number | null)[] = [];
        const sortedRawRow: (number | null)[] = [];

        for (const xOrigIndex of xSortMap.originalIndices) {
            const rawValue = rawMap[yOrigIndex]?.[xOrigIndex];
            sortedAddressRow.push(addressMap[yOrigIndex]?.[xOrigIndex] ?? null);
            sortedRawRow.push(rawValue ?? null);

            if(rawValue === null || rawValue === undefined || isNaN(rawValue)) {
                sortedRow.push(null);
            } else {
                const calculatedValue = evaluateEquation(mapDef.equation, rawValue);
                sortedRow.push(isNaN(calculatedValue) ? null : calculatedValue);
            }
        }
        calculatedMap.push(sortedRow);
        sortedAddresses.push(sortedAddressRow);
        finalRawMap.push(sortedRawRow);
    }

    const finalXAxis: AxisData = { ...xAxisData, calculated: xSortMap.sortedValues, originalIndices: xSortMap.originalIndices };
    const finalYAxis: AxisData = { ...yAxisData, calculated: ySortMap.sortedValues, originalIndices: ySortMap.originalIndices };
    
    return { 
        calculatedMap,
        rawMap: finalRawMap, 
        addresses: sortedAddresses,
        axes: { x: finalXAxis, y: finalYAxis } 
    };
}


export function readAndCalculateMapFromBin(binBuffer: ArrayBuffer, def: XDFinition): ProcessedMap {
    if (!def.xAxisDef || !def.yAxisDef) throw new Error(`Definições de eixo ausentes.`);
    
    const tempConfig: ManualAxisConfig = {
        x: { equation: def.xAxisDef.equation || 'x', stride: def.xAxisDef.dataSize },
        y: { equation: def.yAxisDef.equation || 'x', stride: def.yAxisDef.dataSize },
        z: { equation: def.equation || 'x', stride: def.dataSize, rowStride: def.rowStride },
        isBigEndian: def.isBigEndian,
        sortX: def.xAxisDef.requiresSort,
        sortY: def.yAxisDef.requiresSort,
    };
    
    return readAndCalculateMapFromBinManual(binBuffer, def, tempConfig);
}

export function readAndCalculateMapFromBinManual(
    binBuffer: ArrayBuffer, 
    def: XDFinition, 
    manualConfig: ManualAxisConfig
): ProcessedMap {

    if(!def.xAxisDef || !def.yAxisDef){
         throw new Error("Definições de eixo originais necessárias.");
    }
    
    const xStride = manualConfig.x.stride ?? def.xAxisDef.dataSize;
    const yStride = manualConfig.y.stride ?? def.yAxisDef.dataSize;
    const zStride = manualConfig.z.stride ?? def.dataSize;

    const manualXAxisDef: AxisDimension = { 
        ...def.xAxisDef, 
        equation: manualConfig.x.equation,
        dataSize: xStride,
        isBigEndian: manualConfig.isBigEndian ?? def.xAxisDef.isBigEndian
    };
    const manualYAxisDef: AxisDimension = { 
        ...def.yAxisDef, 
        equation: manualConfig.y.equation,
        dataSize: yStride,
        isBigEndian: manualConfig.isBigEndian ?? def.yAxisDef.isBigEndian
    };
    const manualMapDef: XDFinition = { 
        ...def, 
        equation: manualConfig.z.equation,
        dataSize: zStride,
        isBigEndian: manualConfig.isBigEndian ?? def.isBigEndian
    };
    
    let sortX = manualConfig.sortX ?? def.xAxisDef.requiresSort;
    let sortY = manualConfig.sortY ?? def.yAxisDef.requiresSort;
    
    const xAxisData = readAxisFromBin(binBuffer, manualXAxisDef, manualXAxisDef.dataSize);
    const yAxisData = readAxisFromBin(binBuffer, manualYAxisDef, manualYAxisDef.dataSize);
    
    return processMap(binBuffer, manualMapDef, xAxisData, yAxisData, sortX, sortY, zStride, manualConfig.z.rowStride);
}

export function writeMapToBin(binBuffer: ArrayBuffer, def: XDFinition, processedMap: ProcessedMap): ArrayBuffer {
    if (!processedMap || !processedMap.calculatedMap || !processedMap.addresses) {
        throw new Error("Dados inválidos para escrita.");
    }

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    const useLittleEndian = !def.isBigEndian;

    const { calculatedMap, addresses } = processedMap;

    for (let r = 0; r < calculatedMap.length; r++) {
        for (let c = 0; c < calculatedMap[r].length; c++) {
            const calculatedValue = calculatedMap[r][c];
            const address = addresses[r]?.[c];

            if (calculatedValue === null || calculatedValue === undefined || address === null || address === undefined) {
                continue;
            }
            
            const rawValue = invertEquation(def.equation, calculatedValue);
            if (isNaN(rawValue)) continue;

            let maxVal;
            if (def.dataSize === 1) maxVal = 0xFF;
            else if (def.dataSize === 2) maxVal = 0xFFFF;
            else if (def.dataSize === 4) maxVal = 0xFFFFFFFF;
            else maxVal = Infinity;

            const clampedValue = Math.max(0, Math.min(Math.round(rawValue), maxVal));

            if (address + def.dataSize > view.byteLength) continue;

            if (def.dataSize === 1) view.setUint8(address, clampedValue);
            else if (def.dataSize === 2) view.setUint16(address, clampedValue, useLittleEndian);
            else if (def.dataSize === 4) view.setUint32(address, clampedValue, useLittleEndian);
        }
    }

    return newBuffer;
}

export function writeMultipleMapsToBin(
    originalBinBuffer: ArrayBuffer,
    mapsToSave: { definition: XDFinition; processedMap: ProcessedMap }[]
): ArrayBuffer {
    const newBuffer = originalBinBuffer.slice(0);
    const view = new DataView(newBuffer);

    for (const { definition: def, processedMap } of mapsToSave) {
        if (!processedMap || !processedMap.calculatedMap || !processedMap.addresses) continue;

        const { calculatedMap, addresses } = processedMap;
        const useLittleEndian = !def.isBigEndian;

        for (let r = 0; r < calculatedMap.length; r++) {
            for (let c = 0; c < calculatedMap[r].length; c++) {
                const calculatedValue = calculatedMap[r][c];
                const address = addresses[r]?.[c];

                if (calculatedValue === null || calculatedValue === undefined || address === null || address === undefined) continue;

                const rawValue = invertEquation(def.equation, calculatedValue);
                if (isNaN(rawValue)) continue;

                let maxVal;
                if (def.dataSize === 1) maxVal = 0xFF;
                else if (def.dataSize === 2) maxVal = 0xFFFF;
                else if (def.dataSize === 4) maxVal = 0xFFFFFFFF;
                else maxVal = Infinity;
                const clampedValue = Math.max(0, Math.min(Math.round(rawValue), maxVal));

                if (address + def.dataSize > view.byteLength) continue;

                if (def.dataSize === 1) view.setUint8(address, clampedValue);
                else if (def.dataSize === 2) view.setUint16(address, clampedValue, useLittleEndian);
                else if (def.dataSize === 4) view.setUint32(address, clampedValue, useLittleEndian);
            }
        }
    }

    return newBuffer;
}
// #endregion


// #region AI Tuning Logic

function findClosestIndex(arr: (number | string)[], target: number): number {
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < arr.length; i++) {
        const val = Number(arr[i]);
        if (isNaN(val)) continue;
        const diff = Math.abs(val - target);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    return closestIndex;
}

function findKeyInHeader(header: string[], targetLabels: string[]): string | undefined {
    for (const targetLabel of targetLabels) {
        const cleanTargetLabel = targetLabel.trim().toLowerCase();
        for (const key of header) {
            const cleanKey = key.trim().toLowerCase();
            if (cleanKey.includes(cleanTargetLabel)) return key;
        }
    }
    return undefined;
}


export function calculateCorrections(
    processedMap: ProcessedMap,
    logData: any[],
    targetLambda: number | { low: number, high: number, threshold: number },
    aggressiveness: number,
    loadLogColumn?: string,
    loadMapValues?: number[],
): { correctedMap: MapData, modifiedIndices: ModifiedCell[] } {
    if (!processedMap || !processedMap.calculatedMap || !processedMap.axes) {
        throw new Error("Mapa processado inválido.");
    }
     if (!logData || logData.length === 0) {
        throw new Error("Dados de ensaio vazios.");
    }

    const { calculatedMap, axes } = processedMap;
    const { x: xAxis, y: yAxis } = axes;
    const newMap = calculatedMap.map(row => [...row]);
    const modifiedIndices: ModifiedCell[] = [];

    const header = Object.keys(logData[0] || {});
    const isRpm = (label: string) => /rpm|rotacao|rotação/i.test(label);

    const xIsRpm = xAxis.label && isRpm(xAxis.label);
    const yIsRpm = yAxis.label && isRpm(yAxis.label);

    let rpmMapAxis: AxisData, loadMapAxis: AxisData;
    let rpmIsYAxis: boolean;

    if (xIsRpm) {
        rpmMapAxis = xAxis; loadMapAxis = yAxis; rpmIsYAxis = false;
    } else if (yIsRpm) {
        rpmMapAxis = yAxis; loadMapAxis = xAxis; rpmIsYAxis = true;
    } else {
        const xMax = Math.max(...xAxis.calculated.map(v => Number(v)).filter(isFinite));
        const yMax = Math.max(...yAxis.calculated.map(v => Number(v)).filter(isFinite));
        if (xMax > yMax) {
            rpmMapAxis = xAxis; loadMapAxis = yAxis; rpmIsYAxis = false;
        } else {
            rpmMapAxis = yAxis; loadMapAxis = xAxis; rpmIsYAxis = true;
        }
    }

    const rpmLogKey = findKeyInHeader(header, ['rpm', 'rotacao']);
    const lambdaLogKey = findKeyInHeader(header, ['lambda', 'sonda']);
    
    if (!rpmLogKey || !lambdaLogKey) throw new Error(`Colunas RPM ou Lambda não encontradas.`);

    let fixedLoadIndices: number[] = [];
    if (loadMapValues && loadMapValues.length > 0) {
        fixedLoadIndices = loadMapValues.map(val => findClosestIndex(loadMapAxis.calculated, val));
    }

    // Intervalo de Sonda Lambda realista para um motor em funcionamento (0.70 a 1.20)
    // Valores fora disto (como 0.50, 1.30, 3.0) são erros ou cut-off e devem ser ignorados.
    const MIN_SANE_LAMBDA = 0.70;
    const MAX_SANE_LAMBDA = 1.20;
    
    logData.forEach(logEntry => {
        const logRpm = logEntry[rpmLogKey];
        const measuredLambda = logEntry[lambdaLogKey];

        // Software inteligente: descarta leituras absurdas de sonda
        if (
            logRpm === undefined || measuredLambda === undefined || 
            isNaN(logRpm) || isNaN(measuredLambda) ||
            measuredLambda < MIN_SANE_LAMBDA || measuredLambda > MAX_SANE_LAMBDA
        ) return;

        const rpmIndex = findClosestIndex(rpmMapAxis.calculated, logRpm);
        if (rpmIndex === -1) return;
        
        // Determinar o alvo dinâmico se configurado
        let currentTarget: number;
        if (typeof targetLambda === 'number') {
            currentTarget = targetLambda;
        } else {
            currentTarget = logRpm < targetLambda.threshold ? targetLambda.low : targetLambda.high;
        }

        let targetLoadIndices: number[] = [];
        if (loadLogColumn) {
            const logLoad = logEntry[loadLogColumn];
            const idx = findClosestIndex(loadMapAxis.calculated, logLoad);
            if (idx !== -1) targetLoadIndices.push(idx);
        } else if (fixedLoadIndices.length > 0) {
            targetLoadIndices = fixedLoadIndices;
        }

        targetLoadIndices.forEach(currentLoadIndex => {
            const yIndex = rpmIsYAxis ? rpmIndex : currentLoadIndex;
            const xIndex = rpmIsYAxis ? currentLoadIndex : rpmIndex;

            const currentValue = newMap[yIndex]?.[xIndex];
            if (currentValue === null || currentValue === undefined) return;

            // Fator de correção para Tempo de Injeção:
            // Sonda Lida / Sonda Alvo = Fator de Correção
            // Ex: Lida 1.0 (Pobre) / Alvo 0.85 = 1.176. Aumenta o tempo de injeção corretamente.
            const correctionFactor = measuredLambda / currentTarget;
            const fullyCorrectedValue = currentValue * correctionFactor;
            const difference = fullyCorrectedValue - currentValue;
            const finalCorrectedValue = currentValue + (difference * (aggressiveness / 100));

            newMap[yIndex][xIndex] = finalCorrectedValue;
            modifiedIndices.push({ y: yIndex, x: xIndex });
        });
    });
    
    const uniqueModifiedIndices = Array.from(new Set(modifiedIndices.map(cell => JSON.stringify(cell)))).map(str => JSON.parse(str));
    return { correctedMap: newMap, modifiedIndices: uniqueModifiedIndices };
}
// #endregion
