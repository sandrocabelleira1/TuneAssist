
import type { XDFDefinition, AxisDataState, AxisDimension, MapData } from './types';

// Função auxiliar para encontrar um nó filho direto
function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
        // :scope garante que procuramos apenas em filhos diretos
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
    // Substitui a variável por 'X' maiúsculo e remove espaços desnecessários
    let sanitizedEq = eq.trim().toUpperCase().replace(/x/g, 'X');
    // Adiciona operadores de multiplicação implícitos para segurança (ex: 0.25*X em vez de 0.25X)
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    return sanitizedEq;
}

// Verifica o atributo 'bigendian' e retorna um booleano
function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    // Considera "0" ou "false" como little-endian. Qualquer outra coisa (ou ausência) é big-endian.
    if (attr === '0' || attr?.toLowerCase() === 'false') {
        return false;
    }
    return true; 
}


export function parseXDF(xmlString: string): { definitions: XDFDefinition[], brand: string | null } {
    if (typeof DOMParser === 'undefined') {
        throw new Error("O ambiente não suporta DOMParser.");
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    
    // Verifica se houve um erro de análise no XML
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        throw new Error(`Erro de análise do XDF: ${parseError.textContent}`);
    }

    // Encontra todas as tabelas no documento
    const allTableElements = xmlDoc.querySelectorAll('XDFTABLE, table');
    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> ou <table> foi encontrada no ficheiro. Este não parece ser um ficheiro XDF válido.");
    }
    
    // Tenta extrair a marca do cabeçalho do XDF
    const header = findNode(xmlDoc, 'XDF', 'xdfile');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    const definitions: XDFDefinition[] = [];

    allTableElements.forEach(tableEl => {
        try {
            const tableName = findNode(tableEl, 'title')?.textContent?.trim() || getAttr(tableEl, 'name');
            if (!tableName) return; // Salta tabelas sem nome
            
            // Procura o nó de dados principal (eixo Z)
            const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]', 'XDFAXIS[id="Z"]');
            if (!zAxisNode) return; // Salta tabelas sem definição de eixo Z
            
            // Encontra a definição de dados embutidos para obter o endereço de memória
            const embeddedData = findNode(tableEl, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return; // Salta tabelas sem um endereço válido
            
            // Função interna para analisar um eixo (X ou Y)
            const parseAxis = (axisNode: Element, defaultCount: number, defaultLabel: string): AxisDimension => {
                 const sourceEmbeddedData = findNode(axisNode, 'embeddeddata', 'EMBEDDEDDATA');
                 const sourceAddr = parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16);
                 const dataSizeBits = parseInt(getAttr(axisNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10);
                 const dataSize = dataSizeBits / 8;
                 
                 // Verifica se existem valores explícitos (labels) para o eixo
                 const labelNodes = axisNode.querySelectorAll('label');
                 const explicitValues: (string | number)[] = [];
                 if (labelNodes.length > 0) {
                    labelNodes.forEach(labelNode => {
                        explicitValues.push(labelNode.textContent || '');
                    });
                 }

                 return {
                    count: explicitValues.length > 0 ? explicitValues.length : parseInt(findNode(axisNode, 'indexcount')?.textContent || `${defaultCount}`, 10),
                    label: findNode(axisNode, 'title')?.textContent?.trim() || findNode(axisNode, 'units')?.textContent?.trim() || defaultLabel,
                    address: !isNaN(sourceAddr) ? sourceAddr : undefined,
                    dataSize,
                    stride: dataSize, // Assume que o stride é igual ao tamanho do dado
                    isBigEndian: getIsBigEndian(sourceEmbeddedData),
                    equation: getAttr(findNode(axisNode, 'math', 'MATH'), 'equation') || 'X',
                    decimalpl: parseInt(findNode(axisNode, 'decimalpl')?.textContent || '1', 10),
                    values: explicitValues.length > 0 ? explicitValues : undefined,
                 };
            };

            const xAxisNode = findNode(tableEl, 'xaxis', 'XDFAXIS[id="x"]');
            const yAxisNode = findNode(tableEl, 'yaxis', 'XDFAXIS[id="y"]');
            if (!xAxisNode || !yAxisNode) return; // Requer ambos os eixos
            
            // Obtém as dimensões da tabela
            const cols = parseInt(getAttr(xAxisNode, 'indexcount') || getAttr(tableEl, 'cols') || '0', 10);
            const rows = parseInt(getAttr(yAxisNode, 'indexcount') || getAttr(tableEl, 'rows') || '0', 10);
            if (cols === 0 || rows === 0) return; // Requer dimensões válidas

            const xAxisDef = parseAxis(xAxisNode, cols, 'Eixo X');
            const yAxisDef = parseAxis(yAxisNode, rows, 'Eixo Y');
            
            // Obtém o tamanho dos dados do eixo Z
            const dataSizeBits = parseInt(getAttr(zAxisNode, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            const dataSize = dataSizeBits / 8;
            
            // Adiciona a definição completa à lista
            definitions.push({
                uniqueId: getAttr(tableEl, 'uniqueid') || tableName,
                name: tableName,
                address,
                rows,
                cols,
                dataSize,
                colStrideBytes: dataSize,
                rowStrideBytes: cols * dataSize,
                dataOrganization: 'ROW_MAJOR', // Assume ROW_MAJOR por defeito
                isBigEndian: getIsBigEndian(embeddedData),
                equation: getAttr(findNode(zAxisNode, 'math', 'MATH'), 'equation') || 'X',
                decimalpl: parseInt(findNode(zAxisNode, 'decimalpl')?.textContent || '2', 10),
                xAxisDef,
                yAxisDef,
                isPotential: false,
            });
        } catch (e) {
            const tableName = getAttr(tableEl, 'name') || 'desconhecida';
            console.error(`Erro ao analisar a tabela "${tableName}": ${(e as Error).message}`);
        }
    });

    return { definitions, brand };
}

// Lê os valores de um eixo do ficheiro BIN
export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisDataState {
    const { count = 0, label = 'Eixo Desconhecido' } = axisDef || {};
    
    // Se o eixo tiver valores fixos no XDF, usa-os diretamente
    if (axisDef?.values && axisDef.values.length > 0) {
        const numValues = axisDef.values.map(v => typeof v === 'number' ? v : 0);
        return {
            label,
            raw: numValues,
            calculated: axisDef.values,
            originalIndices: Array.from({ length: axisDef.values.length }, (_, i) => i),
        };
    }
    
    // Estado padrão se não houver endereço ou definição
    const defaultState: AxisDataState = {
        label,
        raw: Array.from({ length: count }, (_, i) => i + 1),
        calculated: Array.from({ length: count }, (_, i) => i + 1),
        originalIndices: Array.from({ length: count }, (_, i) => i),
    };

    if (!axisDef || !binBuffer || axisDef.address === undefined || axisDef.address === null) {
        return defaultState;
    }

    const view = new DataView(binBuffer);
    const { address: addr, dataSize = 2, equation: eq, isBigEndian } = axisDef;
    const useLittleEndian = !(isBigEndian ?? false);
    const equation = normalizeEquation(eq);
    const stride = axisDef.stride || dataSize;

    if (isNaN(addr) || isNaN(count) || isNaN(dataSize)) return defaultState;

    // Cria a função de cálculo a partir da string da equação
    let equationFunc: (val: number) => number | string;
    try {
        equationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch (e) {
        console.error(`Equação de eixo inválida para "${label}": ${equation}`);
        equationFunc = (X: number) => X; // Retorna o valor raw em caso de erro
    }

    const raw: number[] = [];
    const calculated: (number | string)[] = [];
    
    const axisCount = axisDef.count || count;

    for (let i = 0; i < axisCount; i++) {
        const offset = addr + (i * stride);
        if (offset + dataSize > view.byteLength) continue;

        let rawValue = dataSize === 1 ? view.getUint8(offset) : view.getUint16(offset, useLittleEndian);
        raw.push(rawValue);
        try {
            calculated.push(equationFunc(rawValue));
        } catch (e) {
            calculated.push(rawValue); // Em caso de erro, usa o valor raw
        }
    }
    return { raw, calculated, originalIndices: Array.from({ length: calculated.length }, (_, i) => i), label };
}

// Ordena um eixo se ele for numérico
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

// Lê e calcula um mapa completo, incluindo a ordenação e alinhamento
export function readAndCalculateMapFromBin(
    binBuffer: ArrayBuffer,
    def: XDFDefinition,
): { calculatedMap: MapData, rawMap: MapData, sortedAxes: { x: AxisDataState, y: AxisDataState } } {
    const {
        address, rows, cols, dataSize, equation: eq,
        dataOrganization, colStrideBytes, rowStrideBytes
    } = def;
    
    // Lê os eixos na sua ordem original
    const unsortedXAxis = readAxisFromBin(binBuffer, def.xAxisDef);
    const unsortedYAxis = readAxisFromBin(binBuffer, def.yAxisDef);

    // Ordena os eixos
    const sortedXAxis = sortAxis(unsortedXAxis);
    const sortedYAxis = sortAxis(unsortedYAxis);

    const actualRows = def.yAxisDef.count || rows;
    const actualCols = def.xAxisDef.count || cols;
    
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    const equation = normalizeEquation(eq);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    // Lê os dados brutos do mapa na sua ordem original (como no BIN)
    const originalRawMap: MapData = Array.from({ length: actualRows }, () => Array(actualCols).fill(null));

    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);
            
            if (offset + dataSize > view.byteLength) continue;
            
            try {
                const rawValue = dataSize === 1 ? view.getUint8(offset) : view.getUint16(offset, useLittleEndianForZ);
                originalRawMap[r][c] = rawValue;
            } catch (e) {
                console.error(`Erro ao ler o BIN no offset ${offset}: ${(e as Error).message}`);
            }
        }
    }
    
    // Reordena o mapa para corresponder aos eixos ordenados
    const sortedRawMap = sortedYAxis.originalIndices.map(originalRowIndex => 
        sortedXAxis.originalIndices.map(originalColIndex => originalRawMap[originalRowIndex]?.[originalColIndex] ?? null)
    );
    
    // Calcula os valores finais a partir do mapa reordenado
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

// Obtém o endereço de memória de uma célula específica
export function getCellAddress(def: XDFDefinition, rowIndex: number, colIndex: number): number | null {
    if (!def) return null;
    const { address, rowStrideBytes, colStrideBytes, dataOrganization } = def;

    // Esta função assume que rowIndex e colIndex são para o mapa ordenado.
    // Para obter o endereço correto, precisaríamos dos índices originais.
    // Esta implementação é uma simplificação para exibição.
    if (dataOrganization === 'COL_MAJOR') {
        return address + (colIndex * rowStrideBytes) + (rowIndex * colStrideBytes);
    } 
    return address + (rowIndex * rowStrideBytes) + (colIndex * colStrideBytes);
}

// Gera um checksum simples do buffer
export function generateChecksum(buffer: ArrayBuffer): string {
    const dataView = new DataView(buffer);
    let checksum = 0;
    for (let i = 0; i < buffer.byteLength; i++) {
        checksum = (checksum + dataView.getUint8(i)) % 65536;
    }
    return checksum.toString(16).toUpperCase().padStart(4, '0');
}

// Converte um buffer para uma string hexadecimal
export function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Inverte uma equação matemática simples para encontrar o valor original
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

    // Tenta resolver para aritmética simples: X * C, X / C, X + C, X - C
    const parts = sanitizedEq.split(/([*\/+-])/).map(p => p.trim());
    
    if (parts.length === 3) {
      const operator = parts[1];
      const isXFirst = parts[0].toUpperCase() === 'X';
      const operandStr = isXFirst ? parts[2] : parts[0];
      const operand = parseFloat(operandStr);

      if (isNaN(operand)) {
          throw new Error(`Operando inválido na equação "${eq}".`);
      }

      switch (operator) {
        case '*': return finalValue / operand;
        case '/': return finalValue * operand;
        case '+': return finalValue - operand;
        case '-':
            return isXFirst ? finalValue + operand : operand - finalValue;
      }
    }
    
    // Tenta resolver para (X+C)*V
    const match = sanitizedEq.match(/\(\s*X\s*([+\-])\s*(\d+\.?\d*)\s*\)\s*([*\/])\s*(\d+\.?\d*)/);
    if(match) {
        const [, innerOp, innerValStr, outerOp, outerValStr] = match;
        const innerVal = parseFloat(innerValStr);
        const outerVal = parseFloat(outerValStr);
        
        if (!isNaN(innerVal) && !isNaN(outerVal)) {
            let result = finalValue;
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            if (innerOp === '+') result -= innerVal;
            if (innerOp === '-') result += innerVal;
            return result;
        }
    }

    throw new Error(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente.`);
}

// Recalcula o mapa de dados brutos a partir dos dados calculados
export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
    sourceAxes: { x: AxisDataState, y: AxisDataState },
): MapData {
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }
    
    // Cria um mapa "desordenado" para corresponder à ordem do BIN
    const unsortedCalculatedMap: MapData = Array(calculatedMap.length).fill(null).map(() => Array(calculatedMap[0].length).fill(null));
    
    sourceAxes.y.originalIndices.forEach((originalRow, sortedRow) => {
        sourceAxes.x.originalIndices.forEach((originalCol, sortedCol) => {
            unsortedCalculatedMap[originalRow][originalCol] = calculatedMap[sortedRow][sortedCol];
        });
    });
    
    const actualRows = def.yAxisDef.count || def.rows;
    const actualCols = def.xAxisDef.count || def.cols;

    const newRawMap: MapData = [];
    for (let r = 0; r < actualRows; r++) {
        const newRawRow: (number | null)[] = [];
        for (let c = 0; c < actualCols; c++) {
            const calculatedValue = unsortedCalculatedMap[r]?.[c];
            if (calculatedValue === null || calculatedValue === undefined) {
                newRawRow.push(null);
                continue;
            }
            try {
                const newRawValue = invertEquation(def.equation, calculatedValue as number);
                newRawRow.push(newRawValue);
            } catch (e) {
                console.error(`Não foi possível recalcular o valor raw para a célula [${r}, ${c}]: ${(e as Error).message}.`);
                newRawRow.push(NaN);
            }
        }
        newRawMap.push(newRawRow);
    }
    return newRawMap;
}

// Escreve o mapa de dados brutos de volta no buffer do BIN
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

    const actualRows = def.yAxisDef.count || rows;
    const actualCols = def.xAxisDef.count || def.cols;

    const newBuffer = binBuffer.slice(0); // Cria uma cópia
    const view = new DataView(newBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    
    const mapToWrite = [...rawMapData];

    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
            const rawValue = mapToWrite[r][c];
            if (rawValue === null || isNaN(rawValue)) continue;

            const offset = dataOrganization === 'COL_MAJOR'
                ? address + (c * rowStrideBytes) + (r * colStrideBytes)
                : address + (r * rowStrideBytes) + (c * colStrideBytes);

            if (offset + dataSize > view.byteLength) {
                console.error(`Escrita do mapa fora dos limites. Offset: ${offset}. A saltar.`);
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
