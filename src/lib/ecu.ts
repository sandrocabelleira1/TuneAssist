
import type { XDFDefinition, AxisDataState, AxisDimension, MapData } from './types';

// Função auxiliar para normalizar e avaliar equações matemáticas de forma segura.
function evaluateEquation(equation: string, value: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return NaN;
    }
    try {
        const sanitizedEq = equation.trim().replace(/x/gi, 'X');
        const expr = sanitizedEq.replace(/X/g, `(${value.toString()})`);
        const func = new Function(`return ${expr}`);
        const result = func();
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        return value;
    } catch (e) {
        console.error(`Erro ao avaliar a equação "${equation}" com o valor ${value}:`, e);
        return value;
    }
}

// Inverte equações lineares simples para recalcular valores crus a partir de valores de engenharia.
function invertEquation(eq: string, finalValue: number): number {
    if (finalValue === null || isNaN(finalValue)) {
        throw new Error('O valor final não pode ser nulo ou NaN para a inversão.');
    }

    const sanitizedEq = eq.trim().replace(/x/gi, 'X');
    if (sanitizedEq === 'X') return finalValue;

    // Y = X * C  => X = Y / C
    let match = sanitizedEq.match(/^X\s*\*\s*(-?[\d.]+(?:E-?\d+)?)$/);
    if (match) return finalValue / parseFloat(match[1]);

    // Y = X / C => X = Y * C
    match = sanitizedEq.match(/^X\s*\/\s*(-?[\d.]+(?:E-?\d+)?)$/);
    if (match) return finalValue * parseFloat(match[1]);

    // Y = X + C => X = Y - C
    match = sanitizedEq.match(/^X\s*\+\s*(-?[\d.]+(?:E-?\d+)?)$/);
    if (match) return finalValue - parseFloat(match[1]);

    // Y = X - C => X = Y + C
    match = sanitizedEq.match(/^X\s*-\s*(-?[\d.]+(?:E-?\d+)?)$/);
    if (match) return finalValue + parseFloat(match[1]);

    console.warn(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente. A devolver o valor original.`);
    return finalValue;
}


// Funções auxiliares para ler o DOM do XDF
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

function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    return attr === '1' || attr?.toLowerCase() === 'true';
}


// Analisa a definição de um eixo (X ou Y) a partir do seu nó no XML.
function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>): AxisDimension {
    const indexcount = parseInt(findNode(axisNode, 'indexcount')?.textContent || '0', 10);
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;

    let label = findNode(axisNode, 'title')?.textContent?.trim() || findNode(axisNode, 'units')?.textContent?.trim() || 'Eixo Desconhecido';

    // Se o eixo for ligado a uma tabela de breakpoint
    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        
        label = findNode(linkedTable, 'title')?.textContent?.trim() || label;

        const zAxisOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);
        
        const embeddedData = findNode(zAxisOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        if (!embeddedData) throw new Error(`Dados embutidos não encontrados no eixo Z da tabela vinculada ${linkId}`);

        const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
        
        return {
            isLinked: true,
            label: label,
            count: parseInt(getAttr(embeddedData, 'mmedrowcount') || getAttr(embeddedData, 'mmedcolcount') || '0', 10),
            address: parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16),
            dataSize: dataSizeBits / 8,
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisOfLinkedTable, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(zAxisOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }

    // Se o eixo tiver dados embutidos diretamente
    const sourceEmbeddedData = findNode(axisNode, 'EMBEDDEDDATA', 'embedinfo');
    if (sourceEmbeddedData && getAttr(sourceEmbeddedData, 'mmedaddress')) {
        const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10);
        
        return {
            isLinked: false,
            label: label,
            count: parseInt(getAttr(sourceEmbeddedData, 'mmedcolcount') || getAttr(sourceEmbeddedData, 'mmedrowcount') || `${indexcount}` || '0', 10),
            address: parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16),
            dataSize: dataSizeBits / 8,
            isBigEndian: getIsBigEndian(sourceEmbeddedData),
            equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Se o eixo usar labels de texto
    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL'));
    if (labels.length > 0) {
        return {
            isLinked: false,
            label: label,
            count: labels.length || indexcount,
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
            decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
        };
    }
    
    // Fallback para eixo simples com contagem
    return { 
        count: indexcount, 
        label: label, 
        decimalpl: 1,
        equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
    };
}


// Função principal que analisa o ficheiro XDF.
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
            
            const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '8', 10);
            
            definitions.push({
                uniqueId: uniqueId,
                name: tableName,
                address,
                rows: yAxisDef.count,
                cols: xAxisDef.count,
                dataSize: dataSizeBits / 8,
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

// Lê os dados de um eixo a partir do ficheiro BIN e aplica a equação.
export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisDataState {
    const defaultState: AxisDataState = { label: 'Indefinido', raw: [], calculated: [], address: null };
    if (!axisDef || !binBuffer) return defaultState;
    
    if (axisDef.values) {
        return { label: axisDef.label, raw: [], calculated: axisDef.values, address: null };
    }

    const { address, count, dataSize = 2, equation = 'X', isBigEndian = false } = axisDef;
    if (address === undefined || address === null || isNaN(address) || count === 0) {
        return { ...defaultState, label: axisDef.label };
    }
    
    const view = new DataView(binBuffer);
    const useLittleEndian = !isBigEndian;
    const raw: number[] = [];
    const calculated: (number | string)[] = [];

    for (let i = 0; i < count; i++) {
        const offset = address + (i * dataSize);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue;
        if (dataSize === 1) rawValue = view.getUint8(offset);
        else if (dataSize === 2) rawValue = view.getUint16(offset, useLittleEndian);
        else if (dataSize === 4) rawValue = view.getUint32(offset, useLittleEndian);
        else rawValue = 0;
        
        raw.push(rawValue);
        calculated.push(evaluateEquation(equation, rawValue));
    }
    
    return { raw, calculated, label: axisDef.label, address };
}

// Lê os dados de um mapa 2D a partir do BIN.
export function readAndCalculateMapFromBin(binBuffer: ArrayBuffer, def: XDFDefinition) {
    const xAxis = readAxisFromBin(binBuffer, def.xAxisDef);
    const yAxis = readAxisFromBin(binBuffer, def.yAxisDef);

    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !def.isBigEndian;

    const rawMap: MapData = [];
    const calculatedMap: MapData = [];

    for (let r = 0; r < def.rows; r++) {
        const rawRow: (number | null)[] = [];
        const calcRow: (number | null)[] = [];
        for (let c = 0; c < def.cols; c++) {
            const offset = getCellAddress(def, r, c);
            
            if (offset === null || offset + def.dataSize > view.byteLength) {
                rawRow.push(null);
                calcRow.push(null);
                continue;
            }
            
            let rawValue;
            if (def.dataSize === 1) rawValue = view.getUint8(offset);
            else if (def.dataSize === 2) rawValue = view.getUint16(offset, useLittleEndianForZ);
            else if (def.dataSize === 4) rawValue = view.getUint32(offset, useLittleEndianForZ);
            else rawValue = 0;
            
            rawRow.push(rawValue);
            calcRow.push(evaluateEquation(def.equation, rawValue));
        }
        rawMap.push(rawRow);
        calculatedMap.push(calcRow);
    }
    
    return { calculatedMap, rawMap, axes: { x: xAxis, y: yAxis } };
}

// Calcula o endereço de memória exato de uma célula do mapa.
export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def || rowIndex < 0 || rowIndex >= def.rows || colIndex < 0 || colIndex >= def.cols) {
        return null;
    }
    // Simplificado: assume que as colunas são contíguas e as linhas têm um passo fixo.
    // Para XDFs mais complexos, os 'strides' precisam ser extraídos e usados.
    const rowStride = def.cols * def.dataSize;
    return def.address + (rowIndex * rowStride) + (colIndex * def.dataSize);
}


export function recalculateRawMapFromCalculated(calculatedMap: MapData, def: XDFDefinition): MapData {
    return calculatedMap.map(row => 
        row.map(cellValue => {
            if (cellValue === null || cellValue === undefined) return null;
            try {
                return invertEquation(def.equation, cellValue);
            } catch (e) {
                console.error(`Não foi possível recalcular o valor raw: ${(e as Error).message}.`);
                return NaN;
            }
        })
    );
}

export function writeMapToBin(binBuffer: ArrayBuffer, def: XDFDefinition, rawMapData: MapData): ArrayBuffer {
    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    const useLittleEndianForZ = !def.isBigEndian;
    
    for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
            const rawValue = rawMapData[r]?.[c];
            if (rawValue === null || rawValue === undefined || isNaN(rawValue)) continue;

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
