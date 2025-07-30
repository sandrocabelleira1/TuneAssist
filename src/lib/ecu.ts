
import type { XDFDefinition, AxisDataState, AxisDimension, MapData } from './types';

// Função auxiliar para encontrar um nó filho direto
function findNode(parent: Element | Document, ...selectors: string[]): Element | null {
    if (!parent) return null;
    for (const selector of selectors) {
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
    let sanitizedEq = eq.trim().toUpperCase().replace(/x/g, 'X');
    // Adiciona operadores de multiplicação em falta, ex: 0.75X -> 0.75*X
    sanitizedEq = sanitizedEq.replace(/(\d*\.?\d+)([A-Z])/g, '$1*$2').replace(/([A-Z])(\d*\.?\d+)/g, '$1*$2');
    return sanitizedEq;
}

// Verifica o atributo 'bigendian' e retorna um booleano
function getIsBigEndian(element: Element | null): boolean {
    const attr = getAttr(element, 'bigendian');
    // Considera "0" ou "false" como little-endian, qualquer outra coisa (incluindo a ausência) como big-endian por defeito do TunerPro.
    return attr !== '0' && attr?.toLowerCase() !== 'false';
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

    const allTableElements = Array.from(xmlDoc.querySelectorAll('XDFTABLE, table'));
    if (allTableElements.length === 0) {
        throw new Error("Nenhuma tag <XDFTABLE> ou <table> foi encontrada no ficheiro. Este não parece ser um ficheiro XDF válido.");
    }
    
    const header = findNode(xmlDoc, 'XDF', 'xdfile');
    const brand = findNode(header, 'DEFAULTS', 'defaults')?.querySelector('CATEGORY')?.textContent?.split(' ')[0] || null;

    const definitions: XDFDefinition[] = [];

    allTableElements.forEach(tableEl => {
        try {
            const tableName = findNode(tableEl, 'title')?.textContent?.trim() || getAttr(tableEl, 'name');
            if (!tableName) return;

            const zAxisNode = findNode(tableEl, 'XDFAXIS[id="z"]');
            if (!zAxisNode) return; // Se não houver eixo Z, não é um mapa de dados válido

            const embeddedData = findNode(tableEl, 'embeddeddata', 'EMBEDDEDDATA');
            const address = parseInt(getAttr(embeddedData, 'mmedaddress') || '', 16);
            if (isNaN(address)) return; // Se não houver endereço, não podemos ler
            
            const parseAxis = (axisId: 'x' | 'y'): AxisDimension => {
                 const axisNode = findNode(tableEl, `XDFAXIS[id="${axisId}"]`);
                 const altAxisNode = findNode(tableEl, axisId === 'x' ? 'xaxis' : 'yaxis');
                 const sourceNode = axisNode || altAxisNode;
                 if (!sourceNode) throw new Error(`Nó do eixo ${axisId} não encontrado.`);

                 const sourceEmbeddedData = findNode(sourceNode, 'embeddeddata', 'EMBEDDEDDATA');
                 
                 let count = parseInt(findNode(sourceNode, 'indexcount')?.textContent || '0', 10);
                 const labelNodes = sourceNode.querySelectorAll(':scope > label');
                 const explicitValues: (string | number)[] = [];
                 if (labelNodes.length > 0) {
                    labelNodes.forEach(labelNode => {
                        // Tenta obter o valor do atributo 'index' e converte para número
                        const val = parseFloat(getAttr(labelNode, 'index') || '');
                        // Se for um número válido, usa-o, caso contrário usa o texto do nó
                        explicitValues.push(isNaN(val) ? (labelNode.textContent || '') : val);
                    });
                    count = explicitValues.length;
                 }

                 return {
                    count: count,
                    label: findNode(sourceNode, 'title')?.textContent?.trim() || findNode(sourceNode, 'units')?.textContent?.trim() || (axisId === 'x' ? 'Eixo X' : 'Eixo Y'),
                    address: parseInt(getAttr(sourceEmbeddedData, 'mmedaddress') || '', 16) || undefined,
                    dataSize: (parseInt(getAttr(sourceNode, 'elementsizebits') || getAttr(sourceEmbeddedData, 'mmedelementsizebits') || '16', 10)) / 8,
                    isBigEndian: getIsBigEndian(sourceEmbeddedData),
                    equation: getAttr(findNode(sourceNode, 'math', 'MATH'), 'equation') || 'X',
                    decimalpl: parseInt(findNode(sourceNode, 'decimalpl')?.textContent || '1', 10),
                    values: explicitValues.length > 0 ? explicitValues : undefined,
                 };
            };
            
            const colsEl = findNode(tableEl, 'xaxis');
            const rowsEl = findNode(tableEl, 'yaxis');
            
            const cols = parseInt(getAttr(colsEl, 'indexcount') || '0', 10);
            const rows = parseInt(getAttr(rowsEl, 'indexcount') || '0', 10);
            
            if (cols === 0 || rows === 0) return;
            
            const xAxisDef = parseAxis('x');
            const yAxisDef = parseAxis('y');

            const dataSizeBits = parseInt(getAttr(zAxisNode, 'elementsizebits') || getAttr(embeddedData, 'mmedelementsizebits') || '16', 10);
            
            definitions.push({
                uniqueId: getAttr(tableEl, 'uniqueid') || tableName,
                name: tableName,
                address,
                rows: rows,
                cols: cols,
                dataSize: dataSizeBits / 8,
                colStrideBytes: dataSizeBits / 8, // Stride simples, ajustaremos mais tarde se necessário
                rowStrideBytes: (cols) * (dataSizeBits / 8),
                dataOrganization: 'ROW_MAJOR', // Assumir ROW_MAJOR por defeito
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

export function readAxisFromBin(binBuffer: ArrayBuffer, axisDef: AxisDimension): AxisDataState {
    const { count = 0, label = 'Eixo Desconhecido' } = axisDef || {};
    
    // Se houver valores explícitos no XDF (tags <label>), usa-os diretamente
    if (axisDef?.values && axisDef.values.length > 0) {
        const numValues = axisDef.values.map(v => typeof v === 'number' ? v : (parseFloat(v as string) || 0) );
        return {
            label,
            raw: numValues, // O "raw" aqui é o próprio valor, já que não vem do BIN
            calculated: axisDef.values,
            originalIndices: Array.from({ length: axisDef.values.length }, (_, i) => i),
        };
    }
    
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

    let equationFunc: (val: number) => number | string;
    try {
        // Cria a função de forma segura
        equationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch (e) {
        console.error(`Equação de eixo inválida para "${label}": ${equation}`);
        equationFunc = (X: number) => X; // Retorna o valor original em caso de erro
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
            calculated.push(rawValue); // Em caso de erro no cálculo, usa o valor raw
        }
    }
    return { raw, calculated, originalIndices: Array.from({ length: calculated.length }, (_, i) => i), label };
}

// Ordena um eixo e mantém o registo dos seus índices originais
function sortAxis(axisData: AxisDataState): AxisDataState {
    const isNumeric = axisData.calculated.every(v => typeof v === 'number' && isFinite(v));
    if (!isNumeric) {
        return axisData; // Não ordena eixos não numéricos
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
    
    // 1. Ler os eixos como estão no BIN
    const unsortedXAxis = readAxisFromBin(binBuffer, def.xAxisDef);
    const unsortedYAxis = readAxisFromBin(binBuffer, def.yAxisDef);

    // 2. Ordenar os eixos e guardar os mapeamentos de índice
    const sortedXAxis = sortAxis(unsortedXAxis);
    const sortedYAxis = sortAxis(unsortedYAxis);

    const actualRows = def.rows;
    const actualCols = def.cols;
    
    const view = new DataView(binBuffer);
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    const equation = normalizeEquation(eq);

    let zEquationFunc: (val: number) => number | string;
    try {
        zEquationFunc = new Function('X', `return ${equation}`) as (val: number) => number;
    } catch(e) {
        throw new Error(`A equação do mapa "${equation}" para "${def.name}" é inválida.`);
    }

    // 3. Ler a tabela de dados Z inteira na ordem original (sem ordenação)
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
    
    // 4. Criar um novo mapa de dados Z (raw e calculado) ordenado com base nos eixos ordenados
    const sortedRawMap = sortedYAxis.originalIndices.map(originalRowIndex => 
        sortedXAxis.originalIndices.map(originalColIndex => originalRawMap[originalRowIndex]?.[originalColIndex] ?? null)
    );
    
    const sortedCalculatedMap = sortedRawMap.map(row => 
        row.map(cellValue => {
            if (cellValue === null) return null;
            try {
                const result = zEquationFunc(cellValue);
                // Garante que o resultado é um número
                return typeof result === 'number' ? result : parseFloat(result);
            } catch {
                return cellValue; // Retorna o valor raw em caso de erro de cálculo
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

    // A lógica aqui deve usar os índices ORDENADOS para encontrar o endereço
    // Esta função é chamada a partir da UI que mostra dados ordenados
    if (dataOrganization === 'COL_MAJOR') {
        return address + (colIndex * rowStrideBytes) + (rowIndex * colStrideBytes);
    } 
    // Assumir ROW_MAJOR
    return address + (rowIndex * rowStrideBytes) + (colIndex * colStrideBytes);
}

export function generateChecksum(buffer: ArrayBuffer): string {
    const dataView = new DataView(buffer);
    let checksum = 0;
    for (let i = 0; i < buffer.byteLength; i++) {
        checksum = (checksum + dataView.getUint8(i)) % 65536; // Checksum de 16 bits
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

    // Caso mais simples: Y = X
    if (sanitizedEq.toUpperCase() === 'X') {
        return finalValue;
    }

    // Tenta resolver equações lineares simples como Y = X * a, Y = X / a, Y = X + a, Y = X - a
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
            // Se for X - A, então X = Y + A
            // Se for A - X, então X = A - Y
            return isXFirst ? finalValue + operand : operand - finalValue;
      }
    }
    
    // Tenta resolver equações com parênteses, ex: Y = (X + a) * b
    const match = sanitizedEq.match(/\(\s*X\s*([+\-])\s*(\d+\.?\d*)\s*\)\s*([*\/])\s*(\d+\.?\d*)/);
    if(match) {
        const [, innerOp, innerValStr, outerOp, outerValStr] = match;
        const innerVal = parseFloat(innerValStr);
        const outerVal = parseFloat(outerValStr);
        
        if (!isNaN(innerVal) && !isNaN(outerVal)) {
            let result = finalValue;
            // Inverte a operação exterior primeiro
            if (outerOp === '*') result /= outerVal;
            if (outerOp === '/') result *= outerVal;
            // Inverte a operação interior
            if (innerOp === '+') result -= innerVal;
            if (innerOp === '-') result += innerVal;
            return result;
        }
    }

    throw new Error(`A equação "${eq}" é demasiado complexa para ser invertida automaticamente.`);
}

export function recalculateRawMapFromCalculated(
    calculatedMap: MapData,
    def: XDFDefinition,
    sourceAxes: { x: AxisDataState, y: AxisDataState },
): MapData {
    if (!sourceAxes.x.originalIndices || !sourceAxes.y.originalIndices) {
        throw new Error("Os índices originais dos eixos são necessários para o recálculo.");
    }
    
    // 1. Criar um mapa calculado não ordenado para corresponder à ordem original do BIN
    const unsortedCalculatedMap: MapData = Array(calculatedMap.length).fill(null).map(() => Array(calculatedMap[0].length).fill(null));
    
    sourceAxes.y.originalIndices.forEach((originalRow, sortedRow) => {
        sourceAxes.x.originalIndices.forEach((originalCol, sortedCol) => {
            unsortedCalculatedMap[originalRow][originalCol] = calculatedMap[sortedRow][sortedCol];
        });
    });
    
    const actualRows = def.rows;
    const actualCols = def.cols;

    // 2. Iterar sobre o mapa não ordenado e inverter a equação para cada célula
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
                console.error(`Não foi possível recalcular o valor raw para a célula [${r}, ${c}]: ${(e as Error).message}. A usar NaN.`);
                newRawRow.push(NaN); // Usa NaN para indicar que a inversão falhou
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

    const actualRows = def.rows;
    const actualCols = def.cols;

    // Cria uma cópia do buffer para não modificar o original
    const newBuffer = binBuffer.slice(0);
    const view = new DataView(newBuffer);
    
    const useLittleEndianForZ = !(def.isBigEndian ?? false);
    
    // O rawMapData já está na ordem original do BIN, vindo de recalculateRawMapFromCalculated
    const mapToWrite = [...rawMapData];

    for (let r = 0; r < actualRows; r++) {
        for (let c = 0; c < actualCols; c++) {
            const rawValue = mapToWrite[r]?.[c]; // Adiciona verificação de segurança
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
