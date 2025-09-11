

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DownloadCloud, Settings, Play, Search, FolderDown, BarChart3, Table2, ListTree, X } from 'lucide-react';
import type { PotentialMap, ScanConfig, ProcessedMap, PlotOrientation } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { findPotentialMaps, readAndCalculateMapFromBinManual } from '@/lib/ecu';
import { XDFinition } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


const SurfacePlot3D = React.lazy(() => import('@/components/surface-plot'));
const LinePlot2D = React.lazy(() => import('@/components/line-plot'));


interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
}

export default function MapScanner({ binFile, onLoadMap, addLog }: MapScannerProps) {
    const [scanConfig, setScanConfig] = useState<ScanConfig>({
        minSize: 8,
        maxSize: 32,
        dataType: '16-bit LE',
    });
    
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('');
    const [potentialMaps, setPotentialMaps] = useState<PotentialMap[]>([]);
    const [selectedPotentialMap, setSelectedPotentialMap] = useState<PotentialMap | null>(null);
    const [discoveredMap, setDiscoveredMap] = useState<(ProcessedMap & { definition: XDFinition }) | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // State for the 2D plot
    const [selectedLine, setSelectedLine] = useState<number | null>(0);
    const [plotOrientation, setPlotOrientation] = useState<PlotOrientation>('y-vs-x');


    const { toast } = useToast();

    const handleProgressUpdate = useCallback((progress: number, status: string) => {
        setScanProgress(progress);
        setScanStatus(status);
    }, []);

    const handleStartScan = async () => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN em falta", description: "Por favor, carregue um ficheiro .BIN primeiro.", variant: "destructive" });
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setPotentialMaps([]);
        setSelectedPotentialMap(null);
        setDiscoveredMap(null);
        addLog(`A iniciar scan automático com tipo de dados ${scanConfig.dataType}...`, 'info');

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        
        try {
            const internalConfig = {
                ...scanConfig,
                dataSize: scanConfig.dataType.includes('16') ? 2 : 1,
                isBigEndian: scanConfig.dataType.includes('BE'),
            }
            const maps = await findPotentialMaps(binFile.buffer, internalConfig, handleProgressUpdate, signal);
            
            const sortedMaps = maps.sort((a,b) => b.confidence - a.confidence);
            setPotentialMaps(sortedMaps);

            addLog(`Scan concluído. Encontrados ${maps.length} mapas potenciais.`, 'success');
            toast({ title: "Scan Concluído", description: `Encontrados ${maps.length} mapas potenciais.` });

        } catch (error: any) {
             if (error.message === 'AbortError') {
                addLog("Scan cancelado pelo utilizador.", 'info');
                toast({ title: "Scan Cancelado" });
            } else {
                addLog(`Erro durante o scan: ${error.message}`, 'error');
                toast({ title: "Erro no Scan", description: error.message, variant: "destructive" });
            }
        } finally {
            setIsScanning(false);
            abortControllerRef.current = null;
        }
    };
    
    const handleStopScan = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleSelectPotentialMap = async (map: PotentialMap) => {
        if (!binFile) return;
        setSelectedPotentialMap(map);
        addLog(`A visualizar mapa potencial em 0x${map.address.toString(16).toUpperCase()}`, 'info');

         try {
            const tempDef: XDFinition = {
                uniqueId: `scanner_${map.address}`,
                name: map.name ?? `Mapa Descoberto @ 0x${map.address.toString(16).toUpperCase()}`,
                address: map.address,
                rows: map.rows,
                cols: map.cols,
                dataSize: map.dataSize,
                isBigEndian: map.isBigEndian,
                isRowMajor: true,
                equation: 'x',
                decimalpl: 2,
                xAxisDef: {
                    label: 'Eixo X (RPM)',
                    count: map.cols,
                    requiresSort: false,
                    address: map.xAxisAddress,
                    dataSize: map.dataSize,
                    isBigEndian: map.isBigEndian
                },
                yAxisDef: {
                    label: 'Eixo Y (Carga)',
                    count: map.rows,
                    requiresSort: false,
                    address: map.yAxisAddress,
                    dataSize: map.dataSize,
                    isBigEndian: map.isBigEndian
                }
            };

            const result = readAndCalculateMapFromBinManual(binFile.buffer, tempDef, {
                x: { equation: 'x' },
                y: { equation: 'x' },
                z: { equation: 'x' },
                isBigEndian: map.isBigEndian,
                sortX: true, // Always sort scanned axes for consistency
                sortY: true,
            });

            setDiscoveredMap({
                ...result,
                definition: tempDef
            });
            setSelectedLine(0);
            setPlotOrientation('y-vs-x');

        } catch (error: any) {
            addLog(`Erro ao visualizar mapa: ${error.message}`, 'error');
            toast({ title: "Erro na Visualização", description: error.message, variant: "destructive" });
            setDiscoveredMap(null);
        }
    };
    
    const handlePromoteToMain = () => {
        if (!selectedPotentialMap) return;
        onLoadMap(selectedPotentialMap);
        addLog(`Mapa "${selectedPotentialMap.name || `0x${selectedPotentialMap.address.toString(16)}`}" promovido para o painel principal.`, 'success');
    };

    const togglePlotOrientation = () => {
        const newOrientation = plotOrientation === 'y-vs-x' ? 'x-vs-y' : 'y-vs-x';
        setPlotOrientation(newOrientation);
        setSelectedLine(0);
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
        <div className="flex h-full flex-col lg:flex-row gap-4">
            <div className="lg:w-1/3 flex flex-col gap-4">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings /> Configuração do Scan Automático</CardTitle>
                        <CardDescription>
                          Defina os parâmetros para a procura automática de mapas no ficheiro .bin.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                               <Label htmlFor="scan-min">Lin/Col Mín</Label>
                               <Input id="scan-min" type="number" value={scanConfig.minSize || ''} onChange={e => setScanConfig(c => ({...c, minSize: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-2">
                               <Label htmlFor="scan-max">Lin/Col Máx</Label>
                               <Input id="scan-max" type="number" value={scanConfig.maxSize || ''} onChange={e => setScanConfig(c => ({...c, maxSize: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="scan-type">Tipo Dados</Label>
                                <Select value={scanConfig.dataType} onValueChange={v => setScanConfig(d => ({...d, dataType: v as any}))}>
                                    <SelectTrigger id="scan-type"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8-bit">8-bit</SelectItem>
                                        <SelectItem value="16-bit LE">16-bit LE</SelectItem>
                                        <SelectItem value="16-bit BE">16-bit BE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {isScanning ? (
                            <div className="space-y-2">
                                <Progress value={scanProgress} />
                                <p className="text-xs text-muted-foreground animate-pulse">{scanStatus}</p>
                                <Button onClick={handleStopScan} variant="destructive" className="w-full">
                                    <X className="mr-2 h-4 w-4"/> Parar Análise
                                </Button>
                            </div>
                        ) : (
                             <Button onClick={handleStartScan} className="w-full">
                                <Search className="mr-2" /> Iniciar Scan Automático
                            </Button>
                        )}
                    </CardContent>
                </Card>
                <Card className="flex-1 min-h-[200px] lg:min-h-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ListTree /> Mapas Encontrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                         {potentialMaps.length > 0 ? (
                            <ScrollArea className="h-full max-h-96">
                                <div className="space-y-2">
                                {potentialMaps.map((map, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleSelectPotentialMap(map)}
                                        className={cn(
                                            "border p-3 rounded-lg cursor-pointer hover:bg-accent",
                                            selectedPotentialMap?.address === map.address && "bg-accent border-primary"
                                        )}
                                    >
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold text-sm">
                                                0x{map.address.toString(16).toUpperCase()} <span className="font-normal text-muted-foreground">({map.rows}x{map.cols})</span>
                                            </p>
                                            <Badge variant={map.confidence > 0.8 ? "default" : "secondary"}>
                                                {(map.confidence * 100).toFixed(0)}%
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{map.suggestion}</p>
                                    </div>
                                ))}
                                </div>
                            </ScrollArea>
                        ) : (
                             <div className="text-center text-muted-foreground text-sm py-8">
                                {isScanning ? "A procurar..." : "Nenhum mapa encontrado. Inicie uma análise."}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
             
            <div className="lg:w-2/3 flex-1 min-h-0">
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Visualização do Mapa Descoberto</CardTitle>
                                <CardDescription>
                                    {selectedPotentialMap ? `Visualizando mapa ${selectedPotentialMap.rows}x${selectedPotentialMap.cols} de 0x${selectedPotentialMap.address.toString(16).toUpperCase()}` : "Selecione um mapa da lista à esquerda."}
                                </CardDescription>
                            </div>
                            {selectedPotentialMap && (
                                <Button onClick={handlePromoteToMain} size="sm">
                                    <FolderDown className="mr-2" /> Carregar no Painel
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0">
                        {discoveredMap ? (
                            <Tabs defaultValue="view-3d" className="h-full flex flex-col">
                                 <TabsList className="mb-2 shrink-0">
                                    <TabsTrigger value="view-3d"><BarChart3 className="mr-2" /> Gráfico 3D</TabsTrigger>
                                    <TabsTrigger value="view-2d"><Table2 className="mr-2" /> Gráfico 2D</TabsTrigger>
                                 </TabsList>
                                 <TabsContent value="view-3d" className="flex-1 min-h-0">
                                     <React.Suspense fallback={<div className="flex items-center justify-center h-full">A carregar gráfico...</div>}>
                                         <SurfacePlot3D
                                            mapData={discoveredMap.calculatedMap}
                                            xAxis={discoveredMap.axes.x.calculated}
                                            yAxis={discoveredMap.axes.y.calculated}
                                            xAxisLabel={discoveredMap.axes.x.label || 'Eixo X'}
                                            yAxisLabel={discoveredMap.axes.y.label || 'Eixo Y'}
                                            zAxisLabel={discoveredMap.definition.name || 'Mapa'}
                                        />
                                    </React.Suspense>
                                 </TabsContent>
                                 <TabsContent value="view-2d" className="flex-1 min-h-0">
                                     <React.Suspense fallback={<div className="flex items-center justify-center h-full">A carregar gráfico...</div>}>
                                        <LinePlot2D
                                            mapData={discoveredMap.calculatedMap}
                                            xAxis={discoveredMap.axes.x}
                                            yAxis={discoveredMap.axes.y}
                                            mapName={discoveredMap.definition.name}
                                            selectedLineIndex={selectedLine}
                                            onLineSelect={setSelectedLine}
                                            onPointChange={() => {}} // Read-only in scanner
                                            orientation={plotOrientation}
                                            togglePlotOrientation={togglePlotOrientation}
                                        />
                                    </React.Suspense>
                                 </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-center">
                                <div>
                                    <p className="font-semibold">Nenhum mapa para exibir.</p>
                                    <p className="text-sm">Configure e clique em "Iniciar Scan" ou selecione um mapa encontrado.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

