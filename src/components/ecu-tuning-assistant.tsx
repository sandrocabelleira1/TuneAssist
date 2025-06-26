'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, TestDataEntry, OriginalSortOrder } from '@/lib/types';
import { parseXDF, readMapFromBin, readAxisFromBin, generateChecksum, saveBinFile } from '@/lib/ecu';
import { suggestMapCorrections, fetchManualInformation } from '@/app/actions';
import { getHeatmapColor, getCorrectionColor } from '@/lib/colors';
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, BrainCircuit, CheckCircle, FileUp, HardDriveDownload, List, Loader2, Plus, Search, Settings, Sparkles, Trash2, XCircle, Wrench } from 'lucide-react';

// MapTable Component
function MapTable({
  mapData,
  xAxis,
  yAxis,
  xAxisLabel,
  yAxisLabel,
  isEditable = false,
  isCorrection = false,
  onCellChange,
}: {
  mapData: MapData;
  xAxis: number[];
  yAxis: number[];
  xAxisLabel: string;
  yAxisLabel: string;
  isEditable?: boolean;
  isCorrection?: boolean;
  onCellChange?: (y: number, x: number, value: number) => void;
}) {
  const { min, max } = useMemo(() => {
    if (isCorrection) return { min: 0, max: 0 };
    let minVal = Infinity;
    let maxVal = -Infinity;
    mapData.forEach(row => row.forEach(cell => {
      if (cell !== null && !isNaN(cell)) {
        minVal = Math.min(minVal, cell);
        maxVal = Math.max(maxVal, cell);
      }
    }));
    return { min: minVal, max: maxVal };
  }, [mapData, isCorrection]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, y: number, x: number) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && onCellChange) {
      onCellChange(y, x, value);
    }
  };

  return (
    <div className="overflow-auto relative max-h-[70vh]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-card">
            <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-muted-foreground text-left min-w-[120px]">
              <div className="font-semibold text-xs">Eixo Y: <span className="font-normal text-foreground">{yAxisLabel}</span></div>
              <div className="font-semibold text-xs">Eixo X: <span className="font-normal text-foreground">{xAxisLabel}</span></div>
            </th>
            {xAxis.map((x, i) => (
              <th key={`head-x-${i}`} className="sticky top-0 z-10 bg-muted p-1 border border-border font-semibold text-center min-w-[60px]">{x.toFixed(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yAxis.map((y, yi) => (
            <tr key={`row-${yi}`}>
              <td className="sticky left-0 z-10 bg-muted p-1 border border-border font-semibold text-center">{Math.round(y)}</td>
              {(mapData[yi] || []).map((cell, xi) => (
                <td key={`cell-${yi}-${xi}`} className="p-0 border border-border text-center" style={{ backgroundColor: isCorrection ? getCorrectionColor(cell) : getHeatmapColor(cell, min, max) }}>
                  {isEditable ? (
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={cell?.toFixed(2) || ''}
                      onBlur={(e) => handleInputChange(e, yi, xi)}
                      className="w-full h-full text-center bg-transparent border-0 rounded-none focus-visible:ring-1 focus-visible:ring-ring p-1"
                    />
                  ) : (
                    <div className="w-[60px] h-8 flex items-center justify-center">
                      {isCorrection
                        ? (cell === null || isNaN(cell) ? '-' : `${cell.toFixed(1)}%`)
                        : (cell === null || isNaN(cell) ? '-' : cell.toFixed(2))
                      }
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Main Component
export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [debugMode, setDebugMode] = useState(false);
    
    // File & map state
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer; checksum: string } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; definitions: XDFDefinition[] } | null>(null);
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [originalMap, setOriginalMap] = useState<MapData | null>(null);
    const [sortOrder, setSortOrder] = useState<OriginalSortOrder>({ x: [], y: [] });
    const [axes, setAxes] = useState<{ x: number[], y: number[], xLabel: string, yLabel: string } | null>(null);
    const [customAxes, setCustomAxes] = useState<Record<string, Record<string, { x: number[], y: number[] }>>>({});

    // AI & Correction state
    const [testData, setTestData] = useState<TestDataEntry[]>([]);
    const [targetLambdaMap, setTargetLambdaMap] = useState<MapData | null>(null);
    const [correctedMap, setCorrectedMap] = useState<MapData | null>(null);
    const [correctionPercentageMap, setCorrectionPercentageMap] = useState<MapData | null>(null);
    const [aggressiveness, setAggressiveness] = useState(20);
    const [isLoading, setIsLoading] = useState(false);
    const [factorySpecs, setFactorySpecs] = useState('');
    const [manualSearchModel, setManualSearchModel] = useState('');
    const [isFetchingManual, setIsFetchingManual] = useState(false);

    // Modal state
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isAxesModalOpen, setIsAxesModalOpen] = useState(false);
    const [isChecksumWarningOpen, setIsChecksumWarningOpen] = useState(false);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        if (type === 'debug' && !debugMode) return;
        setLogs(prev => [...prev, {
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString(),
            message,
            type,
        }]);
    }, [debugMode]);

    const resetState = () => {
        setBinFile(null); setXdfFile(null); setSelectedMapName('');
        setOriginalMap(null); setSortOrder({ x: [], y: [] }); setAxes(null);
        setTestData([]); setTargetLambdaMap(null); setCorrectedMap(null); setCorrectionPercentageMap(null);
        setCustomAxes({});
        setFactorySpecs('');
        setIsLoading(false);
        setManualSearchModel('');
        if (binInputRef.current) binInputRef.current.value = '';
        if (xdfInputRef.current) xdfInputRef.current.value = '';
        addLog('O estado foi reiniciado.', 'info');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const buffer = event.target?.result as ArrayBuffer;
                if (type === 'bin') {
                    const checksum = generateChecksum(buffer);
                    setBinFile({ name: file.name, buffer, checksum });
                    addLog(`Ficheiro BIN carregado: ${file.name} (Checksum: ${checksum})`, 'success');
                } else {
                    const text = new TextDecoder().decode(buffer);
                    const definitions = parseXDF(text);
                    if (definitions.length === 0) {
                        throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    }
                    setXdfFile({ name: file.name, definitions });
                    addLog(`Ficheiro XDF carregado: ${file.name} com ${definitions.length} mapas.`, 'success');
                }
            } catch (error) {
                const msg = `Erro ao carregar ${file.name}: ${(error as Error).message}`;
                addLog(msg, 'error');
                toast({ variant: 'destructive', title: "Erro no Ficheiro", description: msg });
            }
        };
        reader.onerror = () => {
             addLog(`Erro ao ler o ficheiro ${file.name}`, 'error');
             toast({ variant: 'destructive', title: "Erro no Ficheiro", description: `Não foi possível ler o ficheiro ${file.name}` });
        }
        reader.readAsArrayBuffer(file);
    };

    const handleMapSelect = (name: string) => {
        if (!binFile || !xdfFile || !name) return;
        
        const definition = xdfFile.definitions.find(d => d.name === name);
        if (!definition) {
            addLog(`Definição de mapa "${name}" não encontrada.`, 'error');
            return;
        }

        setSelectedMapName(name);
        try {
            const map = readMapFromBin(binFile.buffer, definition);

            let tempEixoX = readAxisFromBin(binFile.buffer, definition.xAxisDef) || Array.from({ length: definition.cols }, (_, i) => i + 1);
            let tempEixoY = readAxisFromBin(binFile.buffer, definition.yAxisDef) || Array.from({ length: definition.rows }, (_, i) => i + 1);

            const sortableX = tempEixoX.map((value, index) => ({ value: Number(value), index }));
            sortableX.sort((a, b) => a.value - b.value);
            
            const sortableY = tempEixoY.map((value, index) => ({ value: Number(value), index }));
            sortableY.sort((a, b) => a.value - b.value);
            
            const sortedMap = sortableY.map(yItem => {
                const originalRow = map[yItem.index];
                if (!originalRow) return Array(sortableX.length).fill(null);
                return sortableX.map(xItem => originalRow[xItem.index]);
            });

            const sortedAxes = {
              x: sortableX.map(item => parseFloat(item.value.toFixed(1))),
              y: sortableY.map(item => Math.round(Number(item.value))),
              xLabel: definition.xAxisDef?.label || 'Carga',
              yLabel: definition.yAxisDef?.label || 'RPM',
            };
            
            setOriginalMap(sortedMap);
            
            if (binFile?.checksum) {
              const userAxes = customAxes[binFile.checksum]?.[name];
              if (userAxes) {
                  setAxes({ ...sortedAxes, x: userAxes.x, y: userAxes.y });
                  addLog(`Eixos personalizados carregados para o mapa "${name}".`, 'info');
              } else {
                  setAxes(sortedAxes);
              }
            } else {
              setAxes(sortedAxes);
            }

            setSortOrder({ x: sortableX, y: sortableY });
            
            const lambdaMap = Array(sortedAxes.y.length).fill(0).map(() => Array(sortedAxes.x.length).fill(1.0));
            setTargetLambdaMap(lambdaMap);
            setCorrectedMap(null);
            setCorrectionPercentageMap(null);

            addLog(`Mapa carregado com sucesso: ${name}`, 'success');
        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
        }
    };
    
    const handleAnalyzeClick = async () => {
        if (!originalMap || !targetLambdaMap || !testData.length || !axes) {
            addLog('Não há dados suficientes para executar a análise.', 'error');
            toast({ variant: 'destructive', title: 'Erro na Análise', description: 'Por favor, carregue um mapa e forneça dados de ensaio.' });
            return;
        }
        setIsLoading(true);
        addLog(`A iniciar análise IA com ${aggressiveness}% de agressividade...`, 'info');

        const input = {
            mapData: originalMap,
            lambdaTarget: targetLambdaMap,
            testData,
            aggressiveness: aggressiveness / 100,
            eixo_x: axes.x,
            eixo_y: axes.y,
            eixo_x_label: axes.xLabel,
            eixo_y_label: axes.yLabel,
            factorySpecs,
        };

        const result = await suggestMapCorrections(input);
        
        if (result.success && result.data) {
            setCorrectedMap(result.data.correctedMap);
            setCorrectionPercentageMap(result.data.correctionPercentageMap);
            addLog('Análise IA concluída. Novo mapa gerado.', 'success');
            toast({ title: "Análise Concluída", description: "A IA gerou uma nova sugestão de mapa." });
        } else {
            addLog(`A análise IA falhou: ${result.error}`, 'error');
            toast({ variant: 'destructive', title: 'Falha na Análise IA', description: result.error });
        }
        setIsLoading(false);
    };

    const handleSaveClick = () => {
        if (!correctedMap || !binFile || !xdfFile || !selectedMapName || !sortOrder) {
            addLog('Não é possível guardar: faltam dados do mapa corrigido ou definições de ficheiro.', 'error');
            toast({ variant: 'destructive', title: "Erro ao Guardar", description: 'Faltam dados para guardar.' });
            return;
        }
        setIsChecksumWarningOpen(true);
    };

    const handleConfirmSave = () => {
        if (!correctedMap || !binFile || !xdfFile || !selectedMapName || !sortOrder) {
            return;
        }
        const definition = xdfFile.definitions.find(d => d.name === selectedMapName);
        if (!definition) return;

        try {
            saveBinFile(binFile.buffer, correctedMap, definition, sortOrder);
            addLog('Novo ficheiro BIN guardado com sucesso.', 'success');
            toast({ title: 'Ficheiro Guardado', description: 'O seu novo ficheiro BIN foi descarregado.' });
        } catch (error) {
            addLog(`Erro ao guardar o ficheiro: ${(error as Error).message}`, 'error');
            toast({ variant: 'destructive', title: 'Erro ao Guardar', description: (error as Error).message });
        }
        setIsChecksumWarningOpen(false);
    };


    const handleLambdaCellChange = (y: number, x: number, value: number) => {
        if (!targetLambdaMap) return;
        const newMap = targetLambdaMap.map(row => [...row]);
        newMap[y][x] = value;
        setTargetLambdaMap(newMap);
    };

    const handleConfirmLogData = (data: TestDataEntry[]) => {
        setTestData(data);
        setIsLogModalOpen(false);
        addLog(`Adicionados ${data.length} pontos de dados de ensaio.`, 'success');
    };
    
    const handleConfirmAxes = (newAxesData: { y: string, x: string }) => {
        if (!axes || !selectedMapName) return;
        const newY = newAxesData.y.split(',').map(s => parseFloat(s.trim()));
        const newX = newAxesData.x.split(',').map(s => parseFloat(s.trim()));

        if (newY.some(isNaN) || newX.some(isNaN) || newY.length !== axes.y.length || newX.length !== axes.x.length) {
            addLog('Valores dos eixos inválidos. Certifique-se de que são números separados por vírgulas e que correspondem às dimensões originais.', 'error');
            toast({ variant: 'destructive', title: "Erro nos Eixos", description: "Valores inválidos. Verifique os números e as dimensões." });
            return;
        }
        
        const newAxesState = { ...axes, x: newX, y: newY };
        setAxes(newAxesState);

        if (binFile?.checksum) {
          setCustomAxes(prev => ({
              ...prev,
              [binFile.checksum]: {
                  ...(prev[binFile.checksum] || {}),
                  [selectedMapName]: { x: newX, y: newY }
              }
          }));
          addLog('Eixos personalizados guardados para este ficheiro BIN.', 'success');
        } else {
          toast({ variant: 'destructive', title: "Erro", description: "Não foi possível guardar os eixos porque nenhum ficheiro BIN está carregado." });
          addLog('Não foi possível guardar os eixos personalizados: ficheiro BIN não carregado.', 'error');
        }
        
        setIsAxesModalOpen(false);
        addLog('Eixos do mapa atualizados.', 'success');
    };

    const handleFetchManualInfo = async () => {
        if (!manualSearchModel) return;
        setIsFetchingManual(true);
        addLog(`A procurar informações do manual para "${manualSearchModel}"...`, 'info');

        const result = await fetchManualInformation({ query: manualSearchModel });
        
        if (result.success && result.data) {
            setFactorySpecs(result.data);
            addLog('Informações do manual preenchidas automaticamente.', 'success');
            toast({ title: 'Informações Preenchidas', description: 'O contexto foi preenchido com base nos manuais encontrados.' });
        } else {
            addLog(`Falha ao buscar informações do manual: ${result.error}`, 'error');
            toast({ variant: 'destructive', title: 'Erro na Busca', description: result.error });
        }

        setIsFetchingManual(false);
    };

    const isAnalyzeDisabled = !originalMap || testData.length === 0 || isLoading;
    const isSaveDisabled = !correctedMap || isLoading;
    
    const visibleLogs = useMemo(() => {
        return debugMode ? logs : logs.filter(log => log.type !== 'debug');
    }, [logs, debugMode]);

    return (
        <TooltipProvider>
            <div className="max-w-screen-2xl mx-auto">
                <header className="text-center mb-8 flex items-center justify-center relative">
                    <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center justify-center gap-3">
                        <Sparkles className="text-primary w-8 h-8"/> TuneAssist AI
                    </h1>
                    <p className="text-lg text-muted-foreground mt-2 absolute top-full">Assistente de Afinação de ECU Potenciado por IA</p>
                    <Link href="/manuals" passHref className="absolute right-0">
                        <Button variant="outline">
                            <Wrench className="mr-2"/> Pesquisar Manuais
                        </Button>
                    </Link>
                </header>


                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    {/* Control Panel */}
                    <aside className="xl:col-span-3">
                        <Card className="sticky top-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Settings className="w-6 h-6"/>Painel de Controlo</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">1. Carregar Ficheiros</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" onClick={() => binInputRef.current?.click()}><FileUp className="mr-2"/> .BIN</Button>
                                        <Input ref={binInputRef} type="file" accept=".bin" onChange={(e) => handleFileChange(e, 'bin')} className="hidden" />
                                        <Button variant="outline" onClick={() => xdfInputRef.current?.click()}><FileUp className="mr-2"/> .XDF</Button>
                                        <Input ref={xdfInputRef} type="file" accept=".xdf" onChange={(e) => handleFileChange(e, 'xdf')} className="hidden" />
                                    </div>
                                    {binFile && <p className="text-xs text-green-400 truncate">BIN: {binFile.name}</p>}
                                    {xdfFile && <p className="text-xs text-green-400 truncate">XDF: {xdfFile.name}</p>}
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">2. Selecionar Mapa</h3>
                                    <Select onValueChange={handleMapSelect} disabled={!xdfFile} value={selectedMapName}>
                                        <SelectTrigger><SelectValue placeholder="Selecione um mapa" /></SelectTrigger>
                                        <SelectContent>
                                            {xdfFile?.definitions.map(def => (
                                                <SelectItem key={def.name} value={def.name}>{def.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">3. Dados & Ações</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" onClick={() => setIsAxesModalOpen(true)} disabled={!originalMap}>Editar Eixos</Button>
                                        <Button variant="outline" onClick={() => setIsLogModalOpen(true)} disabled={!originalMap}><List className="mr-2"/>Dados Ensaio</Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">4. Informações de Fábrica (Opcional)</h3>
                                     <CardDescription className="text-xs pb-2">
                                        A IA pode buscar o manual do seu veículo para obter contexto, ou pode inserir as informações manualmente.
                                    </CardDescription>
                                     <div className="flex items-center gap-2">
                                        <Input
                                            placeholder="Marca e modelo, ex: Honda CB 500F"
                                            value={manualSearchModel}
                                            onChange={(e) => setManualSearchModel(e.target.value)}
                                            disabled={!originalMap || isFetchingManual}
                                            className="flex-grow"
                                        />
                                        <Button 
                                            onClick={handleFetchManualInfo} 
                                            disabled={!originalMap || !manualSearchModel || isFetchingManual}
                                            size="icon"
                                        >
                                            {isFetchingManual ? <Loader2 className="animate-spin" /> : <Search />}
                                        </Button>
                                    </div>
                                    <Textarea
                                        placeholder="Informações do manual aparecerão aqui... Ex: Lambda alvo em WOT: 0.88. Limite de RPM: 9000."
                                        value={factorySpecs}
                                        onChange={(e) => setFactorySpecs(e.target.value)}
                                        className="h-24"
                                        disabled={!originalMap}
                                    />
                                </div>

                                <div className="space-y-4">
                                     <h3 className="font-semibold text-primary">5. Análise IA</h3>
                                    <div>
                                        <Label htmlFor="aggressiveness" className="flex justify-between">
                                            Agressividade <span>{aggressiveness}%</span>
                                        </Label>
                                        <Slider id="aggressiveness" value={[aggressiveness]} onValueChange={(val) => setAggressiveness(val[0])} min={1} max={100} step={1} />
                                    </div>
                                    <Button onClick={handleAnalyzeClick} disabled={isAnalyzeDisabled} className="w-full">
                                        {isLoading ? <Loader2 className="mr-2 animate-spin" /> : <BrainCircuit className="mr-2" />}
                                        Analisar e Gerar Mapa
                                    </Button>
                                    <Button onClick={handleSaveClick} disabled={isSaveDisabled} className="w-full" variant="secondary">
                                        <HardDriveDownload className="mr-2" /> Salvar Novo .BIN
                                    </Button>
                                </div>
                                <Button onClick={resetState} variant="destructive" className="w-full">Reset</Button>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-semibold">Log de Operações</h3>
                                        <div className="flex items-center space-x-2">
                                            <Label htmlFor="debugMode" className="text-xs">Debug</Label>
                                            <Switch id="debugMode" checked={debugMode} onCheckedChange={setDebugMode} />
                                        </div>
                                    </div>
                                    <ScrollArea className="h-40 w-full rounded-md border p-2 font-mono text-xs">
                                        {visibleLogs.map(log => (
                                            <p key={log.id} className="flex gap-2">
                                                <span className="text-muted-foreground">{log.timestamp}</span>
                                                <span className={
                                                    log.type === 'success' ? 'text-green-400' :
                                                    log.type === 'error' ? 'text-red-400' :
                                                    log.type === 'debug' ? 'text-yellow-400' : ''
                                                }>{log.message}</span>
                                            </p>
                                        ))}
                                    </ScrollArea>
                                </div>

                            </CardContent>
                        </Card>
                    </aside>

                    {/* Map View */}
                    <main className="xl:col-span-9">
                        <Card className="min-h-[85vh]">
                            <CardHeader>
                                <CardTitle>Visualizador de Mapas</CardTitle>
                                <CardDescription>{selectedMapName || "Carregue os ficheiros e selecione um mapa para começar"}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {originalMap && axes ? (
                                    <Tabs defaultValue="original">
                                        <TabsList>
                                            <TabsTrigger value="original">Original</TabsTrigger>
                                            <TabsTrigger value="target">Lambda Alvo</TabsTrigger>
                                            <TabsTrigger value="correction" disabled={!correctionPercentageMap}>Correção</TabsTrigger>
                                            <TabsTrigger value="corrected" disabled={!correctedMap}>Mapa Ajustado</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="original" className="mt-4">
                                            {originalMap && <MapTable mapData={originalMap} xAxis={axes.x} yAxis={axes.y} xAxisLabel={axes.xLabel} yAxisLabel={axes.yLabel}/>}
                                        </TabsContent>
                                        <TabsContent value="target" className="mt-4">
                                            {targetLambdaMap && <MapTable mapData={targetLambdaMap} xAxis={axes.x} yAxis={axes.y} isEditable onCellChange={handleLambdaCellChange} xAxisLabel={axes.xLabel} yAxisLabel={axes.yLabel}/>}
                                        </TabsContent>
                                        <TabsContent value="correction" className="mt-4">
                                            {correctionPercentageMap && <MapTable mapData={correctionPercentageMap} xAxis={axes.x} yAxis={axes.y} isCorrection xAxisLabel={axes.xLabel} yAxisLabel={axes.yLabel}/>}
                                        </TabsContent>
                                        <TabsContent value="corrected" className="mt-4">
                                            {correctedMap && <MapTable mapData={correctedMap} xAxis={axes.x} yAxis={axes.y} xAxisLabel={axes.xLabel} yAxisLabel={axes.yLabel}/>}
                                        </TabsContent>
                                    </Tabs>
                                ) : (
                                    <div className="h-96 flex flex-col items-center justify-center text-center text-muted-foreground">
                                        <FileUp className="w-16 h-16 mb-4"/>
                                        <p className="font-semibold">Nenhum mapa carregado</p>
                                        <p className="text-sm">Por favor carregue os ficheiros .BIN e .XDF e selecione um mapa.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </main>
                </div>
                
                {/* Modals */}
                <ManualLogModal open={isLogModalOpen} onOpenChange={setIsLogModalOpen} onConfirm={handleConfirmLogData} existingData={testData} />
                <EditAxesModal open={isAxesModalOpen} onOpenChange={setIsAxesModalOpen} onConfirm={handleConfirmAxes} currentAxes={axes} />
                <AlertDialog open={isChecksumWarningOpen} onOpenChange={setIsChecksumWarningOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Aviso Importante Sobre o Checksum</AlertDialogTitle>
                            <AlertDialogDescription>
                                A aplicação vai guardar o ficheiro .BIN com as suas modificações.
                                <br /><br />
                                <strong>Atenção:</strong> O <strong>checksum</strong> do ficheiro (a soma de verificação) <strong>não foi corrigido automaticamente</strong>.
                                Dependendo da sua ECU, pode ser necessário usar uma ferramenta externa para corrigir o checksum antes de programar o ficheiro no veículo.
                                <br /><br />
                                Programar um ficheiro com um checksum incorreto pode fazer com que a ECU não o aceite. Deseja continuar?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmSave}>Confirmar e Guardar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TooltipProvider>
    );
}

type FormattedEntry = {
    rpm: number;
    carga: string;
    lambda: string;
    torque: string;
}

function ManualLogModal({ open, onOpenChange, onConfirm, existingData }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: (data: TestDataEntry[]) => void, existingData: TestDataEntry[] }) {
    const [entries, setEntries] = useState<FormattedEntry[]>([]);
    
    const generateInitialEntries = useCallback(() => {
        const rpms = Array.from({ length: (17000 - 1000) / 500 + 1 }, (_, i) => 1000 + i * 500);
        let initialEntries: FormattedEntry[] = rpms.map(rpm => ({
            rpm,
            carga: '',
            lambda: '',
            torque: ''
        }));

        if (existingData && existingData.length > 0) {
            existingData.forEach(existingEntry => {
                const index = initialEntries.findIndex(e => e.rpm === existingEntry.rpm);
                if (index !== -1) {
                    initialEntries[index].carga = String(existingEntry.carga);
                    initialEntries[index].lambda = String(existingEntry.lambda);
                    initialEntries[index].torque = String(existingEntry.torque || '');
                }
            });
        }
        return initialEntries;
    }, [existingData]);
    
    useEffect(() => {
        if (open) {
            setEntries(generateInitialEntries());
        }
    }, [open, generateInitialEntries]);

    const handleUpdate = (index: number, field: 'carga' | 'lambda' | 'torque', value: string) => {
        const newEntries = [...entries];
        const entry = newEntries[index];
        if (entry) {
            entry[field] = value;
            setEntries(newEntries);
        }
    };
    
    const handleClear = () => {
        const rpms = Array.from({ length: (17000 - 1000) / 500 + 1 }, (_, i) => 1000 + i * 500);
        const blankEntries: FormattedEntry[] = rpms.map(rpm => ({
            rpm,
            carga: '',
            lambda: '',
            torque: ''
        }));
        setEntries(blankEntries);
    }

    const handleConfirm = () => {
        const validEntries = entries
            .map(e => ({
                rpm: e.rpm,
                carga: parseFloat(e.carga),
                lambda: parseFloat(e.lambda),
                torque: parseFloat(e.torque),
            }))
            .filter(e => !isNaN(e.carga) && !isNaN(e.lambda));
        
        onConfirm(validEntries.map(e => ({
            ...e,
            torque: isNaN(e.torque) ? undefined : e.torque
        })));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Grelha de Entrada de Dados de Ensaio</DialogTitle>
                    <DialogDescription>
                        Insira os valores de carga, lambda e torque para cada RPM. Apenas as linhas com valores válidos de Carga e Lambda serão usadas na análise.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-4 gap-x-4 gap-y-2 items-center font-bold px-2 py-1 text-sm">
                    <Label>RPM</Label>
                    <Label>Carga (%)</Label>
                    <Label>Fator Lambda</Label>
                    <Label>Torque (Nm)</Label>
                </div>
                <ScrollArea className="h-[60vh] pr-4">
                    <div className="space-y-2">
                    {entries.map((entry, index) => (
                        <div key={entry.rpm} className="grid grid-cols-4 gap-x-4 items-center">
                            <Input type="number" value={entry.rpm} disabled className="font-semibold text-muted-foreground" />
                            <Input type="number" placeholder="e.g. 80" value={entry.carga} onChange={(e) => handleUpdate(index, 'carga', e.target.value)} />
                            <Input type="number" step="0.01" placeholder="e.g. 1.00" value={entry.lambda} onChange={(e) => handleUpdate(index, 'lambda', e.target.value)} />
                            <Input type="number" step="0.1" placeholder="e.g. 120.5" value={entry.torque} onChange={(e) => handleUpdate(index, 'torque', e.target.value)} />
                        </div>
                    ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClear}>Limpar Dados</Button>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Concluir e Usar Dados</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditAxesModal({ open, onOpenChange, onConfirm, currentAxes }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: (axes: { x: string, y: string }) => void, currentAxes: {x: number[], y:number[]} | null }) {
    const [yAxis, setYAxis] = useState('');
    const [xAxis, setXAxis] = useState('');

    useEffect(() => {
        if(open && currentAxes) {
            setYAxis(currentAxes.y.join(', '));
            setXAxis(currentAxes.x.join(', '));
        }
    }, [open, currentAxes]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Eixos da Tabela</DialogTitle>
                    <DialogDescription>Insira os valores corretos para os eixos, separados por vírgulas.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="yAxisText">Eixo Y (e.g. RPM)</Label>
                        <Input id="yAxisText" value={yAxis} onChange={e => setYAxis(e.target.value)} placeholder="e.g. 800, 1000, 1200..." />
                    </div>
                    <div>
                        <Label htmlFor="xAxisText">Eixo X (e.g. Carga/TPS)</Label>
                        <Input id="xAxisText" value={xAxis} onChange={e => setXAxis(e.target.value)} placeholder="e.g. 10, 20, 30..."/>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={() => onConfirm({ y: yAxis, x: xAxis })}>Salvar Eixos</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
