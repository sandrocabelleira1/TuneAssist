

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, DownloadCloud, Microscope, Gauge } from 'lucide-react';
import type { LogMessage, PotentialMap } from '@/lib/types';
import { scanForMapsWithTemplate } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

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
    const [templateConfig, setTemplateConfig] = useState({
        rows: 32,
        cols: 19,
        dataType: '8-bit',
    });

    const handleScan = useCallback(async () => {
        if (!binFile) {
            addLog("Ficheiro BIN não carregado. Não é possível iniciar o scan.", 'error');
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setScanStatus('A iniciar...');
        setPotentialMaps([]);
        addLog(`A iniciar análise com template: ${templateConfig.rows}x${templateConfig.cols} ${templateConfig.dataType}`, 'info');
        
        try {
            const config = {
                rows: templateConfig.rows,
                cols: templateConfig.cols,
                dataSize: templateConfig.dataType.includes('16') ? 2 : 1,
                isBigEndian: templateConfig.dataType.includes('BE'),
            };

            const results = await scanForMapsWithTemplate(binFile.buffer, config, {
                onProgress: (progress, status) => {
                    setScanProgress(progress);
                    setScanStatus(status);
                },
            });
            
            setPotentialMaps(results);
            addLog(`Análise concluída. Encontrados ${results.length} mapas potenciais.`, 'success');
        } catch (error) {
            const msg = `Erro durante a análise: ${(error as Error).message}`;
            addLog(msg, 'error');
        } finally {
            setIsScanning(false);
            setScanProgress(100);
            setScanStatus("Concluído");
        }
    }, [binFile, addLog, setPotentialMaps, templateConfig]);

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
                    <CardTitle className="flex items-center gap-2"><Microscope /> Análise por Template Deslizante</CardTitle>
                    <CardDescription>
                       Defina um "molde" de mapa (ex: 32x19) e o motor irá varrer o ficheiro à procura de blocos de dados que correspondam a esse padrão.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex flex-col sm:flex-row items-end gap-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
                            <div className="space-y-1.5">
                                <Label htmlFor="template-rows">Linhas</Label>
                                <Input id="template-rows" type="number" value={templateConfig.rows} onChange={e => setTemplateConfig(c => ({...c, rows: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="template-cols">Colunas</Label>
                                <Input id="template-cols" type="number" value={templateConfig.cols} onChange={e => setTemplateConfig(c => ({...c, cols: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-1.5 col-span-2 sm:col-span-1">
                                <Label htmlFor="template-datatype">Tipo de Dados</Label>
                                 <Select value={templateConfig.dataType} onValueChange={v => setTemplateConfig(c => ({...c, dataType: v}))}>
                                    <SelectTrigger id="template-datatype">
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

                        {isScanning ? (
                             <div className="w-full sm:w-64 flex flex-col gap-2">
                                <Progress value={scanProgress} className="h-2" />
                                <p className="text-xs text-muted-foreground text-center mt-1">{scanStatus} ({scanProgress.toFixed(0)}%)</p>
                            </div>
                        ) : (
                            <Button onClick={handleScan} disabled={isScanning} className="w-full sm:w-auto">
                                <Search className="mr-2 h-4 w-4" />
                                Iniciar Análise com Template
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
                                <TableHead>Endereço</TableHead>
                                <TableHead>Dimensões</TableHead>
                                <TableHead>Preview</TableHead>
                                <TableHead>Sugestão</TableHead>
                                <TableHead>Confiança</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isScanning && potentialMaps.length === 0 ? (
                                <TableRow>
                                     <TableCell colSpan={6} className="h-24 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            <span>A procurar...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : potentialMaps.length > 0 ? (
                                potentialMaps.map((map) => (
                                    <TableRow key={`${map.address}`}>
                                        <TableCell>
                                             <span className="font-mono text-sm">0x{map.address.toString(16).toUpperCase()}</span>
                                        </TableCell>
                                        <TableCell>
                                             <span className="text-xs text-muted-foreground">{map.rows}x{map.cols} ({map.dataType})</span>
                                        </TableCell>
                                        <TableCell>
                                             <SparkLinePreview data={map.previewData} />
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
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        Defina um template e inicie a análise para encontrar mapas.
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
