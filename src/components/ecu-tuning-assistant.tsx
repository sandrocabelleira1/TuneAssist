'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UploadCloud, FileCog, Save, BrainCircuit, Cpu, BarChart3, Binary, Table2, Settings2, Loader2, Play, AlertTriangle } from 'lucide-react';
import { parseXDF, readAndCalculateMapFromBin, writeMapToBin, readAndCalculateMapFromBinManual, readAxisFromBin } from '@/lib/ecu';
import type { XDFDefinition, MapData, LogMessage, ProcessedMap, ManualAxisConfig, AxisData, AxisDimension } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/header';
import LinePlot2D from '@/components/line-plot';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getHeatmapColor, getTextColorForBackground } from '@/lib/colors';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <p>A carregar o gráfico 3D...</p>
        </div>
    )
});

function DataTable({ mapData, addresses, axes, selectedMapDefinition, onCellChange }: {
    mapData: MapData | null;
    addresses: MapData | null;
    axes: { x: AxisData, y: AxisData } | null;
    selectedMapDefinition: XDFDefinition | undefined;
    onCellChange: (y: number, x: number, value: number) => void;
}) {
    if (!axes || !selectedMapDefinition || !mapData) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Carregue os ficheiros e selecione um mapa para ver a tabela de dados.</p>
            </div>
        );
    }
    
    const { minVal, maxVal } = mapData ? mapData.flat().reduce((acc, val) => {
        if (val === null) return acc;
        return {
            minVal: Math.min(acc.minVal, val),
            maxVal: Math.max(acc.maxVal, val),
        };
    }, { minVal: Infinity, maxVal: -Infinity }) : { minVal: 0, maxVal: 1 };

    const formatAxisLabel = (axis: AxisData | undefined, defaultLabel: string) => {
        let label = axis?.label || defaultLabel;
        if (axis?.address) {
            label += ` (0x${axis.address.toString(16).toUpperCase()})`;
        }
        return label;
    };
    
    const yAxisLabel = formatAxisLabel(axes.y, 'Eixo Y');
    const xAxisLabel = formatAxisLabel(axes.x, 'Eixo X');

    const getAxisDecimalPlaces = (axisDef: any) => {
        if (!axisDef) return 2;
        if (axisDef.values) return -1;
        return axisDef.decimalpl ?? 2;
    };
    
    const xAxisDecimalPlaces = getAxisDecimalPlaces(selectedMapDefinition.xAxisDef);
    const yAxisDecimalPlaces = getAxisDecimalPlaces(selectedMapDefinition.yAxisDef);
    const zAxisDecimalPlaces = selectedMapDefinition.decimalpl ?? 2;

    const handleCellBlur = (e: React.FocusEvent<HTMLInputElement>, yi: number, xi: number) => {
        const newValue = parseFloat(e.target.value);
        if (!isNaN(newValue)) {
            onCellChange(yi, xi, newValue);
        }
    };
    
    return (
        <div className="overflow-auto h-full w-full">
            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr>
                        <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-left font-semibold">
                            {yAxisLabel} \ {xAxisLabel}
                        </th>
                        {axes.x.calculated.map((x: any, i: number) => (
                            <th key={i} className="sticky top-0 bg-muted p-2 border border-border font-semibold">
                                {typeof x === 'number' && xAxisDecimalPlaces !== -1 ? x.toFixed(xAxisDecimalPlaces) : x}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {axes.y.calculated.map((y: any, yi: number) => (
                        <tr key={yi}>
                            <td className="sticky left-0 bg-muted p-2 border border-border font-bold text-right">
                                {typeof y === 'number' && yAxisDecimalPlaces !== -1 ? y.toFixed(yAxisDecimalPlaces) : y}
                            </td>
                            {mapData[yi]?.map((cell, xi) => {
                                const bgColor = getHeatmapColor(cell, minVal, maxVal);
                                const textColor = getTextColorForBackground(bgColor);
                                const address = addresses?.[yi]?.[xi];
                                return (
                                    <td key={xi} className="p-0 border border-border text-center h-10" style={{ backgroundColor: bgColor, color: textColor }}>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger className="w-full h-full flex items-center justify-center p-0">
                                                    <input
                                                        type="text"
                                                        defaultValue={cell !== null && cell !== undefined ? cell.toFixed(zAxisDecimalPlaces) : '-'}
                                                        onBlur={(e) => handleCellBlur(e, yi, xi)}
                                                        className="w-full h-full text-center bg-transparent border-none p-1 focus:outline-none focus:ring-2 focus:ring-ring"
                                                        style={{ color: 'inherit' }}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {address !== null && address !== undefined ? `Endereço: 0x${address.toString(16).toUpperCase()}` : 'Endereço indisponível'}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}


const initialManualConfig: ManualAxisConfig = {
    x: { equation: '', stride: undefined },
    y: { equation: '', stride: undefined },
    z: { equation: '', stride: undefined },
    isBigEndian: true,
    sortX: false,
    sortY: false,
};

export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; content: string, definitions: XDFDefinition[], allTables: Map<string, Element> } | null>(null);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [processedMap, setProcessedMap] = useState<ProcessedMap | null>(null);
    const [isModified, setIsModified] = useState(false);
    
    const [selectedLine, setSelectedLine] = useState<number | null>(null);

    const [manualConfig, setManualConfig] = useState<ManualAxisConfig>(initialManualConfig);
    const [isProcessing, setIsProcessing] = useState(false);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        const id = `${Date.now()}-${Math.random()}`;
        setLogs(prev => [{ id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), message, type }, ...prev]);
    }, []);

    const selectedMapDefinition = xdfFile?.definitions.find(def => def.name === selectedMapName);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        addLog(`A ler o ficheiro ${file.name}...`);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const buffer = event.target?.result;
            if (!buffer) {
                const errorMessage = `Erro ao ler o ficheiro ${file.name}`;
                addLog(errorMessage, 'error');
                toast({ title: 'Erro de Leitura', description: errorMessage, variant: 'destructive' });
                return;
            }

            if (type === 'bin' && buffer instanceof ArrayBuffer) {
                setBinFile({ name: file.name, buffer });
                const successMessage = `Ficheiro BIN carregado: ${file.name}`;
                addLog(successMessage, 'success');
                toast({ title: 'Ficheiro Carregado', description: successMessage });
            } else if (type === 'xdf' && typeof buffer === 'string') {
                 try {
                    addLog('A processar o ficheiro XDF com leitura Big-Endian por defeito...');
                    const { definitions, allTables } = parseXDF(buffer, true); 
                    if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    setXdfFile({ name: file.name, content: buffer, definitions, allTables });
                    const successMessage = `XDF carregado: ${file.name} com ${definitions.length} mapas.`;
                    addLog(successMessage, 'success');
                    toast({ title: 'Ficheiro Carregado', description: successMessage });
                 } catch (error) {
                    const errorMessage = `Erro ao processar XDF: ${(error as Error).message}`;
                    addLog(errorMessage, 'error');
                    toast({ title: 'Erro de XDF', description: errorMessage, variant: 'destructive' });
                 }
            }
        };
        
        if (type === 'xdf') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
        
        e.target.value = '';
    };

    const processMap = useCallback(async (isManual: boolean = false) => {
        if (!selectedMapName || !binFile || !xdfFile) {
            // This is a normal condition, not an error
            return;
        }

        const def = xdfFile.definitions.find(d => d.name === selectedMapName);
        if (!def) {
            addLog(`Definição de mapa "${selectedMapName}" não encontrada.`, 'error');
            return;
        }
        
        setIsProcessing(true);
        setProcessedMap(null); 
        setIsModified(false);
        addLog(`A processar o mapa: ${def.name}...`, 'info');
        
        try {
            let result: ProcessedMap;
            if (isManual) {
                addLog("A processar com configurações manuais...", 'info');
                result = readAndCalculateMapFromBinManual(binFile.buffer, def, manualConfig);

            } else {
                addLog("A processar com as definições do XDF...", 'info');
                result = readAndCalculateMapFromBin(binFile.buffer, def);
            }
            
            setProcessedMap(result);
            setSelectedLine(result?.axes.y.calculated.length > 0 ? 0 : null);
            addLog(`Mapa "${def.name}" processado com sucesso.`, 'success');

        } catch (error) {
            const errorMessage = `ERRO ao processar o mapa "${def.name}": ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            toast({ title: 'Erro ao Processar Mapa', description: (error as Error).message, variant: 'destructive' });
            setProcessedMap(null);
        } finally {
            setIsProcessing(false);
        }
    }, [selectedMapName, binFile, xdfFile, manualConfig, addLog, toast]);

    const handleMapSelect = (name: string) => {
        setSelectedMapName(name);
        setProcessedMap(null);
        setIsModified(false);
        const def = xdfFile?.definitions.find(d => d.name === name);
        if (def) {
            setManualConfig({
                x: { equation: def.xAxisDef?.equation || 'x', stride: def.xAxisDef.dataSize },
                y: { equation: def.yAxisDef?.equation || 'x', stride: def.yAxisDef.dataSize },
                z: { equation: def.equation || 'x', stride: def.dataSize },
                isBigEndian: def.isBigEndian,
                sortX: def.xAxisDef.requiresSort,
                sortY: def.yAxisDef.requiresSort,
            });
        } else {
             setManualConfig(initialManualConfig);
        }
    };

    useEffect(() => {
        if (selectedMapName && binFile && xdfFile) {
            processMap(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMapName]);
    
    const handleManualConfigChange = (axis: 'x' | 'y' | 'z' | 'sortX' | 'sortY' | 'isBigEndian', value: any, subfield: 'equation' | 'stride' | null = null) => {
        setManualConfig(prev => {
            if (subfield && (axis === 'x' || axis === 'y' || axis === 'z')) {
                 const numValue = (subfield === 'stride' && value === '') ? undefined : value;
                 return { ...prev, [axis]: { ...prev[axis], [subfield]: numValue }};
            }
            return { ...prev, [axis]: value };
        });
    };
    
    const handleManualRecalculate = () => {
        processMap(true);
    };

    const handleCellChange = (rowIndex: number, colIndex: number, newValue: number) => {
        if (!processedMap || !processedMap.calculatedMap) return;

        addLog(`Alteração de célula [${rowIndex}, ${colIndex}] para ${newValue.toFixed(2)}`, 'info');
        const newMap = processedMap.calculatedMap.map(row => [...row]);
        newMap[rowIndex][colIndex] = newValue;
        
        setProcessedMap(prev => prev ? { ...prev, calculatedMap: newMap } : null);
        setIsModified(true);
    };
    
    const handleSave = () => {
        if (!binFile || !processedMap || !selectedMapDefinition) {
            const msg = "Faltam dados para salvar. Carregue os ficheiros e processe um mapa primeiro.";
            addLog(msg, 'error');
            toast({ title: 'Erro ao Salvar', description: msg, variant: 'destructive' });
            return;
        }

        try {
            addLog("A preparar para salvar o ficheiro BIN...", 'info');
            const newBinBuffer = writeMapToBin(binFile.buffer, selectedMapDefinition, processedMap);
            
            const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const originalName = binFile.name.replace(/\.[^/.]+$/, "");
            a.download = `${originalName}_mod.bin`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            const successMsg = `Ficheiro ${a.download} salvo com sucesso.`;
            addLog(successMsg, 'success');
            toast({ title: 'Salvo com Sucesso', description: successMsg });
            setIsModified(false);

        } catch (error) {
            const errorMsg = `Falha ao salvar o ficheiro BIN: ${(error as Error).message}`;
            addLog(errorMsg, 'error');
            toast({ title: 'Erro ao Salvar', description: errorMsg, variant: 'destructive' });
        }
    }
    
    return (
      <SidebarProvider>
        <div className="flex flex-col h-screen bg-background">
            <Header />
            <div className="flex flex-1 min-h-0 w-full">
                <Sidebar side="left" className="border-r">
                    <SidebarHeader>
                        <h2 className="text-lg font-semibold flex items-center gap-2"><Cpu size={20} /> Painel de Controlo</h2>
                    </SidebarHeader>
                    <SidebarContent className="p-2 flex flex-col gap-4">
                        <Card>
                            <CardHeader className="p-4">
                                <CardTitle className="text-base flex items-center gap-2"><UploadCloud size={18} /> Ficheiros</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 flex flex-col gap-3">
                                <Button variant="outline" size="sm" onClick={() => binInputRef.current?.click()}>
                                    <Binary className="mr-2" /> {binFile?.name ? 'Trocar BIN' : 'Carregar .BIN'}
                                </Button>
                                <input ref={binInputRef} type="file" accept=".bin" className="hidden" onChange={(e) => handleFileChange(e, 'bin')} />
                                
                                <Button variant="outline" size="sm" onClick={() => xdfInputRef.current?.click()}>
                                    <FileCog className="mr-2" /> {xdfFile?.name ? 'Trocar XDF' : 'Carregar .XDF'}
                                </Button>
                                <input ref={xdfInputRef} type="file" accept=".xdf" className="hidden" onChange={(e) => handleFileChange(e, 'xdf')} />
                            </CardContent>
                        </Card>
                        
                        <Card>
                             <CardHeader className="p-4">
                                <CardTitle className="text-base flex items-center gap-2"><Table2 size={18} /> Seleção de Mapa</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                 <Select 
                                    onValueChange={handleMapSelect} 
                                    value={selectedMapName}
                                    disabled={!binFile || !xdfFile}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={!binFile || !xdfFile ? "Carregue os ficheiros" : "Selecione um mapa"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {xdfFile?.definitions.sort((a,b) => a.name.localeCompare(b.name)).map(def => (
                                            <SelectItem key={def.uniqueId} value={def.name}>{def.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4">
                                <CardTitle className="text-base flex items-center gap-2"><Settings2 size={18} /> Substituir</CardTitle>
                                <CardDescription className="text-xs">Use para substituir a configuração do XDF. Útil para depuração.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="y-equation" className="font-semibold text-sm">Equação Y</Label>
                                        <Input id="y-equation" placeholder="x" value={manualConfig.y.equation} onChange={e => handleManualConfigChange('y', e.target.value, 'equation')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="y-stride" className="font-semibold text-sm">Passo Y (bytes)</Label>
                                        <Input id="y-stride" type="number" placeholder="-" value={manualConfig.y.stride ?? ''} onChange={e => handleManualConfigChange('y', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="x-equation" className="font-semibold text-sm">Equação X</Label>
                                        <Input id="x-equation" placeholder="x" value={manualConfig.x.equation} onChange={e => handleManualConfigChange('x', e.target.value, 'equation')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="x-stride" className="font-semibold text-sm">Passo X (bytes)</Label>
                                        <Input id="x-stride" type="number" placeholder="-" value={manualConfig.x.stride ?? ''} onChange={e => handleManualConfigChange('x', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="z-equation" className="font-semibold text-sm">Equação Z (Mapa)</Label>
                                        <Input id="z-equation" placeholder="x" value={manualConfig.z.equation} onChange={e => handleManualConfigChange('z', e.target.value, 'equation')} />
                                    </div>
                                     <div className="space-y-2">
                                        <Label htmlFor="z-stride" className="font-semibold text-sm">Passo Z (bytes)</Label>
                                        <Input id="z-stride" type="number" placeholder="-" value={manualConfig.z.stride ?? ''} onChange={e => handleManualConfigChange('z', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                    </div>
                                </div>
                                
                                <div className="flex items-center space-x-4">
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="sort-x"
                                            checked={manualConfig.sortX ?? false}
                                            onCheckedChange={checked => handleManualConfigChange('sortX', checked)}
                                        />
                                        <Label htmlFor="sort-x">Ordenar Eixo X</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="sort-y"
                                            checked={manualConfig.sortY ?? false}
                                            onCheckedChange={checked => handleManualConfigChange('sortY', checked)}
                                        />
                                        <Label htmlFor="sort-y">Ordenar Eixo Y</Label>
                                    </div>
                                </div>
                                 <div className="flex items-center space-x-2">
                                    <Switch
                                        id="big-endian"
                                        checked={manualConfig.isBigEndian ?? false}
                                        onCheckedChange={checked => handleManualConfigChange('isBigEndian', checked)}
                                    />
                                    <Label htmlFor="big-endian">Big Endian</Label>
                                </div>
                                <Button size="sm" onClick={handleManualRecalculate} disabled={!selectedMapName || isProcessing}>
                                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Aplicar e Recalcular
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                             <CardHeader className="p-4">
                                <CardTitle className="text-base flex items-center gap-2"><BrainCircuit size={18} /> Ações</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 flex flex-col gap-3">
                               <Button variant="default" size="sm" disabled={!isModified || !processedMap} onClick={handleSave}>
                                   <Save className="mr-2" /> Salvar .BIN Modificado
                               </Button>
                            </CardContent>
                        </Card>

                    </SidebarContent>
                    <SidebarFooter>
                        <div className="p-2">
                             <h3 className="font-semibold text-sm mb-2 px-2">Log de Processamento</h3>
                             <ScrollArea className="h-48 w-full rounded-md border p-2 font-mono text-xs">
                                {logs.length > 0 ? logs.map(log => (
                                    <div key={log.id} className="flex items-start">
                                      <span className="text-muted-foreground/60 mr-2 shrink-0">{log.timestamp}</span>
                                      <span className={`break-words ${
                                        log.type === 'error' ? 'text-destructive font-semibold' : 
                                        log.type === 'success' ? 'text-green-500 font-semibold' : 
                                        log.type === 'debug' ? 'text-amber-500' :
                                        'text-foreground/80'
                                      }`}>{log.message}</span>
                                    </div>
                                )) : <div className="text-muted-foreground/60 text-center py-4">Aguardando ações...</div>}
                             </ScrollArea>
                        </div>
                    </SidebarFooter>
                </Sidebar>

                <main className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center p-2 border-b">
                         <SidebarTrigger />
                         <div className="flex items-center ml-2">
                            <h1 className="text-lg font-semibold">{selectedMapName || "Nenhum Mapa Selecionado"}</h1>
                             {isModified && <span className="ml-2 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Modificado</span>}
                            {isProcessing && <Loader2 className="ml-3 h-5 w-5 animate-spin" />}
                         </div>
                    </div>
                    <div className="flex-1 p-4 min-h-0">
                        <Tabs defaultValue="view-table" className="w-full h-full flex flex-col">
                            <TabsList className="shrink-0">
                                <TabsTrigger value="view-table"><Table2 className="mr-2"/>Tabela de Dados</TabsTrigger>
                                <TabsTrigger value="view-3d"><BarChart3 className="mr-2"/>Gráfico 3D</TabsTrigger>
                                <TabsTrigger value="view-2d"><BarChart3 className="mr-2"/>Gráfico 2D</TabsTrigger>
                            </TabsList>
                            {isProcessing ? (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                                    <p>A processar o mapa...</p>
                                </div>
                            ) : !processedMap ? (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground text-center">
                                    <div>
                                        <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
                                        <p className="mt-2 font-semibold">Nenhum dado para exibir.</p>
                                        <p className="text-sm">Carregue os seus ficheiros e selecione um mapa para iniciar.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <TabsContent value="view-table" className="flex-1 min-h-0 mt-4">
                                       <DataTable
                                            mapData={processedMap?.calculatedMap ?? null}
                                            addresses={processedMap?.addresses ?? null}
                                            axes={processedMap?.axes ?? null}
                                            selectedMapDefinition={selectedMapDefinition}
                                            onCellChange={handleCellChange}
                                       />
                                    </TabsContent>
                                    <TabsContent value="view-3d" className="flex-1 min-h-0 mt-4 flex flex-col">
                                        {processedMap?.axes && processedMap?.calculatedMap ? (
                                            <SurfacePlot3D 
                                                mapData={processedMap.calculatedMap}
                                                xAxis={processedMap.axes.x.calculated}
                                                yAxis={processedMap.axes.y.calculated}
                                                xAxisLabel={processedMap.axes.x.label || 'Eixo X'}
                                                yAxisLabel={processedMap.axes.y.label || 'Eixo Y'}
                                                zAxisLabel={selectedMapDefinition?.name || 'Mapa Principal'}
                                                className="flex-1"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                <p>A aguardar dados completos do mapa para o gráfico 3D.</p>
                                            </div>
                                        )}
                                    </TabsContent>
                                    <TabsContent value="view-2d" className="flex-1 min-h-0 mt-4 flex flex-col">
                                        <LinePlot2D
                                            mapData={processedMap?.calculatedMap ?? null}
                                            xAxis={processedMap?.axes?.x ?? null}
                                            yAxis={processedMap?.axes?.y ?? null}
                                            xAxisLabel={processedMap?.axes?.x.label}
                                            yAxisLabel={selectedMapDefinition?.name || 'Mapa Principal'}
                                            selectedLineIndex={selectedLine}
                                            onLineSelect={setSelectedLine}
                                            onPointChange={handleCellChange}
                                            className="flex-1"
                                        />
                                    </TabsContent>
                                </>
                            )}
                        </Tabs>
                    </div>
                </main>
            </div>
        </div>
      </SidebarProvider>
    );
}
