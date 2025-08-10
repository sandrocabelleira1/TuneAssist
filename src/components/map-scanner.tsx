

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, DownloadCloud, Microscope } from 'lucide-react';
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
    const [rows, setRows] = useState('32');
    const [cols, setCols] = useState('19');
    const [dataType, setDataType] = useState<'uint8' | 'uint16le' | 'uint16be'>('uint8');

    const handleScan = useCallback(async () => {
        if (!binFile) {
            addLog("Ficheiro BIN não carregado. Não é possível iniciar o scan.", 'error');
            return;
        }

        const numRows = parseInt(rows, 10);
        const numCols = parseInt(cols, 10);

        if (isNaN(numRows) || isNaN(numCols) || numRows <= 0 || numCols <= 0) {
            addLog("Dimensões de linhas e colunas inválidas.", 'error');
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setPotentialMaps([]);
        addLog(`A iniciar o scan com template ${numRows}x${numCols} (${dataType})...`, 'info');
        
        const updateProgress = (progress: number) => {
            setScanProgress(progress);
        };

        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            const results = await scanForMapsWithTemplate(binFile.buffer, {
                rows: numRows,
                cols: numCols,
                dataType: dataType,
                onProgress: updateProgress,
            });
            setPotentialMaps(results);
            addLog(`Scan concluído. Encontrados ${results.length} mapas potenciais com o template.`, 'success');
        } catch (error) {
            const msg = `Erro durante o scan: ${(error as Error).message}`;
            addLog(msg, 'error');
        } finally {
            setIsScanning(false);
            setScanProgress(0);
        }
    }, [binFile, addLog, setPotentialMaps, rows, cols, dataType]);

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
                    <CardTitle className="flex items-center gap-2"><Microscope /> Análise com Template</CardTitle>
                    <CardDescription>
                       Defina as dimensões da grelha (template) que pretende encontrar. O motor irá varrer o ficheiro BIN à procura de todos os blocos de dados que correspondam a este template e que se pareçam com mapas de motor funcionais.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="rows">Linhas (ex: RPM)</Label>
                            <Input id="rows" type="number" value={rows} onChange={(e) => setRows(e.target.value)} placeholder="32" />
                        </div>
                         <div className="space-y-1.5">
                            <Label htmlFor="cols">Colunas (ex: Carga)</Label>
                            <Input id="cols" type="number" value={cols} onChange={(e) => setCols(e.target.value)} placeholder="19" />
                        </div>
                        <div className="space-y-1.5">
                             <Label htmlFor="dataType">Tipo de Dados</Label>
                            <Select value={dataType} onValueChange={(v: any) => setDataType(v)}>
                                <SelectTrigger id="dataType">
                                    <SelectValue placeholder="Selecione o tipo de dados" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="uint8">8-bit (Uint8)</SelectItem>
                                    <SelectItem value="uint16le">16-bit Little Endian</SelectItem>
                                    <SelectItem value="uint16be">16-bit Big Endian</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isScanning ? (
                            <div className="flex items-center gap-4 md:col-span-1">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium">A analisar...</p>
                                </div>
                            </div>

                        ) : (
                            <Button onClick={handleScan} disabled={isScanning} className="w-full">
                                <Search className="mr-2 h-4 w-4" />
                                Iniciar Análise
                            </Button>
                        )}
                    </div>
                     {isScanning && (
                        <div className="mt-4">
                            <Progress value={scanProgress} className="h-2" />
                            <p className="text-xs text-muted-foreground text-center mt-1">{scanProgress.toFixed(0)}%</p>
                        </div>
                     )}
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
                                <TableHead>Tipo Dados</TableHead>
                                <TableHead>Sugestão IA</TableHead>
                                <TableHead>Confiança</TableHead>
                                <TableHead>Pré-visualização</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {potentialMaps.length > 0 ? (
                                potentialMaps.map((map) => (
                                    <TableRow key={`${map.address}`}>
                                        <TableCell className="font-mono">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                        <TableCell>{map.rows}x{map.cols}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{map.dataType}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{map.suggestion}</span>
                                                <span className="text-muted-foreground text-xs">({map.reason})</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={map.confidence * 100} className="h-2 w-20" />
                                                <span>{(map.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </TableCell>
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
                                        {isScanning ? "A procurar..." : "Defina um template e inicie a análise."}
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
