

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DownloadCloud, Settings, Table } from 'lucide-react';
import type { PotentialMap } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { readDataFromAddress } from '@/lib/ecu';
import { HexViewer } from '@/components/hex-viewer';


interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
}

export default function MapScanner({ binFile, onLoadMap }: MapScannerProps) {
    
    const [definition, setDefinition] = useState({
        address: '',
        rows: '',
        cols: '',
        dataType: '16-bit LE',
        equation: 'x',
        rowStride: '',
    });

    const { toast } = useToast();

    const handleCreateMap = useCallback(() => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN não carregado", variant: "destructive" });
            return;
        }
        
        const addr = parseInt(definition.address, 16);
        const rows = parseInt(definition.rows, 10);
        const cols = parseInt(definition.cols, 10);

        if (isNaN(addr) || isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
            toast({ title: "Valores Inválidos", description: "Verifique o endereço, as linhas e as colunas. Devem ser números positivos.", variant: "destructive" });
            return;
        }

        const dataSize = definition.dataType.includes('16') ? 2 : 1;
        const isBigEndian = definition.dataType.includes('BE');

        const view = new DataView(binFile.buffer);
        const rowStrideVal = definition.rowStride ? parseInt(definition.rowStride, 10) : cols * dataSize;
        
        const previewData: number[][] = [];
        try {
            for (let r = 0; r < Math.min(rows, 10); r++) { // Preview up to 10 rows
                const rowData = readDataFromAddress(view, addr + (r * rowStrideVal), cols, dataSize, !isBigEndian);
                if (rowData) {
                    previewData.push(rowData);
                } else {
                     throw new Error(`Não foi possível ler a linha ${r} no endereço 0x${(addr + (r * rowStrideVal)).toString(16)}`);
                }
            }
        } catch (e) {
            toast({ title: "Erro ao Ler Dados", description: (e as Error).message, variant: "destructive" });
            return;
        }


        const newMap: PotentialMap = {
            address: addr,
            rows,
            cols,
            dataSize,
            isBigEndian,
            confidence: 1, // Manual creation has 100% confidence
            suggestion: "Criado manualmente",
            dataType: definition.dataType,
            equation: definition.equation,
            rowStride: definition.rowStride ? parseInt(definition.rowStride, 10) : undefined,
            previewData,
            xAxisType: 'Desconhecido',
            yAxisType: 'Desconhecido',
        };
        
        onLoadMap(newMap);

    }, [binFile, definition, onLoadMap, toast]);
    

    if (!binFile) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Ficheiro BIN Necessário</h3>
                <p className="max-w-md">Para utilizar o scanner de mapas, por favor carregue primeiro um ficheiro .BIN no painel de controlo à esquerda.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full gap-4">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings /> Definição Manual de Mapa</CardTitle>
                        <CardDescription>
                           Use o Visualizador Hexadecimal abaixo para encontrar o endereço de início de um mapa. Defina as suas dimensões e carregue-o para análise.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="def-addr">Endereço (Hex)</Label>
                                <Input id="def-addr" placeholder="0x8000" value={definition.address} onChange={e => setDefinition(d => ({...d, address: e.target.value}))} />
                            </div>
                            <div>
                                <Label htmlFor="def-type">Tipo de Dados</Label>
                                <Select value={definition.dataType} onValueChange={v => setDefinition(d => ({...d, dataType: v as any}))}>
                                    <SelectTrigger id="def-type"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8-bit">8-bit</SelectItem>
                                        <SelectItem value="16-bit LE">16-bit LE</SelectItem>
                                        <SelectItem value="16-bit BE">16-bit BE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="def-rows">Linhas (Y)</Label>
                                <Input id="def-rows" type="number" placeholder="16" value={definition.rows} onChange={e => setDefinition(d => ({...d, rows: e.target.value}))} />
                            </div>
                             <div>
                                <Label htmlFor="def-cols">Colunas (X)</Label>
                                <Input id="def-cols" type="number" placeholder="20" value={definition.cols} onChange={e => setDefinition(d => ({...d, cols: e.target.value}))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="def-eq">Equação</Label>
                                <Input id="def-eq" placeholder="x" value={definition.equation} onChange={e => setDefinition(d => ({...d, equation: e.target.value}))} />
                            </div>
                             <div>
                                <Label htmlFor="def-stride">Passo da Linha (Bytes)</Label>
                                <Input id="def-stride" type="number" placeholder="Auto (Cols * DataSize)" value={definition.rowStride} onChange={e => setDefinition(d => ({...d, rowStride: e.target.value}))} />
                            </div>
                        </div>
                        <Button onClick={handleCreateMap} className="w-full"><DownloadCloud className="mr-2" /> Carregar Mapa Manual</Button>
                    </CardContent>
                </Card>
                
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Table /> Visualizador Hexadecimal</CardTitle>
                        <CardDescription>Use esta ferramenta para encontrar os endereços dos mapas e dos eixos no ficheiro. Os dados da ECU são armazenados em formato hexadecimal.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-6rem)]">
                        <HexViewer fileBuffer={binFile ? binFile.buffer : null} />
                    </CardContent>
                </Card>
             </div>
             
             <Card className="flex-1 min-h-[300px]">
                <CardHeader>
                    <CardTitle>Como Encontrar Mapas Manualmente</CardTitle>
                    <CardDescription>Encontrar mapas requer um olhar atento para padrões nos dados.</CardDescription>
                </CardHeader>
                 <CardContent className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                    <ol>
                        <li><strong>Procure por Eixos:</strong> Percorra o ficheiro no Visualizador Hexadecimal. Procure por sequências de números que aumentam ou diminuem de forma consistente. Estes são os seus eixos de RPM e Carga. Anote os seus endereços de início.</li>
                        <li><strong>Identifique a Estrutura:</strong> Olhe para os dados imediatamente a seguir aos eixos. Frequentemente, encontrará um bloco de dados que se parece com uma tabela 3D. A "forma" destes dados pode indicar que é um mapa.</li>
                        <li><strong>Determine as Dimensões:</strong> Conte o número de valores em cada eixo que encontrou. Se um eixo tem 16 valores e o outro 20, você está provavelmente à procura de um mapa de 20x16 (Colunas x Linhas).</li>
                        <li><strong>Insira os Dados:</strong> Introduza o endereço de início do mapa (não dos eixos), as dimensões (Linhas e Colunas) e o tipo de dados no painel "Definição Manual" e clique em "Carregar".</li>
                        <li><strong>Analise:</strong> A aplicação irá carregar o mapa. Use os gráficos 2D e 3D para ver se ele se parece com um mapa de ignição, injeção ou outro. Se não parecer correto, ajuste as dimensões ou o endereço e tente novamente.</li>
                    </ol>
                 </CardContent>
             </Card>
        </div>
    );
}
