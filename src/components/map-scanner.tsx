
'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, Upload, Flame, Fuel, HelpCircle, Rss, Gauge, Microscope, DownloadCloud } from 'lucide-react';
import type { LogMessage, PotentialMap, ProcessedMap, TemplateAnalysisConfig } from '@/lib/types';
import { scanForPotentialMaps, analyzeDataWithTemplate, COMMON_EQUATIONS } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import SurfacePlot3D from '@/components/surface-plot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const TableHeaderWithTooltip = ({ children, tooltipText }: { children: React.ReactNode, tooltipText: string }) => {
    return (
        <TableHead>
            <div className="flex items-center gap-1">
                {children}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs">{tooltipText}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </TableHead>
    )
}

const AxisInfo = ({ map, axis }: { map: PotentialMap; axis: 'x' | 'y' }) => {
    const type = axis === 'x' ? map.xAxisType : map.yAxisType;
    const address = axis === 'x' ? map.xAxisAddress : map.yAxisAddress;
    const isRpm = type === 'RPM';

    return (
        <div className="flex items-center gap-1 font-mono text-xs">
            {isRpm ? <Rss className="h-4 w-4 text-blue-500" /> : <Gauge className="h-4 w-4 text-orange-500" />}
            <span className="font-sans font-medium">{type}</span>
            {address !== undefined ? `(@0x${address.toString(16).toUpperCase()})` : '(N/A)'}
        </div>
    );
};

const TemplateAnalyzer = ({ binFile, addLog }: { binFile: { name: string; buffer: ArrayBuffer }, addLog: (message: string, type?: LogMessage['type']) => void }) => {
    const [config, setConfig] = useState<TemplateAnalysisConfig>({
        rows: 32,
        cols: 19,
        rpmMin: 700,
        rpmMax: 13000,
        loadMin: 0,
        loadMax: 100,
        address: '0x',
        dataLength: 32*19,
        dataType: 'uint8',
        equation: 'x*0.75-48',
    });
    const [analysisResult, setAnalysisResult] = useState<ProcessedMap>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        const addressNum = parseInt(config.address, 16);
        if (isNaN(addressNum)) {
            addLog("Endereço de template inválido.", "error");
            setIsAnalyzing(false);
            return;
        }

        addLog(`A analisar com template ${config.rows}x${config.cols} em 0x${addressNum.toString(16)}...`, "info");
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            const result = analyzeDataWithTemplate(binFile.buffer, { ...config, address: addressNum });
            setAnalysisResult(result);
            addLog("Análise por template concluída.", "success");
        } catch (error) {
            addLog(`Erro na análise por template: ${(error as Error).message}`, "error");
        }
        setIsAnalyzing(false);
    };

    const handleConfigChange = (field: keyof TemplateAnalysisConfig, value: string | number) => {
        let newConfig = { ...config, [field]: value };
        if (field === 'rows' || field === 'cols') {
             newConfig = { ...newConfig, dataLength: newConfig.rows * newConfig.cols };
        }
        setConfig(newConfig);
    };

    return (
        <Card className="shrink-0">
             <CardHeader>
                <CardTitle className="flex items-center gap-2"><Microscope/> Análise Visual por Template</CardTitle>
                <CardDescription>
                    Esta ferramenta permite-lhe criar uma "moldura" de mapa com eixos realistas (RPM, Carga) e ver como os dados de uma determinada área da memória se encaixam nela. É uma forma poderosa de validar visualmente se um bloco de dados se comporta como um mapa de motor.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h3 className="font-semibold">Configuração do Template</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="template-address">Endereço de Início (Hex)</Label>
                                <Input id="template-address" value={config.address} onChange={e => handleConfigChange('address', e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="template-length">Tamanho (bytes)</Label>
                                <Input id="template-length" type="number" value={config.dataLength} onChange={e => handleConfigChange('dataLength', Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="template-rows">Linhas (RPM)</Label>
                                <Input id="template-rows" type="number" value={config.rows} onChange={e => handleConfigChange('rows', Number(e.target.value))} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="template-cols">Colunas (Carga)</Label>
                                <Input id="template-cols" type="number" value={config.cols} onChange={e => handleConfigChange('cols', Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <Label htmlFor="template-rpm-min">RPM Mín.</Label>
                                <Input id="template-rpm-min" type="number" value={config.rpmMin} onChange={e => handleConfigChange('rpmMin', Number(e.target.value))} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="template-rpm-max">RPM Máx.</Label>
                                <Input id="template-rpm-max" type="number" value={config.rpmMax} onChange={e => handleConfigChange('rpmMax', Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <Label htmlFor="template-load-min">Carga Mín.</Label>
                                <Input id="template-load-min" type="number" value={config.loadMin} onChange={e => handleConfigChange('loadMin', Number(e.target.value))} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="template-load-max">Carga Máx.</Label>
                                <Input id="template-load-max" type="number" value={config.loadMax} onChange={e => handleConfigChange('loadMax', Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <Label htmlFor="template-datatype">Tipo de Dados</Label>
                                <Select value={config.dataType} onValueChange={(v: any) => handleConfigChange('dataType', v)}>
                                    <SelectTrigger id="template-datatype">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="uint8">8-bit</SelectItem>
                                        <SelectItem value="uint16le">16-bit LE</SelectItem>
                                        <SelectItem value="uint16be">16-bit BE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="template-equation">Equação</Label>
                                <Select value={config.equation} onValueChange={(v) => handleConfigChange('equation', v)}>
                                    <SelectTrigger id="template-equation">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COMMON_EQUATIONS.map(eq => (
                                            <SelectItem key={eq.name} value={eq.equation}>{eq.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full">
                            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Microscope className="mr-2 h-4 w-4" />}
                            Analisar com Template
                        </Button>
                    </div>
                     <div className="h-[400px] md:h-auto border rounded-lg p-2 flex items-center justify-center bg-muted/30">
                        {isAnalyzing ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        ) : analysisResult && analysisResult.calculatedMap && analysisResult.axes ? (
                             <SurfacePlot3D
                                mapData={analysisResult.calculatedMap}
                                xAxis={analysisResult.axes.x.calculated}
                                yAxis={analysisResult.axes.y.calculated}
                                xAxisLabel={analysisResult.axes.x.label}
                                yAxisLabel={analysisResult.axes.y.label}
                                zAxisLabel="Valor Calculado"
                             />
                        ) : (
                            <div className="text-center text-muted-foreground">
                                <p>O resultado da análise visual aparecerá aqui.</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
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
            <TemplateAnalyzer binFile={binFile} addLog={addLog} />

            <Separator />
            
            <Card className="shrink-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Search /> Scanner de Mapas Heurístico</CardTitle>
                    <CardDescription>
                        Esta ferramenta experimental analisa o ficheiro .BIN para encontrar estruturas que possam ser mapas não definidos no seu XDF. A análise baseia-se em padrões (smoothness dos dados) e pode não ser 100% precisa. Use os resultados como um ponto de partida para a sua investigação.
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
                            Iniciar Scan de Heurística
                        </Button>
                    )}
                </CardContent>
            </Card>

            <div className="flex-1 border rounded-lg min-h-0">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHeaderWithTooltip tooltipText="O endereço de memória (offset) onde a estrutura do mapa começa no ficheiro BIN.">
                                    Endereço Mapa
                                </TableHeaderWithTooltip>
                                 <TableHeaderWithTooltip tooltipText="Eixos encontrados e os seus respetivos endereços. RPM (Rotações por Minuto) e Carga (TPS/MAP).">
                                    Eixos (X / Y)
                                </TableHeaderWithTooltip>
                                 <TableHeaderWithTooltip tooltipText="O tipo de dados que o scanner acredita que o mapa usa (ex: 8-bit ou 16-bit).">
                                    Tipo de Dados
                                </TableHeaderWithTooltip>
                                <TableHeaderWithTooltip tooltipText="Um pequeno gráfico de linhas mostrando a 'forma' da primeira linha do mapa. Útil para identificar padrões visuais.">
                                    Pré-visualização
                                </TableHeaderWithTooltip>
                                <TableHeaderWithTooltip tooltipText="A pontuação de confiança do scanner (0-100%). Uma pontuação mais alta indica uma maior probabilidade de ser um mapa válido, com base na suavidade dos dados e reconhecimento de padrões.">
                                    Confiança
                                </TableHeaderWithTooltip>
                                <TableHeaderWithTooltip tooltipText="Sugestão automática do tipo de mapa, baseada nos valores encontrados após aplicar equações comuns.">
                                    Sugestão
                                </TableHeaderWithTooltip>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {potentialMaps.length > 0 ? (
                                potentialMaps.map((map) => (
                                    <TableRow key={`${map.address}-${map.rows}x${map.cols}-${map.dataSize}`}>
                                        <TableCell className="font-mono">0x{map.address.toString(16).toUpperCase()}</TableCell>
                                        <TableCell>
                                           <div className="flex flex-col gap-1">
                                                <AxisInfo map={map} axis="x" />
                                                <AxisInfo map={map} axis="y" />
                                           </div>
                                        </TableCell>
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
                                                <span className="text-muted-foreground text-xs">{map.reason}</span>
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
