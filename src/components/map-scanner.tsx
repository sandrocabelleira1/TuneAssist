
'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, Upload, Flame, Fuel } from 'lucide-react';
import type { LogMessage, PotentialMap } from '@/lib/types';
import { scanForPotentialMaps } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

const SuggestionIcon = ({ suggestion }: { suggestion: string }) => {
    if (suggestion.toLowerCase().includes('ignição')) {
        return <TooltipProvider>
            <Tooltip>
                <TooltipTrigger><Flame className="h-5 w-5 text-amber-500" /></TooltipTrigger>
                <TooltipContent><p>Possível Mapa de Ignição</p></TooltipContent>
            </Tooltip>
        </TooltipProvider>
    }
    if (suggestion.toLowerCase().includes('combustível')) {
        return <TooltipProvider>
            <Tooltip>
                <TooltipTrigger><Fuel className="h-5 w-5 text-green-500" /></TooltipTrigger>
                <TooltipContent><p>Possível Mapa de Combustível</p></TooltipContent>
            </Tooltip>
        </TooltipProvider>
    }
    return null;
}

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

    const handleScan = useCallback(async () => {
        if (!binFile) {
            addLog("Ficheiro BIN não carregado. Não é possível iniciar o scan.", 'error');
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setPotentialMaps([]);
        addLog("A iniciar o scan heurístico do ficheiro BIN...", 'info');
        
        const updateProgress = (progress: number) => {
            setScanProgress(progress);
        };

        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            const results = await scanForPotentialMaps(binFile.buffer, {
                onProgress: updateProgress,
            });
            setPotentialMaps(results);
            addLog(`Scan concluído. Encontrados ${results.length} mapas potenciais.`, 'success');
        } catch (error) {
            const msg = `Erro durante o scan: ${(error as Error).message}`;
            addLog(msg, 'error');
        } finally {
            setIsScanning(false);
            setScanProgress(0);
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
                    <CardTitle>Scanner de Mapas Heurístico</CardTitle>
                    <CardDescription>
                        Esta ferramenta experimental analisa o ficheiro .BIN para encontrar estruturas que possam ser mapas não definidos no seu XDF. Os resultados são baseados em padrões e podem não ser precisos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isScanning ? (
                        <div className="flex items-center gap-4">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <div className="flex-1">
                                <p className="text-sm font-medium">A analisar o binário... {scanProgress.toFixed(0)}%</p>
                                <Progress value={scanProgress} className="h-2 mt-1" />
                            </div>
                        </div>

                    ) : (
                        <Button onClick={handleScan} disabled={isScanning}>
                            <Search className="mr-2 h-4 w-4" />
                            Iniciar Scan
                        </Button>
                    )}
                </CardContent>
            </Card>

            <div className="flex-1 border rounded-lg min-h-0">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHead>Endereço</TableHead>
                                <TableHead>Dimensões</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Pré-visualização</TableHead>
                                <TableHead>Confiança</TableHead>
                                <TableHead>Sugestão</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {potentialMaps.length > 0 ? (
                                potentialMaps.map((map) => (
                                    <TableRow key={`${map.address}-${map.rows}x${map.cols}-${map.dataSize}`}>
                                        <TableCell className="font-mono">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                        <TableCell>{map.cols}x{map.rows}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{map.dataType}</TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="cursor-pointer">
                                                            <SparkLinePreview data={map.previewData} />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Pré-visualização da primeira linha de dados</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={map.confidence * 100} className="h-2 w-20" />
                                                <span>{(map.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <SuggestionIcon suggestion={map.suggestion} />
                                                <span className="text-muted-foreground">{map.reason}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" onClick={() => onLoadMap(map)}>
                                                <Upload className="mr-2 h-3 w-3" />
                                                Carregar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        {isScanning ? "A procurar..." : "Nenhum mapa potencial encontrado. Inicie um scan para ver os resultados."}
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
