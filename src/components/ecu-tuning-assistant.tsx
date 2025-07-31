
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
import type { XDFDefinition, MapData, LogMessage, ProcessedMap, ManualAxisConfig, AxisData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/header';
import LinePlot2D from '@/components/line-plot';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getHeatmapColor, getTextColorForBackground } from '@/lib/colors';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <p>A carregar o gráfico 3D...</p>
        </div>
    )
});

function DataTable({ mapData, axes, selectedMapDefinition }: {
    mapData: MapData | null;
    axes: { x: AxisData, y: AxisData } | null;
    selectedMapDefinition: XDFDefinition | undefined;
}) {
    if (!axes || !selectedMapDefinition) {
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
                            {mapData ? mapData[yi]?.map((cell, xi) => {
                                const bgColor = getHeatmapColor(cell, minVal, maxVal);
                                const textColor = getTextColorForBackground(bgColor);
                                return (
                                    <td key={xi} className="p-0 border border-border text-center h-10" style={{ backgroundColor: bgColor, color: textColor }}>
                                         <div className="w-full h-full flex items-center justify-center p-1">
                                            {cell !== null && cell !== undefined ? cell.toFixed(zAxisDecimalPlaces) : '-'}
                                        </div>
                                    </td>
                                );
                            }) : (
                                Array.from({ length: axes.x.calculated.length }).map((_, xi) => (
                                    <td key={xi} className="p-0 border border-border text-center h-10 bg-muted/50">
                                        <div className="w-full h-full flex items-center justify-center p-1">-</div>
                                    </td>
                                ))
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}


const initialManualConfig: ManualAxisConfig = {
    x: { address: '', count: '', equation: 'x', dataSize: '16', isBigEndian: 'false', label: 'Carga' },
    y: { address: '', count: '', equation: 'x', dataSize: '16', isBigEndian: 'false', label: 'RPM' },
};

export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; content: string, definitions: XDFDefinition[], allTables: Map<string, Element> } | null>(null);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [processedMap, setProcessedMap] = useState<ProcessedMap | null>(null);
    
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
                    const { definitions, allTables } = parseXDF(buffer);
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
            addLog("Selecione os ficheiros BIN e XDF e um mapa para processar.", 'error');
            return;
        }

        const def = xdfFile.definitions.find(d => d.name === selectedMapName);
        if (!def) {
            addLog(`Definição de mapa "${selectedMapName}" não encontrada.`, 'error');
            return;
        }
        
        setIsProcessing(true);
        setProcessedMap(null); // Clear previous map
        
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        try {
            addLog(`[INÍCIO] A processar o mapa: ${def.name}`, 'info');
            await delay(200);

            // Step 1: Axes
            let xAxisData, yAxisData;
            if (isManual) {
                addLog("A usar configuração manual para os eixos...", 'info');
                await delay(200);
                // For simplicity, manual recalculation will be instant
                 const result = readAndCalculateMapFromBinManual(binFile.buffer, def, manualConfig, xdfFile.allTables);
                 setProcessedMap(result);
                 addLog(`[SUCESSO] Mapa reprocessado com eixos manuais.`, 'success');
                 setIsProcessing(false);
                 return;
            } else {
                addLog("Passo 1/4: A ler e a calcular eixos do XDF...", 'info');
                await delay(300);
                xAxisData = readAxisFromBin(binFile.buffer, def.xAxisDef);
                yAxisData = readAxisFromBin(binFile.buffer, def.yAxisDef);
                setProcessedMap({ axes: { x: xAxisData, y: yAxisData }, calculatedMap: null, rawMap: null });
                addLog(`Eixo X: ${def.xAxisDef.label} (${xAxisData.calculated.length} valores)`, 'debug');
                addLog(`Eixo Y: ${def.yAxisDef.label} (${yAxisData.calculated.length} valores)`, 'debug');
            }
            
            addLog("Passo 2/4: A ler e a calcular o mapa principal (Z)...", 'info');
            await delay(300);
            const result = readAndCalculateMapFromBin(binFile.buffer, def, xdfFile.allTables);
            
            addLog("Passo 3/4: A ordenar eixos e a remapear os dados...", 'info');
            setProcessedMap(prev => ({ ...prev!, calculatedMap: result.calculatedMap, rawMap: result.rawMap }));
            await delay(300);
            
            addLog("Passo 4/4: A renderizar os dados finais...", 'info');
            setProcessedMap(result);
            setSelectedLine(result.axes.y.calculated.length > 0 ? 0 : null);
            await delay(200);
            
            addLog(`[SUCESSO] Mapa carregado e ordenado: ${def.name}`, 'success');

        } catch (error) {
            const errorMessage = `Erro ao processar o mapa: ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            toast({ title: 'Erro ao Processar Mapa', description: errorMessage, variant: 'destructive' });
            setProcessedMap(null); // Clear map on error
        } finally {
            setIsProcessing(false);
        }
    }, [selectedMapName, binFile, xdfFile, manualConfig, addLog, toast]);

    const handleMapSelect = (name: string) => {
        setSelectedMapName(name);
        setProcessedMap(null); 
    };

    useEffect(() => {
        if (selectedMapName && binFile && xdfFile) {
            processMap(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMapName]);
    
    const handleManualConfigChange = (axis: 'x' | 'y', field: keyof ManualAxisConfig['x'], value: string) => {
        setManualConfig(prev => ({
            ...prev,
            [axis]: {
                ...prev[axis],
                [field]: value
            }
        }));
    };

    const handleManualRecalculate = () => {
        processMap(true);
    };
    
    const handleCellChange = (rowIndex: number, colIndex: number, newValue: number) => {
        addLog(`Alteração de célula [${rowIndex}, ${colIndex}] para ${newValue.toFixed(2)} (Funcionalidade de escrita desativada)`, 'info');
    };
    
    const handleSave = () => {
        toast({ title: 'Funcionalidade Indisponível', description: 'A funcionalidade de salvar foi temporariamente desativada.', variant: 'destructive' });
    }
    
    return (
      <SidebarProvider>
        <div className="flex flex-col h-screen bg-background">
            <Header />
            <div className="flex flex-1 min-h-0">
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
                                <CardTitle className="text-base flex items-center gap-2"><Settings2 size={18} /> Configuração Manual dos Eixos</CardTitle>
                                <CardDescription className="text-xs">Use para substituir a leitura do XDF. Útil para depuração.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 space-y-4">
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-sm">Eixo Y (Linhas)</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder="Endereço (ex: 8AF4)" value={manualConfig.y.address} onChange={e => handleManualConfigChange('y', 'address', e.target.value)} />
                                        <Input placeholder="Nº de Linhas" value={manualConfig.y.count} onChange={e => handleManualConfigChange('y', 'count', e.target.value)} />
                                    </div>
                                    <Input placeholder="Equação (ex: x)" value={manualConfig.y.equation} onChange={e => handleManualConfigChange('y', 'equation', e.target.value)} />
                                    <RadioGroup value={manualConfig.y.dataSize} onValueChange={val => handleManualConfigChange('y', 'dataSize', val as '8' | '16')} className="flex items-center space-x-4">
                                        <Label>Tamanho:</Label>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="8" id="y-8bit" /><Label htmlFor="y-8bit">8-bit</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="16" id="y-16bit" /><Label htmlFor="y-16bit">16-bit</Label></div>
                                    </RadioGroup>
                                </div>
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-sm">Eixo X (Colunas)</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder="Endereço (ex: 8B14)" value={manualConfig.x.address} onChange={e => handleManualConfigChange('x', 'address', e.target.value)} />
                                        <Input placeholder="Nº de Colunas" value={manualConfig.x.count} onChange={e => handleManualConfigChange('x', 'count', e.target.value)} />
                                    </div>
                                    <Input placeholder="Equação (ex: x/69.6)" value={manualConfig.x.equation} onChange={e => handleManualConfigChange('x', 'equation', e.target.value)} />
                                     <RadioGroup value={manualConfig.x.dataSize} onValueChange={val => handleManualConfigChange('x', 'dataSize', val as '8' | '16')} className="flex items-center space-x-4">
                                        <Label>Tamanho:</Label>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="8" id="x-8bit" /><Label htmlFor="x-8bit">8-bit</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="16" id="x-16bit" /><Label htmlFor="x-16bit">16-bit</Label></div>
                                    </RadioGroup>
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
                               <Button variant="default" size="sm" disabled={!processedMap} onClick={handleSave}>
                                   <Save className="mr-2" /> Salvar .BIN Modificado
                               </Button>
                            </CardContent>
                        </Card>

                    </SidebarContent>
                    <SidebarFooter>
                        <div className="p-2">
                             <h3 className="font-semibold text-sm mb-2 px-2">Motor de Cálculo</h3>
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
                            {isProcessing && <Loader2 className="ml-3 h-5 w-5 animate-spin" />}
                         </div>
                    </div>
                    <div className="flex-1 p-4 min-h-0">
                        <Tabs defaultValue="view-table" className="w-full h-full flex flex-col">
                            <TabsList>
                                <TabsTrigger value="view-table"><Table2 className="mr-2"/>Tabela de Dados</TabsTrigger>
                                <TabsTrigger value="view-3d"><BarChart3 className="mr-2"/>Gráfico 3D</TabsTrigger>
                                <TabsTrigger value="view-2d"><BarChart3 className="mr-2"/>Gráfico 2D</TabsTrigger>
                            </TabsList>
                             <div className="flex-1 mt-4 min-h-0">
                                {isProcessing && !processedMap ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <Play className="mr-2 h-8 w-8 animate-pulse" />
                                        <p>A executar o motor de cálculo...</p>
                                    </div>
                                ) : !processedMap ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-center">
                                        <div>
                                            <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
                                            <p className="mt-2 font-semibold">Nenhum dado para exibir.</p>
                                            <p className="text-sm">Carregue os seus ficheiros e selecione um mapa para iniciar.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <TabsContent value="view-table" className="h-full m-0">
                                           <DataTable
                                                mapData={processedMap?.calculatedMap ?? null}
                                                axes={processedMap?.axes ?? null}
                                                selectedMapDefinition={selectedMapDefinition}
                                           />
                                        </TabsContent>
                                        <TabsContent value="view-3d" className="h-full m-0">
                                            {processedMap?.axes && processedMap?.calculatedMap ? (
                                                <SurfacePlot3D 
                                                    mapData={processedMap.calculatedMap}
                                                    xAxis={processedMap.axes.x.calculated}
                                                    yAxis={processedMap.axes.y.calculated}
                                                    xAxisLabel={processedMap.axes.x.label || 'Eixo X'}
                                                    yAxisLabel={processedMap.axes.y.label || 'Eixo Y'}
                                                    zAxisLabel={selectedMapDefinition?.name || 'Mapa Principal'}
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                                    <p>A aguardar dados completos do mapa para o gráfico 3D.</p>
                                                </div>
                                            )}
                                        </TabsContent>
                                        <TabsContent value="view-2d" className="h-full m-0">
                                            <LinePlot2D
                                                mapData={processedMap?.calculatedMap ?? null}
                                                xAxis={processedMap?.axes?.x ?? null}
                                                yAxis={processedMap?.axes?.y ?? null}
                                                xAxisLabel={processedMap?.axes?.x.label}
                                                yAxisLabel={selectedMapDefinition?.name || 'Mapa Principal'}
                                                selectedLineIndex={selectedLine}
                                                onLineSelect={setSelectedLine}
                                                onPointChange={handleCellChange}
                                            />
                                        </TabsContent>
                                    </>
                                )}
                            </div>
                        </Tabs>
                    </div>
                </main>
            </div>
        </div>
      </SidebarProvider>
    );
}

