
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DownloadCloud, Settings, Play, Loader, Square, X, Table2, Info } from 'lucide-react';
import type { PotentialMap, ScanConfig, FoundAxis } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { findPotentialAxes } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table as ShadcnTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';

interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
}

export default function MapScanner({ binFile, onLoadMap, addLog }: MapScannerProps) {
    
    const [scanConfig, setScanConfig] = useState<Omit<ScanConfig, 'dataSize' | 'isBigEndian'>>({
        minSize: 8,
        maxSize: 32,
        dataType: '16-bit LE',
    });
    
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('');
    const scanAbortController = useRef<AbortController | null>(null);

    const [foundAxes, setFoundAxes] = useState<FoundAxis[]>([]);
    const [selectedX, setSelectedX] = useState<string | null>(null);
    const [selectedY, setSelectedY] = useState<string | null>(null);
    const [mapAddress, setMapAddress] = useState('');
    
    const { toast } = useToast();

    useEffect(() => {
        // Stop scanning if component is unmounted or binFile changes
        return () => {
            if (scanAbortController.current) {
                scanAbortController.current.abort();
                setIsScanning(false);
            }
        };
    }, [binFile]);

    const handleStartScan = useCallback(async () => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN não carregado", variant: "destructive" });
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setFoundAxes([]);
        setSelectedX(null);
        setSelectedY(null);
        setMapAddress('');
        addLog("A iniciar procura por eixos...", "info");
        
        scanAbortController.current = new AbortController();
        const { signal } = scanAbortController.current;

        try {
            const config: ScanConfig = {
                ...scanConfig,
                dataSize: scanConfig.dataType.includes('16') ? 2 : 1,
                isBigEndian: scanConfig.dataType.includes('BE'),
            };
            
            const axes = await findPotentialAxes(
                binFile.buffer,
                config,
                (progress, status) => {
                     setScanProgress(progress);
                     setScanStatus(status);
                },
                signal
            );
            
            setFoundAxes(axes);
            
            addLog(`Análise de eixos concluída. Encontrados ${axes.length} eixos potenciais.`, "success");
            toast({ title: "Análise Concluída", description: `Encontrados ${axes.length} eixos potenciais.` });

        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                addLog("Análise cancelada pelo utilizador.", "info");
                toast({ title: "Análise Cancelada", variant: 'default' });
            } else {
                addLog(`Erro durante a análise: ${(error as Error).message}`, "error");
                toast({ title: "Erro na Análise", description: (error as Error).message, variant: "destructive" });
            }
        } finally {
            setIsScanning(false);
            scanAbortController.current = null;
        }

    }, [binFile, scanConfig, toast, addLog]);
    
    const handleStopScan = () => {
        if(scanAbortController.current) {
            scanAbortController.current.abort();
        }
    };

    const handleLoadManualMap = () => {
        const xAxis = foundAxes.find(a => a.id === selectedX);
        const yAxis = foundAxes.find(a => a.id === selectedY);
        const address = parseInt(mapAddress.startsWith('0x') ? mapAddress : `0x${mapAddress}`, 16);

        if(!xAxis || !yAxis || isNaN(address)) {
            toast({ title: 'Dados Inválidos', description: 'Selecione um eixo X, um eixo Y e insira um endereço de mapa válido.', variant: 'destructive'});
            return;
        }
        
        const config = {
            ...scanConfig,
            dataSize: scanConfig.dataType.includes('16') ? 2 : 1,
            isBigEndian: scanConfig.dataType.includes('BE'),
        };

        const potentialMap: PotentialMap = {
            address: address,
            rows: yAxis.length,
            cols: xAxis.length,
            dataSize: config.dataSize,
            isBigEndian: config.isBigEndian,
            confidence: 1, // Manual load is 100% confidence
            suggestion: `Carregado manualmente com eixos @ 0x${xAxis.address.toString(16)} & 0x${yAxis.address.toString(16)}`,
            dataType: `${config.dataSize * 8}-bit${config.dataSize > 1 ? (config.isBigEndian ? ' BE' : ' LE') : ''}`,
            equation: 'x',
            xAxisAddress: xAxis.address,
            yAxisAddress: yAxis.address,
            xAxisType: xAxis.type,
            yAxisType: yAxis.type,
        };
        onLoadMap(potentialMap);
    };
    

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
        <div className="flex h-full flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Settings /> Análise de Eixos</CardTitle>
                    <CardDescription>
                      Esta ferramenta procura por sequências de dados que pareçam eixos de RPM ou Carga. Depois, pode combiná-los para definir e carregar um mapa manualmente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                       <Label htmlFor="scan-min">Dimensão Mín Eixo</Label>
                       <Input id="scan-min" type="number" value={scanConfig.minSize || ''} onChange={e => setScanConfig(c => ({...c, minSize: parseInt(e.target.value, 10) || 0}))} disabled={isScanning} />
                    </div>
                    <div className="space-y-2">
                       <Label htmlFor="scan-max">Dimensão Máx Eixo</Label>
                       <Input id="scan-max" type="number" value={scanConfig.maxSize || ''} onChange={e => setScanConfig(c => ({...c, maxSize: parseInt(e.target.value, 10) || 0}))} disabled={isScanning}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="scan-type">Tipo de Dados</Label>
                        <Select value={scanConfig.dataType} onValueChange={v => setScanConfig(d => ({...d, dataType: v as any}))} disabled={isScanning}>
                            <SelectTrigger id="scan-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="8-bit">8-bit</SelectItem>
                                <SelectItem value="16-bit LE">16-bit LE</SelectItem>
                                <SelectItem value="16-bit BE">16-bit BE</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="col-span-1 md:col-span-3">
                         {isScanning ? (
                            <div className="space-y-2">
                                <Progress value={scanProgress} />
                                <div className="text-xs text-muted-foreground">{scanStatus}</div>
                                <Button onClick={handleStopScan} variant="destructive" className="w-full"><Square className="mr-2"/> Parar Análise</Button>
                            </div>
                        ) : (
                             <Button onClick={handleStartScan} className="w-full">
                                <Play className="mr-2" /> Procurar Eixos Potenciais
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
             
             <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle>Resultados da Análise de Eixos</CardTitle>
                        <CardDescription>Eixos potenciais encontrados. Selecione um para o eixo X e outro para o eixo Y.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0">
                        <ScrollArea className="h-full">
                            <ShadcnTable>
                                <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                        <TableHead>X</TableHead>
                                        <TableHead>Y</TableHead>
                                        <TableHead>Endereço</TableHead>
                                        <TableHead>Comprimento</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Valores (Início...Fim)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {foundAxes.length > 0 ? (
                                        foundAxes.map((axis) => (
                                            <TableRow key={axis.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedX === axis.id}
                                                        onCheckedChange={(checked) => setSelectedX(checked ? axis.id : null)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                     <Checkbox
                                                        checked={selectedY === axis.id}
                                                        onCheckedChange={(checked) => setSelectedY(checked ? axis.id : null)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono">0x{axis.address.toString(16).toUpperCase()}</TableCell>
                                                <TableCell>{axis.length}</TableCell>
                                                <TableCell>
                                                    <Badge variant={axis.type === 'RPM' ? 'default' : axis.type === 'Carga' ? 'secondary' : 'outline'}>
                                                        {axis.type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground font-mono">
                                                    {axis.data[0]}, {axis.data[1]}... {axis.data[axis.data.length - 1]}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                {isScanning ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Loader className="h-5 w-5 animate-spin" />
                                                        <span>A aguardar resultados...</span>
                                                    </div>
                                                ) : (
                                                    "Nenhum eixo encontrado. Inicie uma análise ou ajuste os parâmetros."
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </ShadcnTable>
                        </ScrollArea>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Carregar Mapa Manualmente</CardTitle>
                        <CardDescription>Após selecionar os eixos, insira o endereço inicial do mapa e carregue-o para análise.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label>Eixo X Selecionado</Label>
                             <Input 
                                readOnly 
                                value={selectedX ? `0x${foundAxes.find(a=>a.id===selectedX)?.address.toString(16).toUpperCase()} (${foundAxes.find(a=>a.id===selectedX)?.length} cols)`: 'Nenhum'}
                                className="font-mono"
                             />
                        </div>
                         <div>
                            <Label>Eixo Y Selecionado</Label>
                             <Input 
                                readOnly 
                                value={selectedY ? `0x${foundAxes.find(a=>a.id===selectedY)?.address.toString(16).toUpperCase()} (${foundAxes.find(a=>a.id===selectedY)?.length} rows)`: 'Nenhum'}
                                className="font-mono"
                             />
                        </div>
                         <div>
                            <Label htmlFor="map-address">Endereço do Mapa (Hex)</Label>
                            <Input 
                                id="map-address"
                                placeholder="0x..." 
                                value={mapAddress}
                                onChange={e => setMapAddress(e.target.value)}
                                className="font-mono"
                            />
                        </div>
                        <Button 
                            className="w-full"
                            onClick={handleLoadManualMap}
                            disabled={!selectedX || !selectedY || !mapAddress}
                        >
                            <DownloadCloud className="mr-2 h-4 w-4"/> Carregar Mapa Definido
                        </Button>
                         <div className="flex items-start gap-2 text-xs text-muted-foreground p-2 border rounded-lg">
                            <Info className="h-4 w-4 shrink-0 mt-0.5" />
                            <p>Use um editor hexadecimal para encontrar visualmente o endereço de início do seu mapa. A ferramenta irá então usar os eixos selecionados para ler o bloco de dados a partir desse endereço.</p>
                         </div>
                    </CardContent>
                </Card>
             </div>
        </div>
    );
}
