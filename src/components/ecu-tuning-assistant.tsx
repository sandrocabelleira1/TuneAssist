
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UploadCloud, FileCog, Save, BrainCircuit, Cpu, BarChart3, Binary, Table2, Pencil, Loader2 } from 'lucide-react';
import { parseXDF, readAndCalculateMapFromBin, writeMapToBin, recalculateRawMapFromCalculated, getCellAddress } from '@/lib/ecu';
import type { XDFDefinition, MapData, AxisDataState, LogMessage } from '@/lib/types';
import { getHeatmapColor, getCorrectionColor } from '@/lib/colors';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/header';
import LinePlot2D from '@/components/line-plot';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <p>A carregar o gráfico 3D...</p>
        </div>
    )
});


function EditableMapCell({ value, onCellChange, address, originalValue, showCorrection, definition }: { value: number | null, onCellChange: (newValue: number) => void, address: number | null, originalValue: number | null, showCorrection: boolean, definition: XDFDefinition | undefined }) {
    const [isEditing, setIsEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState(value !== null ? String(value) : '');

    useEffect(() => {
        setCurrentValue(value !== null ? String(value) : '');
    }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        const newValue = parseFloat(currentValue);
        if (!isNaN(newValue)) {
            onCellChange(newValue);
        } else {
            setCurrentValue(value !== null ? String(value) : '');
        }
    };
    
    const correction = (value !== null && originalValue !== null) ? value - originalValue : 0;
    const backgroundColor = showCorrection ? getCorrectionColor(correction) : getHeatmapColor(value, 0, 0);

    if (isEditing) {
        return (
            <input
                type="text"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                autoFocus
                className="w-full h-full text-center bg-background text-foreground border-primary border-2 outline-none"
            />
        );
    }

    return (
        <div 
            onClick={() => setIsEditing(true)} 
            className="w-full h-full flex items-center justify-center cursor-pointer p-1"
            style={{ backgroundColor }}
            title={address !== null ? `Endereço: 0x${address.toString(16).toUpperCase()}`: ''}
        >
            {value !== null ? value.toFixed(definition?.decimalpl ?? 2) : '-'}
        </div>
    );
}


function DataTable({ mapData, axes, selectedMapDefinition, onCellChange, originalMapData }: {
    mapData: MapData | null;
    axes: { x: AxisDataState, y: AxisDataState } | null;
    selectedMapDefinition: XDFDefinition | undefined;
    onCellChange: (rowIndex: number, colIndex: number, newValue: number) => void;
    originalMapData: MapData | null;
}) {
    if (!mapData || !axes || !selectedMapDefinition) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Carregue os ficheiros e selecione um mapa para ver a tabela de dados.</p>
            </div>
        );
    }

    return (
        <div className="overflow-auto h-full w-full">
            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr>
                        <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-left font-semibold">
                            {axes.y.label} \ {axes.x.label}
                        </th>
                        {axes.x.calculated.map((x, i) => (
                            <th key={i} className="sticky top-0 bg-muted p-2 border border-border font-semibold">
                                {typeof x === 'number' ? x.toFixed(selectedMapDefinition.xAxisDef.decimalpl ?? 2) : x}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {axes.y.calculated.map((y, yi) => (
                        <tr key={yi}>
                            <td className="sticky left-0 bg-muted p-2 border border-border font-bold text-right">
                                {typeof y === 'number' ? y.toFixed(selectedMapDefinition.yAxisDef.decimalpl ?? 0) : y}
                            </td>
                            {mapData[yi]?.map((cell, xi) => {
                                const address = getCellAddress(selectedMapDefinition, yi, xi);
                                return (
                                    <td key={xi} className="p-0 border border-border text-center h-10">
                                        <EditableMapCell 
                                            value={cell} 
                                            onCellChange={(newValue) => onCellChange(yi, xi, newValue)} 
                                            address={address}
                                            originalValue={originalMapData?.[yi]?.[xi] ?? null}
                                            showCorrection={false}
                                            definition={selectedMapDefinition}
                                        />
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

export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; content: string, definitions: XDFDefinition[] } | null>(null);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [originalMapData, setOriginalMapData] = useState<MapData | null>(null);
    const [axes, setAxes] = useState<{ x: AxisDataState, y: AxisDataState } | null>(null);
    const [selectedLine, setSelectedLine] = useState<number | null>(null);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        const id = `${Date.now()}`;
        setLogs(prev => [...prev, { id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), message, type }]);
    }, []);

    const selectedMapDefinition = xdfFile?.definitions.find(def => def.name === selectedMapName);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

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
                    const { definitions } = parseXDF(buffer);
                    if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    setXdfFile({ name: file.name, content: buffer, definitions });
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

    const handleMapSelect = (name: string) => {
        setSelectedMapName(name);
        if (name && binFile && xdfFile) {
            const def = xdfFile.definitions.find(d => d.name === name);
            if (def) {
                try {
                    const { calculatedMap, axes } = readAndCalculateMapFromBin(binFile.buffer, def);
                    setMapData(calculatedMap);
                    setOriginalMapData(JSON.parse(JSON.stringify(calculatedMap)));
                    setAxes(axes);
                    setSelectedLine(axes.y.calculated.length > 0 ? 0 : null);
                    addLog(`Mapa carregado: ${name}`, 'info');
                } catch (error) {
                    const errorMessage = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
                    addLog(errorMessage, 'error');
                    toast({ title: 'Erro ao Ler Mapa', description: errorMessage, variant: 'destructive' });
                    setMapData(null);
                    setOriginalMapData(null);
                    setAxes(null);
                }
            }
        } else {
            setMapData(null);
            setOriginalMapData(null);
            setAxes(null);
        }
    };

    const handleCellChange = (rowIndex: number, colIndex: number, newValue: number) => {
        if (!mapData) return;
        const newMapData = mapData.map(row => [...row]);
        newMapData[rowIndex][colIndex] = newValue;
        setMapData(newMapData);
        addLog(`Célula [${rowIndex}, ${colIndex}] alterada para ${newValue.toFixed(2)}`, 'info');
    };
    
    const handleSave = () => {
        if (!binFile || !selectedMapDefinition || !mapData) {
            toast({ title: 'Erro ao Salvar', description: 'Dados insuficientes para salvar o ficheiro BIN.', variant: 'destructive' });
            return;
        }

        try {
            const rawMap = recalculateRawMapFromCalculated(mapData, selectedMapDefinition);
            const newBinBuffer = writeMapToBin(binFile.buffer, selectedMapDefinition, rawMap);
            
            const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const newFileName = binFile.name.replace('.bin', '_mod.bin');
            link.download = newFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            const successMessage = `Novo ficheiro BIN salvo como ${newFileName}.`;
            addLog(successMessage, 'success');
            toast({ title: 'Ficheiro Salvo', description: successMessage });

        } catch (error) {
            const errorMessage = `Falha ao gerar o novo ficheiro BIN: ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            toast({ title: 'Erro Crítico ao Salvar', description: errorMessage, variant: 'destructive' });
        }
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
                                <CardTitle className="text-base flex items-center gap-2"><BrainCircuit size={18} /> Ações</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 flex flex-col gap-3">
                               <Button variant="default" size="sm" disabled={!mapData} onClick={handleSave}>
                                   <Save className="mr-2" /> Salvar .BIN Modificado
                               </Button>
                               <Button variant="secondary" size="sm" disabled={!mapData}>
                                   <Pencil className="mr-2" /> Editar Eixos
                               </Button>
                            </CardContent>
                        </Card>

                    </SidebarContent>
                    <SidebarFooter>
                        <div className="p-2">
                             <h3 className="font-semibold text-sm mb-2 px-2">Log de Operações</h3>
                             <ScrollArea className="h-48 w-full rounded-md border p-2 font-mono text-xs">
                                {logs.length > 0 ? logs.slice().reverse().map(log => (
                                    <div key={log.id} className="flex items-start">
                                      <span className="text-muted-foreground/60 mr-2 shrink-0">{log.timestamp}</span>
                                      <span className={`break-words ${
                                        log.type === 'error' ? 'text-destructive' : 
                                        log.type === 'success' ? 'text-green-500' : 'text-foreground/80'
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
                         <h1 className="text-lg font-semibold ml-2">{selectedMapName || "Nenhum Mapa Selecionado"}</h1>
                    </div>
                    <div className="flex-1 p-4 min-h-0">
                        <Tabs defaultValue="view-table" className="w-full h-full flex flex-col">
                            <TabsList>
                                <TabsTrigger value="view-table"><Table2 className="mr-2"/>Tabela de Dados</TabsTrigger>
                                <TabsTrigger value="view-3d"><BarChart3 className="mr-2"/>Gráfico 3D</TabsTrigger>
                                <TabsTrigger value="view-2d"><BarChart3 className="mr-2"/>Gráfico 2D</TabsTrigger>
                            </TabsList>
                            <TabsContent value="view-table" className="flex-1 mt-4 min-h-0">
                               <DataTable
                                    mapData={mapData}
                                    axes={axes}
                                    selectedMapDefinition={selectedMapDefinition}
                                    onCellChange={handleCellChange}
                                    originalMapData={originalMapData}
                               />
                            </TabsContent>
                            <TabsContent value="view-3d" className="flex-1 mt-4 min-h-0">
                                {axes && mapData ? (
                                    <SurfacePlot3D 
                                        mapData={mapData}
                                        xAxis={axes.x.calculated}
                                        yAxis={axes.y.calculated}
                                        xAxisLabel={axes.x.label}
                                        yAxisLabel={axes.y.label}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <p>Carregue os ficheiros e selecione um mapa para ver o gráfico 3D.</p>
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="view-2d" className="flex-1 mt-4 min-h-0">
                                <LinePlot2D
                                    mapData={mapData}
                                    xAxis={axes?.x ?? null}
                                    yAxis={axes?.y ?? null}
                                    xAxisLabel={axes?.x.label}
                                    yAxisLabel={selectedMapDefinition?.name}
                                    selectedLineIndex={selectedLine}
                                    onLineSelect={setSelectedLine}
                                    onPointChange={handleCellChange}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                </main>
            </div>
        </div>
      </SidebarProvider>
    );
}

    
