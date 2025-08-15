

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
                sortedRow.push(isNaN(calculatedValue) ? rawValue : calculatedValue); // Fallback to raw if calc fails
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
function findKeyInHeader(header: string[], targetLabel: string): string | undefined {
    if (!targetLabel) return undefined;
    const cleanTargetLabel = targetLabel.trim().toLowerCase();
    
    for (const key of header) {
        if (key.trim().toLowerCase() === cleanTargetLabel) {
            return key;
        }
    }
    // Fallback for partial match if exact match fails
    for (const key of header) {
        if (key.trim().toLowerCase().includes(cleanTargetLabel)) {
            return key;
        }
    }
    return undefined;
}


export function calculateCorrections(
    processedMap: ProcessedMap,
    logData: any[],
    targetLambda: number,
    aggressiveness: number // 0-100
): { correctedMap: MapData, modifiedIndices: ModifiedCell[] } {
    if (!processedMap || !processedMap.calculatedMap || !processedMap.axes) {
        throw new Error("Mapa processado inválido fornecido para correção.");
    }
     if (!logData || logData.length === 0) {
        throw new Error("Dados de ensaio estão vazios ou são inválidos.");
    }

    const { calculatedMap, axes } = processedMap;
    const { x: xAxis, y: yAxis } = axes;
    const newMap = calculatedMap.map(row => [...row]); // Create a mutable copy
    const modifiedIndices: ModifiedCell[] = [];

    // Dynamically find the keys for X, Y, and Lambda from the log data headers
    const header = Object.keys(logData[0] || {});
    const xAxisKey = findKeyInHeader(header, xAxis.label);
    const yAxisKey = findKeyInHeader(header, yAxis.label);
    const lambdaKey = findKeyInHeader(header, 'lambda') || findKeyInHeader(header, 'Lambda') || 'Lambda';


    if (!xAxisKey) {
        throw new Error(`Não foi possível encontrar a coluna de dados de ensaio correspondente ao eixo X do mapa ("${xAxis.label}"). Certifique-se de que os nomes correspondem.`);
    }
    if (!yAxisKey) {
        throw new Error(`Não foi possível encontrar a coluna de dados de ensaio correspondente ao eixo Y do mapa ("${yAxis.label}"). Certifique-se de que os nomes correspondem.`);
    }
     if (!header.some(h => h.trim().toLowerCase() === lambdaKey.trim().toLowerCase())) {
        throw new Error(`Não foi possível encontrar a coluna de dados de ensaio para Lambda. Verifique o cabeçalho do seu CSV.`);
    }

    logData.forEach(logEntry => {
        const xValue = logEntry[xAxisKey];
        const yValue = logEntry[yAxisKey];
        const measuredLambda = logEntry[lambdaKey];

        if (xValue === undefined || yValue === undefined || measuredLambda === undefined) {
            console.warn("Entrada de log ignorada devido a dados em falta:", logEntry);
            return;
        }

        const yIndex = findClosestIndex(yAxis.calculated, yValue);
        const xIndex = findClosestIndex(xAxis.calculated, xValue);

        if (xIndex === -1 || yIndex === -1) {
            console.warn(`Nenhuma célula correspondente encontrada para o ponto do log: ${yAxis.label}=${yValue}, ${xAxis.label}=${xValue}`);
            return;
        }
        
        const currentValue = newMap[yIndex]?.[xIndex];
        if (currentValue === null || currentValue === undefined) {
            console.warn(`Célula do mapa em [${yIndex}, ${xIndex}] está vazia, a ignorar.`);
            return;
        }

        const error = measuredLambda - targetLambda;
        const correctionFactor = measuredLambda / targetLambda;
        
        // We only want to add fuel if lean, or pull fuel if rich
        // correctionFactor > 1 means lean, needs more fuel (increase value)
        // correctionFactor < 1 means rich, needs less fuel (decrease value)
        
        let correctedValue = currentValue * correctionFactor;
        
        // Apply aggressiveness
        const diff = correctedValue - currentValue;
        correctedValue = currentValue + (diff * (aggressiveness / 100));

        newMap[yIndex][xIndex] = correctedValue;
        modifiedIndices.push({ y: yIndex, x: xIndex });
    });

    return { correctedMap: newMap, modifiedIndices };
}


// #endregion

// #region Intelligent Map Scanner

export function analyzeAxis(data: number[]): 'RPM' | 'Carga' | 'Desconhecido' {
    if (data.length < 2) return 'Desconhecido';

    const isStrictlyMonotonic = (arr: number[]) => {
        if (arr.length < 2) return true;
        const direction = arr[1] - arr[0];
        if (direction === 0) return false; // Not strictly monotonic if starts flat
        for (let i = 2; i < arr.length; i++) {
            if ((arr[i] - arr[i-1]) * direction <= 0) return false; // must be strictly increasing or decreasing
        }
        return true;
    };
    
    if (!isStrictlyMonotonic(data)) return 'Desconhecido';

    const maxVal = Math.max(...data);

    // Heuristics for RPM: high values, typically end in 00 or 50
    // A stricter check could be maxVal > 1000 and range > 800
    if (maxVal > 800 && data.every(v => v >= 0)) {
        return 'RPM';
    }
    
    // Heuristics for Load: low values (e.g. < 260 for MAP sensor, < 101 for TPS)
    // and values are typically positive
    if (maxVal < 300 && data.every(v => v >= 0)) {
        return 'Carga';
    }
    
    return 'Desconhecido';
}

function isMonotonic(arr: number[]): boolean {
    if (arr.length < 2) return true;
    let increasing: boolean | null = null;
    let hasChanged = false;

    for (let i = 1; i < arr.length; i++) {
        const diff = arr[i] - arr[i - 1];
        if (diff !== 0) {
            const currentDirection = diff > 0;
            if (increasing === null) {
                increasing = currentDirection;
            } else if (currentDirection !== increasing) {
                return false; // Change of direction
            }
            hasChanged = true;
        }
    }
    return hasChanged; // Must not be a flat line
}

const calculateSmoothness = (data: number[]) => {
    let diffSum = 0;
    let validPoints = 0;
    for (let i = 1; i < data.length; i++) {
        if (data[i] !== null && data[i-1] !== null) {
             diffSum += Math.abs(data[i]! - data[i-1]!);
             validPoints++;
        }
    }
    return validPoints > 0 ? diffSum / validPoints : Infinity;
};

export const readDataFromAddress = (view: DataView, startAddr: number, count: number, dataSize: number, useLittleEndian: boolean): number[] | null => {
    const data: number[] = [];
    const totalLength = view.byteLength;
    for (let i = 0; i < count; i++) {
        const addr = startAddr + (i * dataSize);
        if (addr + dataSize > totalLength) return null;
        if (dataSize === 1) data.push(view.getUint8(addr));
        else if (dataSize === 2) data.push(view.getUint16(addr, useLittleEndian));
        else return null;
    }
    return data;
};

export function scanForMapsByAxes(
    binBuffer: ArrayBuffer,
    config: ScanConfig & { dataSize: number; isBigEndian: boolean },
    onProgress: (progress: number, status: string, newMap?: PotentialMap) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const { minSize, maxSize, dataSize, isBigEndian } = config;
        const view = new DataView(binBuffer);
        const totalLength = binBuffer.byteLength;
        const useLittleEndian = !isBigEndian;
        const foundAxes: FoundAxis[] = [];
        const CHUNK_SIZE = 1024 * 64; // Process in 64KB chunks
        const ALIGNMENT = 2; // Check every 2 bytes for performance

        // --- PHASE 1: FIND ALL POTENTIAL AXES ---
        const findAxes = () => {
            let progressAddress = 0;

            const processAxesChunk = () => {
                try {
                    const endAddress = Math.min(progressAddress + CHUNK_SIZE, totalLength);

                    for (let addr = progressAddress; addr < endAddress; addr += ALIGNMENT) {
                        for (let len = minSize; len <= maxSize; len++) {
                            const axisData = readDataFromAddress(view, addr, len, dataSize, useLittleEndian);
                            if (axisData && isMonotonic(axisData)) {
                                const type = analyzeAxis(axisData);
                                if (type !== 'Desconhecido') {
                                    foundAxes.push({
                                        address: addr,
                                        length: len,
                                        type,
                                        data: axisData,
                                    });
                                }
                            }
                        }
                    }
                    
                    progressAddress = endAddress;
                    const progress = (progressAddress / totalLength) * 50; // Phase 1 is 50% of total
                    onProgress(progress, `Fase 1: A analisar eixos... ${foundAxes.length} encontrados.`);

                    if (progressAddress >= totalLength) {
                        onProgress(50, `Fase 1 concluída. Encontrados ${foundAxes.length} eixos. A iniciar a Fase 2...`);
                        setTimeout(() => findMapsFromAxes(foundAxes), 0); // Start phase 2
                    } else {
                        setTimeout(processAxesChunk, 0); // Yield to main thread
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            onProgress(0, 'Fase 1: A procurar eixos potenciais...');
            processAxesChunk();
        };
        
        // --- PHASE 2: FIND MAPS FROM THE FOUND AXES (REFACTORED) ---
        const findMapsFromAxes = (axes: FoundAxis[]) => {
            const AXIS_GROUPING_DISTANCE = 512; // Group axes that are within 512 bytes of each other
            const MAP_SEARCH_WINDOW_BACK = 256;
            const MAP_SEARCH_WINDOW_FORWARD = 256;
            const BATCH_SIZE = 10;
            let currentGroupIndex = 0;
        
            // Sort axes by address to make grouping easier
            axes.sort((a, b) => a.address - b.address);
        
            // Group nearby axes to drastically reduce combinations
            const axisGroups: FoundAxis[][] = [];
            if (axes.length > 0) {
                let currentGroup = [axes[0]];
                for (let i = 1; i < axes.length; i++) {
                    if (axes[i].address - currentGroup[currentGroup.length - 1].address < AXIS_GROUPING_DISTANCE) {
                        currentGroup.push(axes[i]);
                    } else {
                        axisGroups.push(currentGroup);
                        currentGroup = [axes[i]];
                    }
                }
                axisGroups.push(currentGroup);
            }
        
            const processNextBatch = () => {
                try {
                    const batchEndIndex = Math.min(currentGroupIndex + BATCH_SIZE, axisGroups.length);
        
                    for (let i = currentGroupIndex; i < batchEndIndex; i++) {
                        const group = axisGroups[i];
                        if (group.length < 2) continue;
        
                        // Combine every axis with every other axis *within the same group*
                        for (let j = 0; j < group.length; j++) {
                            for (let k = j + 1; k < group.length; k++) {
                                const axis1 = group[j];
                                const axis2 = group[k];
        
                                // Test both combinations (axis1 as X, axis2 as Y and vice-versa)
                                const combinations = [[axis1, axis2], [axis2, axis1]];
        
                                for (const [xAxis, yAxis] of combinations) {
                                    const mapSizeInBytes = xAxis.length * yAxis.length * dataSize;
                                    const searchStart = Math.max(0, Math.min(xAxis.address, yAxis.address) - MAP_SEARCH_WINDOW_BACK);
                                    const searchEnd = Math.min(totalLength - mapSizeInBytes, Math.max(xAxis.address, yAxis.address) + yAxis.length * dataSize + MAP_SEARCH_WINDOW_FORWARD);
        
                                    for (let mapAddr = searchStart; mapAddr < searchEnd; mapAddr += ALIGNMENT) {
                                        // Skip if map address overlaps with axes addresses
                                        if ((mapAddr >= xAxis.address && mapAddr < xAxis.address + xAxis.length * dataSize) ||
                                            (mapAddr >= yAxis.address && mapAddr < yAxis.address + yAxis.length * dataSize)) {
                                            continue;
                                        }

                                        const mapData = readDataFromAddress(view, mapAddr, xAxis.length * yAxis.length, dataSize, useLittleEndian);
        
                                        if (mapData) {
                                            const smoothness = calculateSmoothness(mapData);
                                            if (smoothness < 50 && smoothness > 0.1) {
                                                const confidence = 0.5 + Math.max(0, 0.5 - (smoothness / 100));
                                                
                                                const previewData: number[][] = [];
                                                for (let rowIdx = 0; rowIdx < yAxis.length; rowIdx++) {
                                                    const row = mapData.slice(rowIdx * xAxis.length, (rowIdx + 1) * xAxis.length);
                                                    previewData.push(row);
                                                }
        
                                                const potentialMap: PotentialMap = {
                                                    address: mapAddr,
                                                    rows: yAxis.length,
                                                    cols: xAxis.length,
                                                    dataSize,
                                                    isBigEndian,
                                                    confidence,
                                                    suggestion: `Eixos em 0x${xAxis.address.toString(16)} e 0x${yAxis.address.toString(16)}`,
                                                    dataType: `${dataSize * 8}-bit${dataSize > 1 ? (isBigEndian ? ' BE' : ' LE') : ''}`,
                                                    equation: 'x',
                                                    previewData,
                                                    xAxisAddress: xAxis.address,
                                                    yAxisAddress: yAxis.address,
                                                    xAxisType: xAxis.type,
                                                    yAxisType: yAxis.type,
                                                };
                                                onProgress(50 + (i / axisGroups.length) * 50, `Mapa encontrado em 0x${mapAddr.toString(16).toUpperCase()}`, potentialMap);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
        
                    currentGroupIndex = batchEndIndex;
                    const progress = 50 + (currentGroupIndex / axisGroups.length) * 50;
                    onProgress(progress, `Fase 2: A verificar ${axisGroups.length} grupos de eixos...`);
        
                    if (currentGroupIndex >= axisGroups.length) {
                        onProgress(100, "Análise concluída.");
                        resolve();
                    } else {
                        setTimeout(processNextBatch, 0); // Yield to main thread
                    }
                } catch (error) {
                    reject(error);
                }
            };
        
            onProgress(50, `A agrupar ${axes.length} eixos em ${axisGroups.length} grupos...`);
            processNextBatch();
        };

        // Start the process
        findAxes();
    });
}
// #endregion

    
