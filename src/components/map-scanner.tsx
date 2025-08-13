
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Loader2, DownloadCloud, Wand2, Search, Table, BrainCircuit } from 'lucide-react';
import type { LogMessage, PotentialMap, ScanConfig } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { scanForMaps } from '@/lib/ecu';
import {
  Table as ResultTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"


const SparkLinePreview = ({ data }: { data: number[][] | undefined }) => {
    if (!data || data.length === 0 || data[0].length === 0) return null;
    
    const height = 30;
    const width = 100;
    const allValues = data.flat().filter(v => v !== null) as number[];
    if (allValues.length === 0) return null;
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;

    const points = data[0].map((val, i) => {
        const x = (i / (data[0].length - 1)) * width;
        const y = height - ((val - min) / (range || 1)) * height;
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
        rows: 19,
        cols: 32,
        dataType: '8-bit',
        findAxes: true
    });
    
    const { toast } = useToast();

    const handleScan = useCallback(async () => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN não carregado", variant: "destructive" });
            return;
        }

        setIsScanning(true);
        setPotentialMaps([]);
        setScanProgress(0);
        addLog("A iniciar análise inteligente...", 'info');
        
        const dataSize = scanConfig.dataType.includes('16') ? 2 : 1;
        const isBigEndian = scanConfig.dataType.includes('BE');

        try {
            await scanForMaps(
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
        <div className="flex flex-col lg:flex-row h-full gap-4">
             <Card className="shrink-0 lg:w-1/3">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BrainCircuit /> Motor de Análise</CardTitle>
                    <CardDescription>
                        Configure as dimensões e o tipo de dados para a análise inteligente. O motor irá procurar por padrões e ligações de eixos.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     <div className="space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1.5">
                                <Label htmlFor="map-rows">Linhas (Y)</Label>
                                <Input id="map-rows" type="number" value={scanConfig.rows} onChange={e => setScanConfig(c => ({...c, rows: parseInt(e.target.value) || 0}))} disabled={isScanning} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="map-cols">Colunas (X)</Label>
                                <Input id="map-cols" type="number" value={scanConfig.cols} onChange={e => setScanConfig(c => ({...c, cols: parseInt(e.target.value) || 0}))} disabled={isScanning} />
                            </div>
                         </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="map-datatype">Tipo de Dados</Label>
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
                        <div className="flex items-center space-x-2 pt-2">
                             <Checkbox id="find-axes" checked={scanConfig.findAxes} onCheckedChange={checked => setScanConfig(c => ({...c, findAxes: !!checked}))} disabled={isScanning} />
                             <Label htmlFor="find-axes" className="font-medium">Procurar eixos vinculados (IDA Pro Logic)</Label>
                        </div>
                     </div>
                     <Separator />
                     <div className="space-y-4">
                        <Button onClick={handleScan} disabled={isScanning} className="w-full">
                            {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />}
                            {isScanning ? 'A Analisar...' : 'Iniciar Análise Inteligente'}
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

            <div className="flex-1 min-h-0 flex flex-col gap-4">
                <Card className="flex-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Table /> Resultados da Análise</CardTitle>
                        <CardDescription>Mapas potenciais encontrados, ordenados por confiança. Clique em "Carregar" para os analisar.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-6rem)]">
                        <ScrollArea className="h-full">
                            <ResultTable>
                                <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                        <TableHead>Confiança</TableHead>
                                        <TableHead>Endereço</TableHead>
                                        <TableHead>Sugestão</TableHead>
                                        <TableHead>Eixos</TableHead>
                                        <TableHead>Pré-visualização</TableHead>
                                        <TableHead className="text-right">Ação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {potentialMaps.length > 0 ? (
                                        potentialMaps.map(map => (
                                            <TableRow key={map.address}>
                                                <TableCell className="font-semibold">{(map.confidence * 100).toFixed(0)}%</TableCell>
                                                <TableCell className="font-mono">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                                <TableCell>{map.suggestion}</TableCell>
                                                <TableCell className="text-xs font-mono">
                                                   {map.xAxisAddress && <div>X: 0x{map.xAxisAddress.toString(16).toUpperCase()}</div>}
                                                   {map.yAxisAddress && <div>Y: 0x{map.yAxisAddress.toString(16).toUpperCase()}</div>}
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
                                                {isScanning ? "Aguardando resultados..." : "Nenhum resultado. Inicie uma análise para encontrar mapas."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </ResultTable>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
