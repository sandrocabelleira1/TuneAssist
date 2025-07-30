
import type { XDFDefinition, AxisDataState, AxisDimension, MapData } from './types';

// Função auxiliar para encontrar um nó filho direto
function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
        // :scope garante que estamos a procurar apenas em filhos diretos
        const node = parent.querySelector(`:scope > ${selector}`);
        if (node) return node;
    }
    return null;
}

// Função auxiliar para obter um atributo de um elemento
function getAttr(element: Element | null, attrName: string): string | null {
    if (!element) return null;
    return element.getAttribute(attrName);
}

// Normaliza e limpa a equação para evitar erros de sintaxe
function normalizeEquation(eq: string | null | undefined): string {
    if (!eq) return 'X';
    // Garante que a variável é sempre 'X' maiúsculo e remove espaços
    let sanitizedEq = eq.trim().replace(/x/gi, 'X');
    // Adiciona operadores de multiplicação em falta, ex: 0.75X -> 0.75*X
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    return sanitizedEq;
}

// Verifica o atributo 'bigendian' e retorna um booleano
function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    // O padrão é little-endian, então só é big-endian se explicitamente for "1" ou "true"
    return attr === '1' || attr?.toLowerCase() === 'true';
}

function parseAxisDimension(axisNode: Element, allTables: Map<string, Element>): AxisDimension {
    const embedInfo = findNode(axisNode, 'embedinfo', 'EMBEDDEDDATA');
    const linkId = getAttr(embedInfo, 'linkobjid');
    const isLinked = (getAttr(embedInfo, 'type') === '3' || getAttr(embedInfo, 'type') === 'link') && linkId;

    if (isLinked && linkId) {
        const linkedTable = allTables.get(linkId);
        if (!linkedTable) {
            throw new Error(`Tabela de eixos vinculada com ID ${linkId} não encontrada.`);
        }
        // Os dados do eixo estão no eixo Z da tabela vinculada.
        const zAxisNodeOfLinkedTable = findNode(linkedTable, 'XDFAXIS[id="z"]');
        if (!zAxisNodeOfLinkedTable) throw new Error(`Eixo Z não encontrado na tabela vinculada ${linkId}`);

        const embeddedData = findNode(zAxisNodeOfLinkedTable, 'embeddeddata', 'EMBEDDEDDATA');
        const count = parseInt(findNode(zAxisNodeOfLinkedTable, 'indexcount')?.textContent || '0', 10);
        const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
        
        return {
            isLinked: true,
            count: count,
            label: findNode(linkedTable, 'title')?.textContent?.trim() || 'Eixo Vinculado',
            address: parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16),
            dataSize: dataSizeBits / 8,
            stride: (parseInt(getAttr(embeddedData, 'mmedmajorstridebits') || '0', 10) || dataSizeBits) / 8,
            isBigEndian: getIsBigEndian(embeddedData),
            equation: getAttr(findNode(zAxisNodeOfLinkedTable, 'math', 'MATH'), 'equation') || 'X',
            decimalpl: parseInt(findNode(zAxisNodeOfLinkedTable, 'decimalpl')?.textContent || '1', 10),
        };
    }

    // Lógica de parsing para eixos definidos estaticamente (não vinculados)
    const labels = Array.from(axisNode.querySelectorAll(':scope > LABEL'));
    if (labels.length > 0) {
        return {
            isLinked: false,
            count: labels.length,
            label: findNode(axisNode, 'title')?.textContent?.trim() || getAttr(axisNode, 'units') || 'Eixo',
            values: labels.map(l => getAttr(l, 'value') || l.textContent || ''),
        };
    }
    
    // Fallback para eixos com dados embutidos mas não vinculados (raro, mas possível)
    const sourceEmbeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
    const count = parseInt(findNode(axisNode, 'indexcount')?.textContent || '0', 10)
    const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10);
    return {
        isLinked: false,
        count: count,
        label: findNode(axisNode, 'title')?.textContent?.trim() || getAttr(axisNode, 'units') || 'Eixo Desconhecido',
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
            if (!zAxisNode) {
                return; // Ignorar tabelas sem eixo Z (não são mapas de dados)
            }

            const embeddedData = findNode(zAxisNode, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) {
                return; // Ignorar tabelas sem endereço de memória
            }

            const xAxisNode = findNode(tableEl, 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'XDFAXIS[id="y"]');
            
            if (!xAxisNode || !yAxisNode) {
                 return; // É um mapa 1D ou tabela de valores, ignorar por agora para garantir estabilidade
            }
            
            const xAxisDef = parseAxisDimension(xAxisNode, allTablesMap);
            const yAxisDef = parseAxisDimension(yAxisNode, allTablesMap);

            const cols = xAxisDef.count;
            const rows = yAxisDef.count;
            if (cols === 0 || rows === 0) {
                // Em vez de lançar um erro, simplesmente ignoramos esta tabela.
                // Isto evita que a aplicação falhe em tabelas 1D ou com formato inesperado.
                throw new Error("Dimensões da tabela (linhas/colunas) não podem ser zero.");
            }

            const dataSizeBits = parseInt(getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            const rowStrideBits = parseInt(getAttr(embeddedData, 'mmedrowstridebits') || `${cols * dataSizeBits}`, 10);
            
            definitions.push({
                uniqueId: uniqueId,
                name: tableName,
                address,
                rows,
                cols,
                dataSize: dataSizeBits / 8,
                colStrideBytes: dataSizeBits / 8, // Stride da coluna é o tamanho do dado
                rowStrideBytes: rowStrideBits / 8,
                dataOrganization: 'ROW_MAJOR', // Assumir ROW_MAJOR como padrão
                isBigEndian: getIsBigEndian(embeddedData),
                equation: getAttr(findNode(zAxisNode, 'math', 'MATH'), 'equation') || 'X',
                decimalpl: parseInt(findNode(zAxisNode, 'decimalpl')?.textContent || '2', 10),
                xAxisDef,
                yAxisDef,
            });
        } catch (e) {
            console.warn(`Aviso ao analisar a tabela "${tableName}" (ID: ${uniqueId}): ${(e as Error).message}. Esta tabela será ignorada.`);
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
            originalIndices: Array.from({ length: numValues.length }, (_, i) => i),
        };
    }
    
    const defaultState: AxisDataState = {
        label,
        raw: Array.from({ length: count }, (_, i) => i + 1),
        calculated: Array.from({ length: count }, (_, i) => i + 1),
        originalIndices: Array.from({ length: count }, (_, i) => i),
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
            rawValue = 0; // Fallback for unsupported data sizes
        }
        
        raw.push(rawValue);
        try {
            calculated.push(equationFunc(rawValue));
        } catch (e) {
            calculated.push(rawValue);
        }
    }
    return { raw, calculated, originalIndices: Array.from({ length: calculated.length }, (_, i) => i), label };
}

function sortAxis(axisData: AxisDataState): AxisDataState {
    const isNumeric = axisData.calculated.every(v => typeof v === 'number' && isFinite(v));
    if (!isNumeric) {
        return axisData;
    }

    const indexed = (axisData.calculated as number[]).map((value, index) => ({
        value,
        originalIndex: axisData.originalIndices[index],
        originalRaw: axisData.raw[index]
    }));
    
    indexed.sort((a, b) => a.value - b.value);

    return {
        ...axisData,
        raw: indexed.map(item => item.originalRaw),
        calculated: indexed.map(item => item.value),
        originalIndices: indexed.map(item => item.originalIndex),
    };
}


export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
    const {
        address, rows, cols, dataSize, equation: eq,
        dataOrganization, colStrideBytes, rowStrideBytes
    } = def;
    
    const unsortedXAxis = readAxisFromBin(binBuffer, def.xAxisDef);
    const unsortedYAxis = readAxisFromBin(binBuffer, def.yAxisDef);

    const sortedXAxis = sortAxis(unsortedXAxis);
    const sortedYAxis = sortAxis(unsortedYAxis);

    const actualRows = def.yAxisDef.count;
    const actualCols = def.xAxisDef.count;
    
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    const equation = normalizeEquation(eq);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    const originalRawMap: MapData = Array.from({ length: actualRows }, () => Array(actualCols).fill(null));
    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);
            
            if (offset + dataSize > view.byteLength) continue;
            
            try {
                let rawValue;
                if (dataSize === 1) {
                    rawValue = view.getUint8(offset);
                } else if (dataSize === 2) {
                    rawValue = view.getUint16(offset, useLittleEndianForZ);
                } else {
                    rawValue = 0;
                }
                originalRawMap[r][c] = rawValue;
            } catch (e) {
                console.error(`Erro ao ler o BIN no offset ${offset}: ${(e as Error).message}`);
            }
        }
    }
    
    const sortedRawMap = sortedYAxis.originalIndices.map(originalRowIndex => 
        sortedXAxis.originalIndices.map(originalColIndex => originalRawMap[originalRowIndex]?.[originalColIndex] ?? null)
    );
    
    const sortedCalculatedMap = sortedRawMap.map(row => 
        row.map(cellValue => {
            if (cellValue === null) return null;
            try {
                const result = zEquationFunc(cellValue);
                return typeof result === 'number' ? result : parseFloat(result);
            } catch {
                return cellValue;
            }
        })
    );

    return { 
        calculatedMap: sortedCalculatedMap, 
        rawMap: sortedRawMap, 
        sortedAxes: { x: sortedXAxis, y: sortedYAxis } 
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

    // Tenta resolver equações simples como Y = X * C, Y = X / C, etc.
    const simpleMatch = sanitizedEq.match(/^X\s*([*\/+-])\s*([\d.]+)$/) || sanitizedEq.match(/^([\d.]+)\s*([*\/+-])\s*X$/);

    if (simpleMatch) {
        const op = simpleMatch[1] || simpleMatch[2];
        const valStr = simpleMatch[2] || simpleMatch[1];
        const val = parseFloat(valStr);

        if(!isNaN(val)) {
            switch (op) {
                case '*': return finalValue / val;
                case '/': return finalValue * val; // Se Y = X/C, então X = Y*C
                case '+': return finalValue - val;
                case '-': 
                  // Se a equação for C - X, a inversão é C - Y. Se for X - C, é Y + C
                  return sanitizedEq.startsWith('X') ? finalValue + val : val - finalValue;
            }
        }
    }

    // Tenta resolver equações como Y = (X - 128) * 0.5
    const complexMatch = sanitizedEq.match(/^\(\s*X\s*([+\-])\s*([\d.]+)\s*\)\s*([*\/])\s*([\d.]+)$/);
    if(complexMatch) {
        const [, innerOp, innerValStr, outerOp, outerValStr] = complexMatch;
        const innerVal = parseFloat(innerValStr);
        const outerVal = parseFloat(outerValStr);
        
        if (!isNaN(innerVal) && !isNaN(outerVal)) {
            let result = finalValue;
            // Inverte a operação externa primeiro
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            // Inverte a operação interna
            if (innerOp === '+') result -= innerVal;
            if (innerOp === '-') result += innerVal;
            return result;
        }
    }
    
    // Tenta resolver equações como Y = (128 - X) * 0.5
    const complexMatch2 = sanitizedEq.match(/^\(\s*([\d.]+)\s*([+\-])\s*X\s*\)\s*([*\/])\s*([\d.]+)$/);
     if(complexMatch2) {
        const [, innerValStr, innerOp, outerOp, outerValStr] = complexMatch2;
        const innerVal = parseFloat(innerValStr);
        const outerVal = parseFloat(outerValStr);
        
        if (!isNaN(innerVal) && !isNaN(outerVal)) {
            let result = finalValue;
            // Inverte a operação externa primeiro
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            // Inverte a operação interna, C - X = Y -> X = C - Y
            if (innerOp === '-') result = innerVal - result;
            // C + X = Y -> X = Y - C
            if (innerOp === '+') result = result - innerVal;

            return result;
        }
    }


    console.warn(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente. A devolver o valor original.`);
    return finalValue; // Fallback se a inversão falhar
}

export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
    sourceAxes: { x: AxisDataState, y: AxisDataState },
): MapData {
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }
    
    // Cria um mapa "desordenado" (na ordem original do BIN) a partir do mapa ordenado
    const unsortedCalculatedMap: MapData = Array(def.rows).fill(null).map(() => Array(def.cols).fill(null));
    
    sourceAxes.y.originalIndices.forEach((originalRow, sortedRow) => {
        sourceAxes.x.originalIndices.forEach((originalCol, sortedCol) => {
            if(originalRow < def.rows && originalCol < def.cols) {
                unsortedCalculatedMap[originalRow][originalCol] = calculatedMap[sortedRow][sortedCol];
            }
        });
    });
    
    const newRawMap: MapData = [];
    for (let r = 0; r < def.rows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < def.cols; c++) {
            const calculatedValue = unsortedCalculatedMap[r]?.[c];
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

    const {
        address, rows, cols, dataSize,
        colStrideBytes, rowStrideBytes, dataOrganization
    } = def;

    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const rawValue = rawMapData[r]?.[c];
            if (rawValue === null || rawValue === undefined || isNaN(rawValue)) continue;

            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);

            if (offset + dataSize > view.byteLength) {
                console.error(`Escrita do mapa fora dos limites. Offset: ${offset} para o mapa "${def.name}". A saltar.`);
                continue;
            }
            
            try {
                const intValue = Math.round(rawValue);
                if (dataSize === 1) {
                    view.setUint8(offset, Math.max(0, Math.min(255, intValue)));
                } else if (dataSize === 2) {
                     view.setUint16(offset, Math.max(0, Math.min(65535, intValue)), useLittleEndianForZ);
                }
            } catch (e) {
                 console.error(`Não foi possível escrever a célula [${r},${c}] para o mapa "${def.name}": ${(e as Error).message}`);
            }
        }
    }
    
    return newBuffer;
}
