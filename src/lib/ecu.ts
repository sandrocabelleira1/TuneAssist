

import type { XDFDefinition, AxisDimension, MapData, AxisData, ProcessedMap, ManualAxisConfig, ModifiedCell, PotentialMap } from './types';

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
        if (originalId) { // Still map the original ID for axis lookups
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
    
    // For virtual axes (like from potential maps) that don't have a real address
    if (axisDef.address === undefined || axisDef.address === null || isNaN(axisDef.address)) {
        if (axisDef.count > 0) {
            const calculated = Array.from({ length: axisDef.count }, (_, i) => i); // Simple index
            return {
                label: axisDef.label || 'Índice',
                raw: calculated, // Raw is same as calculated here
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


// #region Heuristic Map Scanner

const COMMON_EQUATIONS: { name: string; equation: string; type: 'Ignition' | 'Fuel' | 'Lambda' | 'Temp' }[] = [
    { name: 'Ignição ° (Div/4)', equation: 'x/4', type: 'Ignition'},
    { name: 'Bruto', equation: 'x', type: 'Fuel'},
    { name: 'Ignição ° (Bosch 0.75-48)', equation: 'x*0.75-48', type: 'Ignition'},
    { name: 'Ignição ° (VAG 0.25)', equation: 'x*0.25', type: 'Ignition' },
    { name: 'Ignição ° (Siemens 0.5)', equation: 'x*0.5', type: 'Ignition' },
    { name: 'Combustível VE (Bosch 0.01)', equation: 'x*0.01', type: 'Fuel' },
    { name: 'Lambda (Bosch 0.001)', equation: 'x*0.001', type: 'Lambda' },
    { name: 'Temp °C (Bosch 0.75-48)', equation: 'x*0.75-48', type: 'Temp' },
];

function readDataFromAddress(view: DataView, address: number, count: number, itemSize: number, isBigEndian: boolean): number[] | null {
    if (address + (count * itemSize) > view.byteLength) {
        return null;
    }
    const data: number[] = [];
    const littleEndian = !isBigEndian;

    for (let i = 0; i < count; i++) {
        const offset = address + (i * itemSize);
        try {
            if (itemSize === 1) {
                data.push(view.getUint8(offset));
            } else if (itemSize === 2) {
                data.push(view.getUint16(offset, littleEndian));
            } else {
                return null;
            }
        } catch {
            return null;
        }
    }
    return data;
}

function calculateMapSmoothness(mapData: number[][]): number {
    if (!mapData || mapData.length < 2 || mapData[0].length < 2) return 0;
    
    let diffSum = 0;
    let pointCount = 0;
    const flatData = mapData.flat();
    const maxPossibleValue = flatData.reduce((max, v) => Math.max(max, v), 0);
    if (maxPossibleValue === 0) return 0;

    for (let r = 0; r < mapData.length; r++) {
        for (let c = 0; c < mapData[r].length; c++) {
            const current = mapData[r][c];
            if (c < mapData[r].length - 1) {
                diffSum += Math.abs(current - mapData[r][c+1]);
                pointCount++;
            }
            if (r < mapData.length - 1 && mapData[r+1] && c < mapData[r+1].length) {
                diffSum += Math.abs(current - mapData[r+1][c]);
                pointCount++;
            }
        }
    }

    if (pointCount === 0) return 0;
    const avgDiff = diffSum / pointCount;
    const score = 1 - (avgDiff / maxPossibleValue);
    return Math.max(0, Math.min(1, score));
}

function analyzeMapCharacteristics(mapData: number[][], equation: string): { suggestion: string; confidence: number } {
    if (!mapData || mapData.length === 0 || mapData[0].length === 0) {
        return { suggestion: 'Desconhecido', confidence: 0 };
    }
    
    const calculatedData = mapData.map(row => row.map(cell => evaluateEquation(equation, cell)));
    const flatData = calculatedData.flat().filter(v => v !== null && !isNaN(v) && isFinite(v));

    if (flatData.length < 10) return { suggestion: 'Desconhecido', confidence: 0 };

    const min = Math.min(...flatData);
    const max = Math.max(...flatData);
    
    let confidence = 0.1;
    let suggestion = 'Genérico';

    const eqInfo = COMMON_EQUATIONS.find(e => e.equation === equation);
    const mapType = eqInfo?.type || 'Genérico';

    switch (mapType) {
        case 'Ignition':
            if (max > -10 && max < 60 && min >= -20 && (max - min) > 10) {
                confidence = 0.7;
                if(max - min > 25) confidence += 0.15;
            }
            break;
        case 'Fuel':
            if (max > 10 && max < 255 && min >= 0) {
                confidence = 0.6;
                 if (equation === 'x' && max < 150) confidence += 0.1; // VE% likely < 150
            }
            break;
        case 'Lambda':
            if (max < 1.5 && max > 0.5 && min > 0.4) confidence = 0.8;
            break;
        case 'Temp':
             if (max > -20 && max < 140 && min < 10) confidence = 0.75;
            break;
    }

    suggestion = mapType;
    if (max === min) confidence *= 0.1;
    
    return { suggestion, confidence };
}


export function scanForMapsWithTemplate(
  binBuffer: ArrayBuffer,
  config: {
    rows: number;
    cols: number;
    dataSize: number;
    isBigEndian: boolean;
  },
  options: {
    onProgress?: (progress: number, status: string) => void;
    confidenceThreshold?: number;
  }
): Promise<PotentialMap[]> {
    return new Promise(async (resolve, reject) => {
        const { onProgress, confidenceThreshold = 0.5 } = options;
        const { rows, cols, dataSize, isBigEndian } = config;
        const view = new DataView(binBuffer);
        const totalLength = binBuffer.byteLength;
        const mapByteSize = rows * cols * dataSize;
        
        if (mapByteSize === 0 || mapByteSize > totalLength) {
            resolve([]);
            return;
        }

        const results: PotentialMap[] = [];
        const dataType = `${dataSize * 8}-bit${dataSize > 1 ? (isBigEndian ? ' BE' : ' LE') : ''}`;
        const searchIncrement = 4; // Scan every 4 bytes for alignment
        
        const CHUNK_SIZE = 50000; // Number of addresses to process per chunk
        let currentAddress = 0;

        try {
            while (currentAddress < totalLength - mapByteSize) {
                const chunkEnd = Math.min(currentAddress + CHUNK_SIZE, totalLength - mapByteSize);
                
                if (onProgress) {
                    const progress = (currentAddress / (totalLength - mapByteSize)) * 100;
                    onProgress(progress, `Analisando 0x${currentAddress.toString(16)}...`);
                }

                for (let address = currentAddress; address < chunkEnd; address += searchIncrement) {
                    const mapData = readDataFromAddress(view, address, rows * cols, dataSize, isBigEndian);
                    if (!mapData) continue;

                    const map2D = Array.from({ length: rows }, (_, r) => mapData.slice(r * cols, (r + 1) * cols));
                    const mapSmoothness = calculateMapSmoothness(map2D);

                    if (mapSmoothness < 0.3) continue;

                    let bestEq = { suggestion: 'Genérico', confidence: 0, equation: 'x' };
                    for (const eq of COMMON_EQUATIONS) {
                        const analysis = analyzeMapCharacteristics(map2D, eq.equation);
                        if (analysis.confidence > bestEq.confidence) {
                            bestEq = { ...analysis, equation: eq.equation };
                        }
                    }

                    const totalConfidence = (bestEq.confidence * 0.7) + (mapSmoothness * 0.3);

                    if (totalConfidence >= confidenceThreshold) {
                        results.push({
                            address,
                            rows,
                            cols,
                            dataSize,
                            isBigEndian,
                            dataType,
                            confidence: totalConfidence,
                            suggestion: bestEq.suggestion,
                            equation: bestEq.equation,
                            previewData: map2D,
                            xAxisAddress: undefined,
                            yAxisAddress: undefined,
                            xAxisType: 'Desconhecido',
                            yAxisType: 'Desconhecido'
                        });
                    }
                }
                currentAddress = chunkEnd;
                // Yield to the main thread to prevent UI freezing
                await new Promise(r => setTimeout(r, 0));
            }

            if (onProgress) onProgress(100, "Finalizando...");
            
            results.sort((a, b) => b.confidence - a.confidence);
            
            const uniqueResults: PotentialMap[] = [];
            const foundAddresses = new Set<number>();
            for (const res of results) {
                if (!foundAddresses.has(res.address)) {
                    uniqueResults.push(res);
                    foundAddresses.add(res.address);
                }
            }
            resolve(uniqueResults);
        } catch (error) {
            reject(error);
        }
    });
}


// #endregion
