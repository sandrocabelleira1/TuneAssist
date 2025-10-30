

import type { XDFinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig, ModifiedCell, PotentialMap, ScanConfig, FoundAxis } from './types';

// #region Utility Functions

function evaluateEquation(equation: string, value: number): number {
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
        // eslint-disable--next-line no-new-func
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
        // This is a simplified approach and won't handle complex math.
        const mult = /^\s*x\s*\*\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (mult) return value / parseFloat(mult[1]);

        const div = /^\s*x\s*\/\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (div) return value * parseFloat(div[1]);

        const add = /^\s*x\s*\+\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (add) return value - parseFloat(add[1]);

        const sub = /^\s*x\s*-\s*([\d\.]+)\s*$/.exec(sanitizedEq);
        if (sub) return value + parseFloat(sub[1]);
        
        console.warn(`A inversão da equação "${equation}" não é suportada, o valor bruto pode estar incorreto.`);
        // Fallback for non-trivial equations - this is a weak point.
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
    return element?.getAttribute(attrName) ?? null;
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
        const cleanedStr = addressStr.startsWith('0x') ? addressStr : '0x' + addressStr;
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

    // Favor 'mmedelementsizebits' as it's the most specific for raw data reads.
    let sizeBitsAttr = getAttr(element, 'mmedelementsizebits');
    
    // Fallback to 'elementsizebits' on the parent axis definition if specific one not found.
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
    
    const indexCountNode = findNode(axisNode, 'indexcount');
    if (!indexCountNode) throw new Error(`Nó 'indexcount' não encontrado na definição do eixo.`);
    const indexcount = parseInt(indexCountNode.textContent || '0', 10);
    if (indexcount === 0) throw new Error(`Contagem do eixo (indexcount) é zero.`);
    
    const defaultLabel = findNode(axisNode, 'units')?.textContent?.trim() || 'Eixo Desconhecido';
    
    // Check for sorting flag
    const sortFlag = Array.from(axisNode.querySelectorAll(':scope > FLAG'))
                          .some(flag => flag.textContent?.trim().toLowerCase() === 'sort');
    const requiresSort = sortFlag || getAttr(axisNode, 'sort') === '1';


    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID "${linkId}" não foi encontrada.`);
        
        const zAxisOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada "${linkId}".`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada "${linkId}".`);
        
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        if (isNaN(address)) throw new Error(`Endereço inválido (NaN) na tabela vinculada "${linkId}".`);
        
        return {
            label: findNode(linkedTable, 'title')?.textContent?.trim() || defaultLabel,
            count: indexcount,
            address,
            dataSize: getDataSizeInBytes(embeddedData),
            isBigEndian: getIsBigEndian(embeddedData, manualEndian),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
            requiresSort: requiresSort
        };
    }
    
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA', 'embedinfo');
    const sourceAddress = parseAddress(getAttr(sourceEmbeddedData, 'mmedaddress'));
    if (sourceEmbeddedData && !isNaN(sourceAddress)) {
        return {
            label: defaultLabel,
            count: indexcount,
            address: sourceAddress,
            dataSize: getDataSizeInBytes(sourceEmbeddedData),
            isBigEndian: getIsBigEndian(sourceEmbeddedData, manualEndian),
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'x',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
            requiresSort: requiresSort
        };
    }
    
    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL'));
    if (labels.length > 0) {
        return {
            label: defaultLabel,
            count: labels.length || indexcount,
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
            decimalpl: -1,
            requiresSort: requiresSort
        };
    }
    
    throw new Error(`Definição de eixo não suportada para: ${defaultLabel}. Verifique se está vinculada ou se tem um endereço e um 'indexcount' válido.`);
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

    xmlDoc.querySelectorAll('XDFTABLE').forEach(tableEl => {
        const originalId = getAttr(tableEl, 'uniqueid');
        const tableName = findNode(tableEl, 'title')?.textContent?.trim();
        const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]');
        
        if (!tableName || !zAxisNode) return;
        
        const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
        const address = parseAddress(getAttr(embeddedData, 'mmedaddress'));
        
        let uniqueId = originalId;
        
        if (!uniqueId || uniqueId === "0x0" || usedIds.has(uniqueId)) {
            uniqueId = `${tableName}-${getAttr(embeddedData, 'mmedaddress') || Math.random()}`;
        }
        
        if (usedIds.has(uniqueId)) {
             console.warn(`Aviso: ID único duplicado gerado "${uniqueId}" para a tabela "${tableName}". A tabela será ignorada.`);
             return;
        }
        
        usedIds.add(uniqueId);
        if (originalId) { // Still map the original ID for lookups
             allTables.set(originalId, tableEl);
        }
        allTables.set(uniqueId, tableEl);


        try {
            if (isNaN(address)) return;

            const xAxisNode = findNode(tableEl, 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'XDFAXIS[id="y"]');
            if (!xAxisNode || !yAxisNode) return;

            // When parsing axis, we must provide the full map of tables using original IDs for lookups
             const allOriginalTablesMap = new Map<string, Element>();
             xmlDoc.querySelectorAll('XDFTABLE').forEach(tEl => {
                 const id = getAttr(tEl, 'uniqueid');
                 if (id && id !== "0x0") allOriginalTablesMap.set(id, tEl);
             });

            const xAxisDef = parseAxisDimension(xAxisNode, allOriginalTablesMap, manualEndian);
            const yAxisDef = parseAxisDimension(yAxisNode, allOriginalTablesMap, manualEndian);
            
            const tableFlags = Array.from(zAxisNode.querySelectorAll(':scope > FLAG')).map(f => f.textContent?.trim().toLowerCase());
            const isRowMajor = tableFlags.includes('row_major') || !tableFlags.includes('col_major');
            
            const zDataSizeBitsAttr = getAttr(embeddedData, 'mmedelementsizebits');
            const zDataSizeBits = zDataSizeBitsAttr ? parseInt(zDataSizeBitsAttr, 10) : 0;
            const dataSize = (zDataSizeBits > 0) ? zDataSizeBits / 8 : 1;
            
            let rowStride;
            const rowStrideAttr = getAttr(zAxisNode, 'rowstride');
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
                decimalpl: parseInt(findNode(zAxisNode, 'decimalpl')?.textContent || '2', 10),
                xAxisDef,
                yAxisDef,
                rowStride
            });

        } catch (e) {
             if (e instanceof Error) {
                 console.warn(`Aviso ao analisar a tabela "${tableName}" (ID: ${uniqueId}): ${e.message}. Esta tabela será ignorada.`);
            }
        }
    });

    return { definitions, allTables };
}
// #endregion

// #region BIN Reading and Processing

export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension, stride?: number): AxisData {
    if (!axisDef) throw new Error("Definição de eixo fornecida é inválida.");
    
    // For virtual axes that don't have a real address
    if (axisDef.address === undefined || axisDef.address === null || isNaN(axisDef.address)) {
        if (axisDef.count > 0) {
            const calculated = Array.from({ length: axisDef.count }, (_, i) => i); // Simple index
            return {
                label: axisDef.label || 'Índice',
                raw: calculated,
                calculated,
                address: null,
                originalIndices: calculated.map((_, i) => i)
            };
        } else if (axisDef.values) {
            const indices = axisDef.values.map((_, i) => i);
            return { label: axisDef.label, raw: [], calculated: axisDef.values, address: null, originalIndices: indices };
        }
        throw new Error(`Endereço do eixo "${axisDef.label}" é inválido e não há valores ou contagem para gerar um eixo virtual.`);
    }

    if (axisDef.values) {
        const indices = axisDef.values.map((_, i) => i);
        return { label: axisDef.label, raw: [], calculated: axisDef.values, address: null, originalIndices: indices };
    }

    const { address, count, dataSize = 1, equation = 'x', isBigEndian = false } = axisDef;
    const effectiveStride = stride ?? dataSize;
    
    if (!count || count <= 0) {
        throw new Error(`Contagem do eixo "${axisDef.label}" deve ser maior que zero.`);
    }
    
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const rawValues: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = address + (i * effectiveStride);
        if (offset + dataSize > view.byteLength) {
            throw new Error(`Offset de leitura (0x${offset.toString(16)}) para o eixo "${axisDef.label}" está fora dos limites do ficheiro BIN.`);
        };

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else if (dataSize === 4) rawValue = view.getUint32(offset, useLittleEndian);
        else throw new Error(`Tamanho de dados não suportado (${dataSize} bytes) para o eixo "${axisDef.label}".`);
        
        rawValues.push(rawValue);
    }
    
    const calculatedValues = rawValues.map(r => evaluateEquation(equation, r));
    if(calculatedValues.some(isNaN)) {
        // Only throw error if equation was something other than 'x'
        if (equation !== 'x') {
            throw new Error(`Erro ao aplicar equação "${equation}" ao eixo "${axisDef.label}". Verifique a equação e os dados.`);
        }
    }

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
            } else { // col_major
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
                sortedRow.push(isNaN(calculatedValue) ? null : calculatedValue); // Use null if calc fails
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
    if (!def.xAxisDef || !def.yAxisDef) throw new Error(`Definições de eixo para o mapa "${def.name}" estão em falta.`);
    
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
         throw new Error("As definições de eixo originais são inválidas e necessárias para o recálculo manual.");
    }
    
    const xStride = manualConfig.x.stride ?? def.xAxisDef.dataSize;
    const yStride = manualConfig.y.stride ?? def.yAxisDef.dataSize;
    const zStride = manualConfig.z.stride ?? def.dataSize;

    // Create new definitions with manual overrides
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
    
    // Reread axes and map from scratch using manual configuration
    const xAxisData = readAxisFromBin(binBuffer, manualXAxisDef, manualXAxisDef.dataSize);
    const yAxisData = readAxisFromBin(binBuffer, manualYAxisDef, manualYAxisDef.dataSize);
    
    if (xAxisData.calculated.length !== def.cols) {
         throw new Error(`Contagem de colunas do eixo X (${xAxisData.label}: ${xAxisData.calculated.length}) não corresponde à dimensão do mapa (${def.cols}).`);
    }
    if(yAxisData.calculated.length !== def.rows){
         throw new Error(`Contagem de linhas do eixo Y (${yAxisData.label}: ${yAxisData.calculated.length}) não corresponde à dimensão do mapa (${def.rows}).`);
    }

    return processMap(binBuffer, manualMapDef, xAxisData, yAxisData, sortX, sortY, zStride, manualConfig.z.rowStride);
}

export function writeMapToBin(binBuffer: ArrayBuffer, def: XDFinition, processedMap: ProcessedMap): ArrayBuffer {
    if (!processedMap || !processedMap.calculatedMap || !processedMap.addresses) {
        throw new Error("Dados do mapa processado são inválidos ou estão em falta para a escrita.");
    }

    const newBuffer = binBuffer.slice(0); // Create a mutable copy
    const view = new DataView(newBuffer);
    const useLittleEndian = !def.isBigEndian;

    const { calculatedMap, addresses } = processedMap;

    for (let r = 0; r < calculatedMap.length; r++) {
        for (let c = 0; c < calculatedMap[r].length; c++) {
            const calculatedValue = calculatedMap[r][c];
            const address = addresses[r]?.[c];

            if (calculatedValue === null || calculatedValue === undefined || address === null || address === undefined) {
                continue; // Skip if no value or address
            }
            
            const rawValue = invertEquation(def.equation, calculatedValue);
            if (isNaN(rawValue)) {
                console.warn(`Aviso: O valor invertido para ${calculatedValue} na célula [${r},${c}] é NaN. A saltar a escrita.`);
                continue;
            }

            // Ensure the raw value fits within the data type
            let maxVal;
            if (def.dataSize === 1) maxVal = 0xFF;
            else if (def.dataSize === 2) maxVal = 0xFFFF;
            else if (def.dataSize === 4) maxVal = 0xFFFFFFFF;
            else maxVal = Infinity;

            const clampedValue = Math.max(0, Math.min(Math.round(rawValue), maxVal));

            if (address + def.dataSize > view.byteLength) {
                 console.error(`Erro: Endereço de escrita 0x${address.toString(16)} está fora dos limites do ficheiro.`);
                 continue;
            }

            if (def.dataSize === 1) {
                view.setUint8(address, clampedValue);
            } else if (def.dataSize === 2) {
                view.setUint16(address, clampedValue, useLittleEndian);
            } else if (def.dataSize === 4) {
                view.setUint32(address, clampedValue, useLittleEndian);
            }
        }
    }

    return newBuffer;
}

export function writeMultipleMapsToBin(
    originalBinBuffer: ArrayBuffer,
    mapsToSave: { definition: XDFinition; processedMap: ProcessedMap }[]
): ArrayBuffer {
    const newBuffer = originalBinBuffer.slice(0); // Create a mutable copy
    const view = new DataView(newBuffer);

    for (const { definition: def, processedMap } of mapsToSave) {
        if (!processedMap || !processedMap.calculatedMap || !processedMap.addresses) {
            console.warn(`A saltar o mapa "${def.name}" devido a dados inválidos.`);
            continue;
        }

        const { calculatedMap, addresses } = processedMap;
        const useLittleEndian = !def.isBigEndian;

        for (let r = 0; r < calculatedMap.length; r++) {
            for (let c = 0; c < calculatedMap[r].length; c++) {
                const calculatedValue = calculatedMap[r][c];
                const address = addresses[r]?.[c];

                if (calculatedValue === null || calculatedValue === undefined || address === null || address === undefined) {
                    continue;
                }

                const rawValue = invertEquation(def.equation, calculatedValue);
                if (isNaN(rawValue)) {
                    console.warn(`Aviso: O valor invertido para ${calculatedValue} no mapa "${def.name}" [${r},${c}] é NaN. A saltar.`);
                    continue;
                }

                let maxVal;
                if (def.dataSize === 1) maxVal = 0xFF;
                else if (def.dataSize === 2) maxVal = 0xFFFF;
                else if (def.dataSize === 4) maxVal = 0xFFFFFFFF;
                else maxVal = Infinity;
                const clampedValue = Math.max(0, Math.min(Math.round(rawValue), maxVal));

                if (address + def.dataSize > view.byteLength) {
                    console.error(`Erro: Endereço de escrita 0x${address.toString(16)} para o mapa "${def.name}" está fora dos limites.`);
                    continue;
                }

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

// Find a key in the log data headers that matches a target label
function findKeyInHeader(header: string[], targetLabels: string[]): string | undefined {
    for (const targetLabel of targetLabels) {
        const cleanTargetLabel = targetLabel.trim().toLowerCase();
        
        for (const key of header) {
            if (key.trim().toLowerCase().includes(cleanTargetLabel)) {
                return key;
            }
        }
    }
    return undefined;
}


export function calculateCorrections(
    processedMap: ProcessedMap,
    logData: any[],
    targetLambda: number,
    aggressiveness: number, // 0-100
    loadLogColumn?: string, // The name of the load column in the log file
    loadMapValue?: number, // The specific load value from the map axis, if log has no load column
): { correctedMap: MapData, modifiedIndices: ModifiedCell[] } {
    if (!processedMap || !processedMap.calculatedMap || !processedMap.axes) {
        throw new Error("Mapa processado inválido fornecido para correção.");
    }
     if (!logData || logData.length === 0) {
        throw new Error("Dados de ensaio estão vazios ou são inválidos.");
    }
     if (!loadLogColumn && loadMapValue === undefined) {
        throw new Error("É necessário fornecer uma coluna de carga do log ou um valor de carga do mapa.");
    }

    const { calculatedMap, axes } = processedMap;
    const { x: xAxis, y: yAxis } = axes;
    const newMap = calculatedMap.map(row => [...row]); // Create a mutable copy
    const modifiedIndices: ModifiedCell[] = [];

    const header = Object.keys(logData[0] || {});
    
    const rpmRegex = /rpm/i;
    let rpmMapAxis: AxisData, loadMapAxis: AxisData;
    let rpmIsYAxis: boolean;

    if (xAxis.label && rpmRegex.test(xAxis.label)) {
        rpmMapAxis = xAxis;
        loadMapAxis = yAxis;
        rpmIsYAxis = false;
    } else if (yAxis.label && rpmRegex.test(yAxis.label)) {
        rpmMapAxis = yAxis;
        loadMapAxis = xAxis;
        rpmIsYAxis = true;
    } else {
        throw new Error("Não foi possível identificar o eixo de RPM no mapa. Verifique as etiquetas dos eixos (deve incluir 'rpm').");
    }

    const rpmLogKey = findKeyInHeader(header, ['rpm', 'rotacao']);
    const lambdaLogKey = findKeyInHeader(header, ['lambda', 'sonda']);
    
    if (!rpmLogKey) throw new Error(`Não foi possível encontrar a coluna 'RPM' nos dados do ensaio. Cabeçalhos: ${header.join(', ')}`);
    if (!lambdaLogKey) throw new Error(`Não foi possível encontrar a coluna 'Lambda' ou 'Sonda' nos dados do ensaio. Cabeçalhos: ${header.join(', ')}`);

    let fixedLoadIndex: number | undefined = undefined;
    if (loadMapValue !== undefined) {
        fixedLoadIndex = findClosestIndex(loadMapAxis.calculated, loadMapValue);
        if (fixedLoadIndex === -1) {
            throw new Error(`O valor de carga do mapa "${loadMapValue}" não foi encontrado no eixo de carga.`);
        }
    }
    
    logData.forEach(logEntry => {
        const logRpm = logEntry[rpmLogKey];
        const measuredLambda = logEntry[lambdaLogKey];

        if (logRpm === undefined || measuredLambda === undefined || isNaN(logRpm) || isNaN(measuredLambda)) return;

        const rpmIndex = findClosestIndex(rpmMapAxis.calculated, logRpm);
        
        let currentLoadIndex = fixedLoadIndex;
        
        if (loadLogColumn && fixedLoadIndex === undefined) {
            const logLoad = logEntry[loadLogColumn];
            if (logLoad === undefined || isNaN(logLoad)) return;
            currentLoadIndex = findClosestIndex(loadMapAxis.calculated, logLoad);
        }

        if (rpmIndex === -1 || currentLoadIndex === -1 || currentLoadIndex === undefined) return;
        
        const yIndex = rpmIsYAxis ? rpmIndex : currentLoadIndex;
        const xIndex = rpmIsYAxis ? currentLoadIndex : rpmIndex;

        const currentValue = newMap[yIndex]?.[xIndex];
        if (currentValue === null || currentValue === undefined) return;

        // Corrected Logic: If mixture is lean (measured > target), we need to add fuel (increase map value).
        const correctionFactor = measuredLambda / targetLambda;
        
        // The value that would theoretically yield the target lambda.
        // If measured is lean (1.1) and target is rich (0.9), factor is > 1.
        // We need to multiply the current value by this factor to increase fuel.
        const fullyCorrectedValue = currentValue * correctionFactor;
        
        const difference = fullyCorrectedValue - currentValue;
        const finalCorrectedValue = currentValue + (difference * (aggressiveness / 100));

        newMap[yIndex][xIndex] = finalCorrectedValue;
        modifiedIndices.push({ y: yIndex, x: xIndex });
    });

    return { correctedMap: newMap, modifiedIndices };
}


// #endregion

// #region Intelligent Map Scanner

// Helper to read a sequence of numbers from a given address.
const readDataFromAddress = (view: DataView, startAddr: number, count: number, dataSize: number, useLittleEndian: boolean): number[] | null => {
    if (startAddr + count * dataSize > view.byteLength) return null;
    const data: number[] = [];
    for (let i = 0; i < count; i++) {
        const addr = startAddr + i * dataSize;
        if (dataSize === 1) data.push(view.getUint8(addr));
        else if (dataSize === 2) data.push(view.getUint16(addr, useLittleEndian));
        else return null; // Only supports 8/16 bit for now
    }
    return data;
};

// Check if an array of numbers is strictly monotonic (always increasing or always decreasing).
const isStrictlyMonotonic = (arr: number[]): boolean => {
    if (arr.length < 2) return false;
    const direction = arr[1] - arr[0];
    if (direction === 0) return false; // Not strictly monotonic if it starts flat.
    for (let i = 2; i < arr.length; i++) {
        if ((arr[i] - arr[i - 1]) * direction <= 0) return false;
    }
    return true;
};

// Analyze a monotonic array to guess if it's RPM or Load.
const analyzeAxis = (data: number[]): 'RPM' | 'Carga' | 'Desconhecido' => {
    if (data.length < 2) return 'Desconhecido';
    const maxVal = Math.max(...data);
    const minVal = Math.min(...data);
    if (maxVal > 1000 && maxVal - minVal > 500 && data.every(v => v >= 0)) return 'RPM';
    if (maxVal < 300 && data.every(v => v >= 0)) return 'Carga';
    return 'Desconhecido';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function findPotentialAxes(
    view: DataView,
    config: Required<ScanConfig>,
    onProgress: (progress: number, status: string) => void,
    signal: AbortSignal
): Promise<FoundAxis[]> {
    const { minSize, maxSize, dataSize, isBigEndian } = config;
    const totalLength = view.byteLength;
    const useLittleEndian = !isBigEndian;
    const ALIGNMENT = dataSize > 1 ? 2 : 1;
    const foundAxes: FoundAxis[] = [];

    const CHUNK_SIZE = 1024 * 16; // Process 16KB chunks
    const YIELD_INTERVAL_MS = 0; // Yield to browser event loop

    for (let addr = 0; addr < totalLength; addr += CHUNK_SIZE) {
        const chunkEnd = Math.min(addr + CHUNK_SIZE, totalLength);
        
        for (let currentAddr = addr; currentAddr < chunkEnd; currentAddr += ALIGNMENT) {
            for (let len = minSize; len <= maxSize; len++) {
                 if (signal.aborted) throw new Error('AbortError');
                const axisData = readDataFromAddress(view, currentAddr, len, dataSize, useLittleEndian);
                if (axisData && isStrictlyMonotonic(axisData)) {
                    const type = analyzeAxis(axisData);
                    if (type !== 'Desconhecido') {
                        foundAxes.push({
                            id: `axis_${currentAddr}_${len}`,
                            address: currentAddr,
                            length: len,
                            type,
                            data: axisData
                        });
                    }
                }
            }
        }
        
        onProgress((chunkEnd / totalLength) * 50, `A procurar eixos... Encontrados ${foundAxes.length}`);
        await sleep(YIELD_INTERVAL_MS);
    }
    return foundAxes;
}

function calculateMapConfidence(mapData: (number | null)[][]): { confidence: number, suggestion: string, name: string, equation: string } {
    if (mapData.length < 4 || mapData[0].length < 4) return { confidence: 0, suggestion: "Mapa muito pequeno", name: "Mapa Pequeno", equation: "x" };

    const flatData = mapData.flat().filter(v => v !== null && isFinite(v as number)) as number[];
    if (flatData.length < 10) return { confidence: 0.1, suggestion: "Poucos dados válidos", name: "Dados Inválidos", equation: "x" };

    const avg = flatData.reduce((a, b) => a + b, 0) / flatData.length;
    const stdDev = Math.sqrt(flatData.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / flatData.length);
    
    let confidence = 0.4;
    let suggestion = "Mapa genérico";
    let name = "Mapa Genérico";
    let equation = "x";

    // Smoothness check
    let totalDiff = 0;
    let diffCount = 0;
    for (let r = 0; r < mapData.length; r++) {
        for (let c = 0; c < mapData[r].length; c++) {
            if (c > 0 && mapData[r][c] !== null && mapData[r][c-1] !== null) {
                totalDiff += Math.abs((mapData[r][c] as number) - (mapData[r][c-1] as number));
                diffCount++;
            }
             if (r > 0 && mapData[r][c] !== null && mapData[r-1][c] !== null) {
                totalDiff += Math.abs((mapData[r][c] as number) - (mapData[r-1][c] as number));
                diffCount++;
            }
        }
    }
    const avgDiff = diffCount > 0 ? totalDiff / diffCount : 0;

    if (avgDiff > 0 && avgDiff < avg * 0.25) { 
      confidence += 0.3; // Smooth maps are more likely
    } else if (avgDiff > avg * 0.6) { 
      confidence -= 0.15; // Very noisy maps are less likely
    }

    if (stdDev / avg < 0.5) { // Low relative standard deviation
      confidence += 0.2;
    }
    
    if (avg > 50 && stdDev > 10) {
      suggestion = "Valores e distribuição consistentes com mapa de Combustível ou Ignição.";
      name = "Potencial Mapa de Combustível/Ignição"
      equation = "x * 0.1";
    } else if (avg < 50 && stdDev < 15) {
      suggestion = "Valores baixos e consistentes, possível mapa de Ignição em baixa carga.";
      name = "Potencial Mapa de Ignição";
      equation = "x * 0.5 - 30";
    } else if (avg > 200) {
       suggestion = "Valores altos, pode ser um mapa de tempo de injeção ou fator de correção.";
       name = "Potencial Mapa de Combustível";
       equation = "x * 0.01";
    }


    return { confidence: Math.max(0, Math.min(1, confidence)), suggestion, name, equation };
}


export async function findPotentialMaps(
    binBuffer: ArrayBuffer,
    config: Required<ScanConfig>,
    onProgress: (progress: number, status: string) => void,
    signal: AbortSignal
): Promise<PotentialMap[]> {
    const { dataSize, isBigEndian } = config;
    const YIELD_INTERVAL_MS = 0;
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const dataTypeString = `${config.dataSize * 8}-bit${config.dataSize > 1 ? (isBigEndian ? ' BE' : ' LE') : ''}`;

    onProgress(0, "A procurar eixos potenciais...");
    const allAxes = await findPotentialAxes(view, config, onProgress, signal);
    
    const rpmAxes = allAxes.filter(a => a.type === 'RPM');
    const loadAxes = allAxes.filter(a => a.type === 'Carga');
    
    if (signal.aborted) throw new Error('AbortError');
    
    onProgress(50, `Encontrados ${rpmAxes.length} eixos de RPM e ${loadAxes.length} de carga. A procurar mapas...`);
    await sleep(YIELD_INTERVAL_MS);

    const potentialMaps: PotentialMap[] = [];
    const totalCombinations = rpmAxes.length * loadAxes.length;
    if (totalCombinations === 0) {
        onProgress(100, "Análise concluída. Nenhum par de eixos RPM/Carga encontrado.");
        return [];
    }

    let combinationsDone = 0;
    
    for (const yAxis of loadAxes) { // Assume Load is Y axis
        for (const xAxis of rpmAxes) { // Assume RPM is X axis
            combinationsDone++;
             if (signal.aborted) throw new Error('AbortError');

            if (combinationsDone % 500 === 0) { // Update progress periodically and yield
                 onProgress(50 + (combinationsDone / totalCombinations * 50), `A verificar combinação ${combinationsDone} de ${totalCombinations}`);
                 await sleep(YIELD_INTERVAL_MS);
            }

            const mapCols = xAxis.length;
            const mapRows = yAxis.length;
            const mapSizeInBytes = mapRows * mapCols * dataSize;
            
            // Heuristic: The map data block starts immediately after one of the axes ends.
            // Check for map start right after X axis and right after Y axis.
            const potentialStartAddresses = [
                xAxis.address + xAxis.length * dataSize,
                yAxis.address + yAxis.length * dataSize,
            ];

            for (const mapStartAddress of potentialStartAddresses) {
                if (mapStartAddress + mapSizeInBytes > view.byteLength) continue;

                const mapDataBlock: MapData = [];
                let isValidBlock = true;
                for(let r=0; r<mapRows; r++){
                    // Assuming row-major order for scanning
                    const rowData = readDataFromAddress(view, mapStartAddress + (r * mapCols * dataSize), mapCols, dataSize, useLittleEndian);
                    if (rowData === null) {
                        isValidBlock = false;
                        break;
                    }
                    mapDataBlock.push(rowData);
                }
                
                if (isValidBlock) {
                    const { confidence, suggestion, name, equation } = calculateMapConfidence(mapDataBlock);
                    if (confidence > 0.55) { // Use a reasonable confidence threshold
                        if (!potentialMaps.some(p => p.address === mapStartAddress && p.rows === mapRows && p.cols === mapCols)) {
                            potentialMaps.push({
                                address: mapStartAddress,
                                name,
                                rows: mapRows,
                                cols: mapCols,
                                dataSize: dataSize,
                                isBigEndian: isBigEndian,
                                confidence,
                                suggestion,
                                dataType: dataTypeString,
                                equation,
                                xAxisAddress: xAxis.address,
                                yAxisAddress: yAxis.address,
                                xAxisType: xAxis.type,
                                yAxisType: yAxis.type,
                            });
                        }
                    }
                }
            }
        }
    }
    
    onProgress(100, "Análise concluída.");
    return potentialMaps;
}

// #endregion
