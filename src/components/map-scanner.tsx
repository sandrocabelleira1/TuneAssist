

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Loader2, DownloadCloud, BrainCircuit, Search, Table, Settings } from 'lucide-react';
import type { LogMessage, PotentialMap, ScanConfig } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { scanForMapsByAxes, readDataFromAddress } from '@/lib/ecu';
import {
  Table as ResultTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HexViewer } from '@/components/hex-viewer';


const SparkLinePreview = ({ data }: { data: number[][] | undefined }) => {
    if (!data || data.length === 0 || data[0].length === 0) return null;
    
    const height = 30;
    const width = 100;
    const allValues = data.flat().filter(v => v !== null) as number[];
    if (allValues.length === 0) return null;
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;

    if (range === 0) { // Handle flat data
        const y = height / 2;
        return (
             <svg viewBox={`0 0 ${width} ${height}`} className="w-24 h-auto">
                <line x1="0" y1={y} x2={width} y2={y} stroke="hsl(var(--primary))" strokeWidth="2" />
            </svg>
        )
    }

    const points = data[0].map((val, i) => {
        const x = (i / (data[0].length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-24 h-auto">
            <polyline
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                points={points}
            />
        </svg>
    )
}

interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: LogMessage['type']) => void;
    potentialMaps: PotentialMap[];
    setPotentialMaps: React.Dispatch<React.SetStateAction<PotentialMap[]>>;
}

export default function MapScanner({ binFile, onLoadMap, addLog, potentialMaps, setPotentialMaps }: MapScannerProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('');
    const [scanConfig, setScanConfig] = useState<ScanConfig>({
        minSize: 8,
        maxSize: 32,
        dataType: '16-bit LE',
    });
    
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

        if (isNaN(addr) || isNaN(rows) || isNaN(cols)) {
            toast({ title: "Valores Inválidos", description: "Verifique o endereço, as linhas e as colunas.", variant: "destructive" });
            return;
        }

        const dataSize = definition.dataType.includes('16') ? 2 : 1;
        const isBigEndian = definition.dataType.includes('BE');

        const previewData = [];
        const view = new DataView(binFile.buffer);
        const rowStrideVal = definition.rowStride ? parseInt(definition.rowStride, 10) : cols * dataSize;
        
        for (let r = 0; r < Math.min(rows, 10); r++) { // Preview up to 10 rows
            const rowData = readDataFromAddress(view, addr + (r * rowStrideVal), cols, dataSize, !isBigEndian);
            if (rowData) {
                previewData.push(rowData);
            }
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
    
    const handleScan = useCallback(async () => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN não carregado", variant: "destructive" });
            return;
        }

        setIsScanning(true);
        setPotentialMaps([]);
        setScanProgress(0);
        addLog("A iniciar análise orientada por eixos...", 'info');
        
        const dataSize = scanConfig.dataType.includes('16') ? 2 : 1;
        const isBigEndian = scanConfig.dataType.includes('BE');

        try {
            await scanForMapsByAxes(
                binFile.buffer,
                { ...scanConfig, dataSize, isBigEndian },
                (progress, status, newMap) => {
                    setScanProgress(progress);
                    setScanStatus(status);
                    if (newMap) {
                         setPotentialMaps(prev => [...prev, newMap].sort((a,b) => a.address - b.address));
                    }
                }
            );
            toast({ title: "Análise Concluída", description: "O motor de análise terminou a pesquisa." });
        } catch (error) {
            const msg = `Erro durante a análise: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ title: "Erro na Análise", description: msg, variant: "destructive" });
        } finally {
            setIsScanning(false);
            setScanStatus('Análise concluída.');
        }

    }, [binFile, scanConfig, addLog, toast, setPotentialMaps]);

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
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings /> Definição Manual</CardTitle>
                        <CardDescription>
                            Defina um mapa manualmente pelo seu endereço e dimensões se já os conhecer.
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
                                <Label htmlFor="def-stride">Passo da Linha</Label>
                                <Input id="def-stride" type="number" placeholder="Auto" value={definition.rowStride} onChange={e => setDefinition(d => ({...d, rowStride: e.target.value}))} />
                            </div>
                        </div>
                        <Button onClick={handleCreateMap} className="w-full"><DownloadCloud className="mr-2" /> Carregar Mapa Manual</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BrainCircuit /> Motor de Análise</CardTitle>
                        <CardDescription>
                            Configure os parâmetros para a análise orientada por eixos. O motor irá primeiro encontrar eixos e depois procurar mapas.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1.5">
                                    <Label htmlFor="axis-min-size">Comp. Mín. Eixo</Label>
                                    <Input id="axis-min-size" type="number" value={scanConfig.minSize} onChange={e => setScanConfig(c => ({...c, minSize: parseInt(e.target.value) || 0}))} disabled={isScanning} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="axis-max-size">Comp. Máx. Eixo</Label>
                                    <Input id="axis-max-size" type="number" value={scanConfig.maxSize} onChange={e => setScanConfig(c => ({...c, maxSize: parseInt(e.target.value) || 0}))} disabled={isScanning} />
                                </div>
                             </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="map-datatype">Tipo de Dados (Eixos e Mapas)</Label>
                                <Select value={scanConfig.dataType} onValueChange={v => setScanConfig(c => ({...c, dataType: v as ScanConfig['dataType']}))} disabled={isScanning}>
                                    <SelectTrigger id="map-datatype">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8-bit">8-bit</SelectItem>
                                        <SelectItem value="16-bit LE">16-bit (Little Endian)</SelectItem>
                                        <SelectItem value="16-bit BE">16-bit (Big Endian)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                         </div>
                         <Separator />
                         <div className="space-y-4">
                            <Button onClick={handleScan} disabled={isScanning} className="w-full">
                                {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />}
                                {isScanning ? 'A Analisar...' : 'Iniciar Análise Orientada por Eixos'}
                            </Button>
                            {isScanning && (
                                <div className="space-y-2">
                                    <Progress value={scanProgress} />
                                    <p className="text-xs text-muted-foreground text-center">{scanStatus} ({scanProgress.toFixed(0)}%)</p>
                                </div>
                            )}
                         </div>
                    </CardContent>
                </Card>
                
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Table /> Resultados da Análise</CardTitle>
                        <CardDescription>Mapas potenciais encontrados. Clique em "Carregar" para os analisar.</CardDescription>
                    </CardHeader>
                     <CardContent className="max-h-64">
                        <ScrollArea className="h-full">
                            <ResultTable>
                                <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                        <TableHead>Conf.</TableHead>
                                        <TableHead>Endereço</TableHead>
                                        <TableHead>Dims.</TableHead>
                                        <TableHead>Eixos (X, Y)</TableHead>
                                        <TableHead>Pré-visualização</TableHead>
                                        <TableHead className="text-right">Ação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {potentialMaps.length > 0 ? (
                                        potentialMaps.map(map => (
                                            <TableRow key={map.address}>
                                                <TableCell className="font-semibold">{(map.confidence * 100).toFixed(0)}%</TableCell>
                                                <TableCell className="font-mono text-xs">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                                <TableCell>{map.cols}x{map.rows}</TableCell>
                                                <TableCell className="text-xs font-mono">
                                                   {map.xAxisAddress && <div>X ({map.xAxisType}): 0x{map.xAxisAddress.toString(16).toUpperCase()}</div>}
                                                   {map.yAxisAddress && <div>Y ({map.yAxisType}): 0x{map.yAxisAddress.toString(16).toUpperCase()}</div>}
                                                </TableCell>
                                                <TableCell>
                                                    <SparkLinePreview data={map.previewData} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" onClick={() => onLoadMap(map)}>
                                                        <DownloadCloud className="mr-2 h-4 w-4" /> Carregar
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                {isScanning ? "Aguardando resultados..." : "Nenhum resultado. Inicie uma análise."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </ResultTable>
                        </ScrollArea>
                    </CardContent>
                </Card>
             </div>
             
             <Card className="flex-1 min-h-[300px]">
                <CardHeader>
                    <CardTitle>Visualizador Hexadecimal do Ficheiro BIN</CardTitle>
                    <CardDescription>Percorra o ficheiro binário. O endereço e o valor sob o cursor são exibidos.</CardDescription>
                </CardHeader>
                 <CardContent className="h-[calc(100%-4rem)]">
                    <HexViewer fileBuffer={binFile ? binFile.buffer : null} />
                 </CardContent>
             </Card>
        </div>
    );
}
