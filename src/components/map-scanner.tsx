

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DownloadCloud, Settings, Table, Play, Loader, Square, X } from 'lucide-react';
import type { PotentialMap, ScanConfig } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { readDataFromAddress, scanForPotentialMaps } from '@/lib/ecu';
import { HexViewer } from '@/components/hex-viewer';
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

interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
    potentialMaps: PotentialMap[];
    setPotentialMaps: React.Dispatch<React.SetStateAction<PotentialMap[]>>;
}

export default function MapScanner({ binFile, onLoadMap, addLog, potentialMaps, setPotentialMaps }: MapScannerProps) {
    
    const [scanConfig, setScanConfig] = useState<Omit<ScanConfig, 'dataSize' | 'isBigEndian'>>({
        minSize: 8,
        maxSize: 32,
        dataType: '16-bit LE',
    });
    
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('');
    const scanAbortController = useRef<AbortController | null>(null);

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
        setPotentialMaps([]);
        addLog("A iniciar análise de mapas...", "info");
        
        scanAbortController.current = new AbortController();
        const { signal } = scanAbortController.current;

        try {
            const config: ScanConfig = {
                ...scanConfig,
                dataSize: scanConfig.dataType.includes('16') ? 2 : 1,
                isBigEndian: scanConfig.dataType.includes('BE'),
            };

            await scanForPotentialMaps(
                binFile.buffer,
                config,
                (progress, status, newMap) => {
                    setScanProgress(progress);
                    setScanStatus(status);
                    if (newMap) {
                        setPotentialMaps(prev => [...prev, newMap].sort((a,b) => a.address - b.address));
                    }
                },
                signal
            );
            
            addLog("Análise de mapas concluída.", "success");
            toast({ title: "Análise Concluída", description: `Encontrados ${potentialMaps.length} mapas potenciais.` });

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

    }, [binFile, scanConfig, toast, addLog, setPotentialMaps, potentialMaps.length]);
    
    const handleStopScan = () => {
        if(scanAbortController.current) {
            scanAbortController.current.abort();
        }
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
        <div className="flex flex-col h-full gap-4">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings /> Análise Inteligente</CardTitle>
                        <CardDescription>
                          Configure e inicie uma análise para encontrar mapas potenciais automaticamente. O processo é executado em segundo plano e não irá congelar a aplicação.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                               <Label htmlFor="scan-min">Dimensão Mín Eixo</Label>
                               <Input id="scan-min" type="number" value={scanConfig.minSize} onChange={e => setScanConfig(c => ({...c, minSize: parseInt(e.target.value, 10)}))} />
                            </div>
                            <div>
                               <Label htmlFor="scan-max">Dimensão Máx Eixo</Label>
                               <Input id="scan-max" type="number" value={scanConfig.maxSize} onChange={e => setScanConfig(c => ({...c, maxSize: parseInt(e.target.value, 10)}))} />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="scan-type">Tipo de Dados</Label>
                            <Select value={scanConfig.dataType} onValueChange={v => setScanConfig(d => ({...d, dataType: v as any}))}>
                                <SelectTrigger id="scan-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="8-bit">8-bit</SelectItem>
                                    <SelectItem value="16-bit LE">16-bit LE</SelectItem>
                                    <SelectItem value="16-bit BE">16-bit BE</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isScanning ? (
                            <div className="space-y-2">
                                <Progress value={scanProgress} />
                                <div className="text-xs text-muted-foreground">{scanStatus}</div>
                                <Button onClick={handleStopScan} variant="destructive" className="w-full"><Square className="mr-2"/> Parar Análise</Button>
                            </div>
                        ) : (
                             <Button onClick={handleStartScan} className="w-full">
                                <Play className="mr-2" /> Iniciar Análise Inteligente
                            </Button>
                        )}
                    </CardContent>
                </Card>
                
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Table /> Visualizador Hexadecimal</CardTitle>
                        <CardDescription>Use esta ferramenta para encontrar os endereços dos mapas e dos eixos no ficheiro. Os dados da ECU são armazenados em formato hexadecimal.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-8rem)]">
                        <HexViewer fileBuffer={binFile ? binFile.buffer : null} />
                    </CardContent>
                </Card>
             </div>
             
             <Card className="flex-1 min-h-[300px] flex flex-col">
                <CardHeader>
                    <CardTitle>Resultados da Análise</CardTitle>
                    <CardDescription>Mapas potenciais encontrados no ficheiro. Clique em "Carregar" para os analisar.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                    <ScrollArea className="h-full">
                        <ShadcnTable>
                            <TableHeader className="sticky top-0 bg-muted">
                                <TableRow>
                                    <TableHead>Endereço</TableHead>
                                    <TableHead>Dimensões</TableHead>
                                    <TableHead>Tipo Dados</TableHead>
                                    <TableHead>Confiança</TableHead>
                                    <TableHead>Sugestão</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {potentialMaps.length > 0 ? (
                                    potentialMaps.map((map) => (
                                        <TableRow key={`${map.address}-${map.rows}x${map.cols}`}>
                                            <TableCell className="font-mono">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                            <TableCell>{map.rows}x{map.cols}</TableCell>
                                            <TableCell>{map.dataType}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                     <Progress value={map.confidence * 100} className="w-20 h-2"/>
                                                     <span>{(map.confidence * 100).toFixed(0)}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{map.suggestion}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline" onClick={() => onLoadMap(map)}>
                                                    <DownloadCloud className="mr-2 h-4 w-4"/> Carregar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            {isScanning ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader className="h-5 w-5 animate-spin" />
                                                    <span>Aguardando resultados da análise...</span>
                                                </div>
                                            ) : (
                                                "Nenhum mapa encontrado. Inicie uma análise ou ajuste os parâmetros."
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </ShadcnTable>
                    </ScrollArea>
                </CardContent>
             </Card>
        </div>
    );
}
