

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, DownloadCloud, Microscope, Rss, Gauge } from 'lucide-react';
import type { LogMessage, PotentialMap } from '@/lib/types';
import { scanForPotentialMaps } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const SparkLinePreview = ({ data }: { data: number[][] | undefined }) => {
    if (!data || data.length === 0) return null;

    const chartData = data[0].map((value, index) => ({ name: index, value }));
    const min = Math.min(...chartData.map(d => d.value));
    const max = Math.max(...chartData.map(d => d.value));

    return (
        <div className="w-24 h-8">
            <ResponsiveContainer>
                <LineChart data={chartData}>
                     <YAxis hide domain={[min, max]} />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: LogMessage['type']) => void;
    potentialMaps: PotentialMap[];
    setPotentialMaps: (maps: PotentialMap[]) => void;
}

export default function MapScanner({ binFile, onLoadMap, addLog, potentialMaps, setPotentialMaps }: MapScannerProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('Aguardando...');

    const handleScan = useCallback(async () => {
        if (!binFile) {
            addLog("Ficheiro BIN não carregado. Não é possível iniciar o scan.", 'error');
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setPotentialMaps([]);
        addLog(`A iniciar o scan heurístico do ficheiro BIN...`, 'info');
        setScanStatus("A iniciar...");
        
        // Allow UI to update before blocking
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            const results = await scanForPotentialMaps(binFile.buffer, {
                onProgress: (progress, status) => {
                    setScanProgress(progress);
                    setScanStatus(status);
                },
            });
            setPotentialMaps(results);
            addLog(`Scan concluído. Encontrados ${results.length} mapas potenciais.`, 'success');
        } catch (error) {
            const msg = `Erro durante o scan: ${(error as Error).message}`;
            addLog(msg, 'error');
        } finally {
            setIsScanning(false);
            setScanProgress(0);
            setScanStatus("Concluído");
        }
    }, [binFile, addLog, setPotentialMaps]);

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
            <Card className="shrink-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Microscope /> Scanner Heurístico Inteligente</CardTitle>
                    <CardDescription>
                       O motor irá varrer o ficheiro BIN à procura de eixos (RPM, Carga) e de mapas 2D que correspondam a padrões de funcionamento do motor.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex items-end gap-4">
                        <div className="flex-1" />
                        {isScanning ? (
                             <div className="flex-1 flex flex-col gap-2">
                                <Progress value={scanProgress} className="h-2" />
                                <p className="text-xs text-muted-foreground text-center mt-1">{scanStatus} ({scanProgress.toFixed(0)}%)</p>
                            </div>
                        ) : (
                            <Button onClick={handleScan} disabled={isScanning} className="w-auto">
                                <Search className="mr-2 h-4 w-4" />
                                Iniciar Análise Completa
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

             <Separator />

            <div className="flex-1 border rounded-lg min-h-0">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHead>Mapa</TableHead>
                                <TableHead>Eixo Y (Linhas)</TableHead>
                                <TableHead>Eixo X (Colunas)</TableHead>
                                <TableHead>Sugestão</TableHead>
                                <TableHead>Confiança</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {potentialMaps.length > 0 ? (
                                potentialMaps.map((map) => (
                                    <TableRow key={`${map.address}`}>
                                        <TableCell>
                                            <div className='flex flex-col'>
                                                <span className="font-mono text-sm">0x{map.address.toString(16).toUpperCase()}</span>
                                                <span className="text-xs text-muted-foreground">{map.rows}x{map.cols} ({map.dataType})</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className='flex flex-col'>
                                                <span className="font-mono text-sm">{map.yAxisAddress ? `0x${map.yAxisAddress.toString(16).toUpperCase()}`: 'N/A'}</span>
                                                 <Badge variant={map.yAxisType === 'RPM' ? 'default' : 'secondary'} className="w-fit mt-1">
                                                    <Rss className="mr-1 h-3 w-3" /> {map.yAxisType}
                                                 </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className='flex flex-col'>
                                                <span className="font-mono text-sm">{map.xAxisAddress ? `0x${map.xAxisAddress.toString(16).toUpperCase()}` : 'N/A'}</span>
                                                 <Badge variant={map.xAxisType === 'Carga' ? 'default' : 'secondary'} className="w-fit mt-1">
                                                    <Gauge className="mr-1 h-3 w-3" /> {map.xAxisType}
                                                 </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{map.suggestion}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={map.confidence * 100} className="h-2 w-20" />
                                                <span>{(map.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" onClick={() => onLoadMap(map)}>
                                                <DownloadCloud className="mr-2 h-3 w-3" />
                                                Carregar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        {isScanning ? "A procurar..." : "Inicie a análise para encontrar mapas."}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </div>
    );
}
