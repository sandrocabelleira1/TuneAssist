'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, AxisDefinition } from '@/lib/types';
import { parseXDF, readMapFromBin, readAxisFromBin, generateChecksum } from '@/lib/ecu';
import { validateMapType } from '@/app/actions';
import { getHeatmapColor } from '@/lib/colors';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, FileUp, GitCompareArrows, Loader2, Plus, Settings, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react';

// Simplified MapTable to only display data
function MapTable({
  mapData,
  xAxis,
  yAxis,
  xAxisLabel,
  yAxisLabel,
}: {
  mapData: MapData;
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  yAxisLabel: string;
}) {
  const { min, max } = useMemo(() => {
    let minVal = Infinity;
    let maxVal = -Infinity;
    mapData.forEach(row => row.forEach(cell => {
      if (cell !== null && !isNaN(cell)) {
        minVal = Math.min(minVal, cell);
        maxVal = Math.max(maxVal, cell);
      }
    }));
    return { min: minVal, max: maxVal };
  }, [mapData]);

  return (
    <div className="overflow-auto relative h-full">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-card">
            <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-muted-foreground text-left min-w-[120px]">
              <div className="font-semibold text-xs">Vertical: <span className="font-normal text-foreground">{yAxisLabel}</span></div>
              <div className="font-semibold text-xs">Horizontal: <span className="font-normal text-foreground">{xAxisLabel}</span></div>
            </th>
            {xAxis.map((x, i) => (
              <th key={`head-x-${i}`} className="sticky top-0 z-10 bg-muted p-1 border border-border font-semibold text-center min-w-[60px]">
                {typeof x === 'number' ? Math.round(x) : x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yAxis.map((y, yi) => (
            <tr key={`row-${yi}`}>
              <td className="sticky left-0 z-10 bg-muted p-1 border border-border font-semibold text-center">
                {typeof y === 'number' ? y.toFixed(1) : y}
              </td>
              {xAxis.map((_x, xi) => {
                const cell = mapData[yi]?.[xi];
                return (
                  <td key={`cell-${yi}-${xi}`} className="p-0 border border-border text-center" style={{ backgroundColor: getHeatmapColor(cell, min, max) }}>
                    <div className="w-[60px] h-8 flex items-center justify-center">
                        {(cell === null || isNaN(cell) ? '-' : cell.toFixed(2))}
                    </div>
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

// Type for AI Correction Suggestion
type AISuggestion = {
    reasoning: string;
    originalMap: MapData;
    correctedMap: MapData;
    originalAxes: { x: (string | number)[]; y: (string | number)[], xLabel: string; yLabel: string; };
    correctedAxes: { x: (string | number)[]; y: (string | number)[], xLabel: string; yLabel: string; };
    newDefinition: XDFDefinition;
}

// Main Component
export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [debugMode, setDebugMode] = useState(false);
    
    // File & map state
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer; checksum: string } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; definitions: XDFDefinition[] } | null>(null);
    const [availableMaps, setAvailableMaps] = useState<XDFDefinition[]>([]);
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [originalMap, setOriginalMap] = useState<MapData | null>(null);
    const [axes, setAxes] = useState<{ x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null>(null);
    const [customAxes, setCustomAxes] = useState<Record<string, Record<string, { x: (string|number)[], y: (string|number)[] }>>>({});
    const [xdfLibrary, setXdfLibrary] = useState<Record<string, { name: string; content: string; brand?: string }>>({});
    const [selectedXdfFromLibrary, setSelectedXdfFromLibrary] = useState<string>('');
    const [selectedBrandForNewXdf, setSelectedBrandForNewXdf] = useState<string>('no-brand');
    const [activeXdfBrand, setActiveXdfBrand] = useState<string>('');


    // AI state
    const [isValidatingMap, setIsValidatingMap] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<{ confidence: string; suspectedType: string; reasoning: string; } | null>(null);
    const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);


    // Modal state
    const [isAxesModalOpen, setIsAxesModalOpen] = useState(false);
    const [isXdfErrorModalOpen, setIsXdfErrorModalOpen] = useState(false);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);


    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        if (type === 'debug' && !debugMode) return;
        const id = `${Date.now()}-${Math.random()}`;
        setLogs(prev => [...prev, {
            id,
            timestamp: new Date().toLocaleTimeString(),
            message,
            type,
        }]);
    }, [debugMode]);
    
    const visibleLogs = useMemo(() => {
        return debugMode ? logs : logs.filter(log => log.type !== 'debug');
    }, [logs, debugMode]);

    useEffect(() => {
        setTimeout(() => {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, [visibleLogs]);


    // Load custom axes & XDF library from localStorage on component mount
    useEffect(() => {
        try {
            const savedAxes = localStorage.getItem('customAxesData');
            if (savedAxes) {
                setCustomAxes(JSON.parse(savedAxes));
                addLog('Eixos personalizados carregados do armazenamento local.', 'debug');
            }
            const savedLibrary = localStorage.getItem('xdfLibrary');
            if (savedLibrary) {
                setXdfLibrary(JSON.parse(savedLibrary));
                addLog('Biblioteca XDF carregada do armazenamento local.', 'debug');
            }
        } catch (error) {
            console.error("Failed to load from localStorage", error);
            addLog('Não foi possível carregar dados do armazenamento local.', 'error');
        }
    }, [addLog]);

    // Save custom axes to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('customAxesData', JSON.stringify(customAxes));
        } catch (error) {
            console.error("Failed to save custom axes to localStorage", error);
            addLog('Não foi possível guardar os eixos personalizados no armazenamento local.', 'error');
        }
    }, [customAxes, addLog]);

    // BIN/XDF Compatibility Check
    useEffect(() => {
        if (!binFile || !xdfFile) {
            setAvailableMaps([]);
            return;
        }

        const binSize = binFile.buffer.byteLength;
        const validDefinitions: XDFDefinition[] = [];
        let invalidCount = 0;

        xdfFile.definitions.forEach(def => {
            let isInvalid = false;
            const mapEndAddr = def.address + (def.rows * def.cols * def.dataSize);
            if (mapEndAddr > binSize || def.address < 0) { isInvalid = true; }
            if (!isInvalid && def.xAxisDef?.address !== null) {
                const axisEndAddr = def.xAxisDef.address + (def.xAxisDef.count * def.xAxisDef.dataSize);
                if (axisEndAddr > binSize || def.xAxisDef.address < 0) { isInvalid = true; }
            }
            if (!isInvalid && def.yAxisDef?.address !== null) {
                const axisEndAddr = def.yAxisDef.address + (def.yAxisDef.count * def.yAxisDef.dataSize);
                if (axisEndAddr > binSize || def.yAxisDef.address < 0) { isInvalid = true; }
            }
            
            if (isInvalid) {
                invalidCount++;
            } else {
                validDefinitions.push(def);
            }
        });

        setAvailableMaps(validDefinitions);
        
        if (selectedMapName && !validDefinitions.some(def => def.name === selectedMapName)) {
            setSelectedMapName('');
            setOriginalMap(null);
            setAxes(null);
        }
        
        if (invalidCount > 0) {
            const totalCount = xdfFile.definitions.length;
            const warningMsg = `${invalidCount} de ${totalCount} definições de mapa são incompatíveis com o ficheiro BIN e foram ocultadas.`;
            addLog(warningMsg, 'error');
            toast({
                variant: 'destructive',
                title: "Aviso de Compatibilidade",
                description: warningMsg,
                duration: 8000,
            });
        }

    }, [binFile, xdfFile, addLog, toast, selectedMapName]);


    const resetState = () => {
        setBinFile(null); setXdfFile(null); setSelectedMapName('');
        setOriginalMap(null); setAxes(null);
        setIsValidatingMap(false);
        setAiSuggestion(null);
        setAnalysisResult(null);
        setSelectedXdfFromLibrary('');
        setActiveXdfBrand('');
        setSelectedBrandForNewXdf('no-brand');
        if (binInputRef.current) binInputRef.current.value = '';
        if (xdfInputRef.current) xdfInputRef.current.value = '';
        addLog('O estado da sessão foi reiniciado.', 'info');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const buffer = event.target?.result as ArrayBuffer;
                if (type === 'bin') {
                    setXdfFile(null); setSelectedMapName('');
                    setOriginalMap(null); setAxes(null);
                    
                    const checksum = generateChecksum(buffer);
                    setBinFile({ name: file.name, buffer, checksum });
                    addLog(`Ficheiro BIN carregado: ${file.name} (Checksum: ${checksum})`, 'success');
                } else { // XDF
                    const text = new TextDecoder().decode(buffer);
                    const definitions = parseXDF(text);
                    if (definitions.length === 0) {
                        throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    }
                    setXdfFile({ name: file.name, definitions });
                    const brandValue = selectedBrandForNewXdf === 'no-brand' ? '' : selectedBrandForNewXdf;
                    setActiveXdfBrand(brandValue);
                    addLog(`Ficheiro XDF carregado: ${file.name} com ${definitions.length} mapas.`, 'success');

                    // Add to library
                    try {
                        const newLibrary = { ...xdfLibrary, [file.name]: { name: file.name, content: text, brand: brandValue }};
                        setXdfLibrary(newLibrary);
                        localStorage.setItem('xdfLibrary', JSON.stringify(newLibrary));
                        setSelectedXdfFromLibrary(file.name);
                        addLog(`"${file.name}" ${brandValue ? `(Marca: ${brandValue}) `: ''}adicionado à biblioteca XDF.`, 'info');
                    } catch (error) {
                        addLog('Não foi possível guardar o XDF na biblioteca (pode estar cheia).', 'error');
                        toast({ variant: 'destructive', title: "Biblioteca Cheia", description: "Não foi possível guardar o XDF na biblioteca." });
                    }
                }
            } catch (error) {
                addLog(`Erro ao analisar ${file.name}: ${(error as Error).message}`, 'error');
                if (type === 'xdf') {
                    setIsXdfErrorModalOpen(true);
                } else {
                    const msg = `Erro ao carregar ${file.name}: ${(error as Error).message}`;
                    toast({ variant: 'destructive', title: "Erro no Ficheiro", description: msg });
                }
            }
        };
        reader.onerror = () => {
             addLog(`Erro ao ler o ficheiro ${file.name}`, 'error');
             toast({ variant: 'destructive', title: "Erro no Ficheiro", description: `Não foi possível ler o ficheiro ${file.name}` });
        }
        reader.readAsArrayBuffer(file);
    };
    
    const handleSelectXdfFromLibrary = (name: string) => {
        if (!name || !xdfLibrary[name]) return;
        
        const xdfData = xdfLibrary[name];
        if (!xdfData) return;
        try {
            const definitions = parseXDF(xdfData.content);
            if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada.");
            
            setSelectedMapName(''); setOriginalMap(null); setAxes(null);

            setXdfFile({ name, definitions });
            setSelectedXdfFromLibrary(name);
            setActiveXdfBrand(xdfData.brand || '');
            addLog(`XDF "${name}" ${xdfData.brand ? `(Marca: ${xdfData.brand}) `: ''}carregado da biblioteca.`, 'success');
        } catch (error) {
            addLog(`Erro ao carregar ${name} da biblioteca: ${(error as Error).message}`, 'error');
            setIsXdfErrorModalOpen(true);
            setXdfFile(null);
        }
    }
    
    const handleClearXdfLibrary = () => {
        setXdfLibrary({});
        localStorage.removeItem('xdfLibrary');
        setXdfFile(null);
        setSelectedXdfFromLibrary('');
        setActiveXdfBrand('');
        addLog('Biblioteca XDF limpa.', 'info');
        toast({ title: 'Biblioteca Limpa', description: 'A sua biblioteca de ficheiros XDF foi removida.' });
    }

    const handleMapSelect = (name: string) => {
        if (!binFile || !xdfFile || !name) return;
        
        const definition = availableMaps.find(d => d.name === name);
        if (!definition || !definition.xAxisDef || !definition.yAxisDef) {
            addLog(`Definição de mapa compatível "${name}" não encontrada ou está incompleta.`, 'error');
            return;
        }

        setSelectedMapName(name);
        try {
            const map = readMapFromBin(binFile.buffer, definition);
            const tempEixoX = readAxisFromBin(binFile.buffer, definition.xAxisDef);
            const tempEixoY = readAxisFromBin(binFile.buffer, definition.yAxisDef);

            // The data is read as map[row][col], where row is Y-axis and col is X-axis.
            // This structure is preserved. The display component will handle the visual transposition.
            const mapAxes = {
              x: tempEixoX,
              y: tempEixoY,
              xLabel: definition.xAxisDef.label,
              yLabel: definition.yAxisDef.label,
            };
            
            setOriginalMap(map);
            
            if (binFile?.checksum) {
              const userAxes = customAxes[binFile.checksum]?.[name];
              if (userAxes) {
                  setAxes({ ...mapAxes, x: userAxes.x, y: userAxes.y });
                  addLog(`Eixos personalizados carregados para o mapa "${name}".`, 'info');
              } else {
                  setAxes(mapAxes);
              }
            } else {
              setAxes(mapAxes);
            }
            
            addLog(`Mapa carregado com sucesso: ${name}`, 'success');

        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
        }
    };
    
    const handleConfirmAxes = (newAxesData: { y: string, x: string }) => {
        if (!axes || !selectedMapName) return;
        
        const newY = newAxesData.y.split(',').map(s => { const n = parseFloat(s.trim()); return isNaN(n) ? s.trim() : n; });
        const newX = newAxesData.x.split(',').map(s => { const n = parseFloat(s.trim()); return isNaN(n) ? s.trim() : n; });

        if (newY.length !== axes.y.length || newX.length !== axes.x.length) {
            addLog('O número de valores dos eixos não corresponde às dimensões originais.', 'error');
            toast({ variant: 'destructive', title: "Erro nos Eixos", description: "O número de valores deve corresponder às dimensões originais." });
            return;
        }
        
        const newAxesState = { ...axes, x: newX, y: newY };
        setAxes(newAxesState);

        if (binFile?.checksum) {
          setCustomAxes(prev => ({
              ...prev,
              [binFile.checksum]: { ...(prev[binFile.checksum] || {}), [selectedMapName]: { x: newX, y: newY } }
          }));
          addLog('Eixos personalizados guardados para este ficheiro BIN.', 'success');
        } else {
          toast({ variant: 'destructive', title: "Erro", description: "Não foi possível guardar os eixos porque nenhum ficheiro BIN está carregado." });
          addLog('Não foi possível guardar os eixos personalizados: ficheiro BIN não carregado.', 'error');
        }
        
        setIsAxesModalOpen(false);
        addLog('Eixos do mapa atualizados.', 'success');
    };

    const handleValidateMap = async () => {
        if (!originalMap || !axes || !selectedMapName || !binFile || !xdfFile) return;

        setIsValidatingMap(true);
        addLog(`A iniciar a análise do tipo de mapa para "${selectedMapName}"...`, 'info');

        const numericXAxis = axes.x.filter(v => typeof v === 'number') as number[];
        const numericYAxis = axes.y.filter(v => typeof v === 'number') as number[];

        if(numericXAxis.length !== axes.x.length || numericYAxis.length !== axes.y.length) {
            addLog('A validação de mapa requer eixos puramente numéricos.', 'error');
            toast({ variant: 'destructive', title: 'Falha na Validação', description: 'Os eixos devem ser numéricos para a validação do tipo de mapa.' });
            setIsValidatingMap(false);
            return;
        }

        const result = await validateMapType({
            mapName: selectedMapName,
            mapData: originalMap,
            xAxis: numericXAxis,
            yAxis: numericYAxis,
        });

        setIsValidatingMap(false);

        if (result.success && result.data) {
            setAnalysisResult(result.data);
            setIsAnalysisModalOpen(true);
            addLog(`Análise de tipo de mapa concluída. Confiança: ${result.data.confidence}.`, 'success');

            const { suggestedEquation, suggestedXAxisEquation, suggestedYAxisEquation } = result.data;
            const hasSuggestion = suggestedEquation || suggestedXAxisEquation || suggestedYAxisEquation;

            if (hasSuggestion) {
                const currentDef = xdfFile.definitions.find(d => d.name === selectedMapName);
                if (!currentDef) return;

                const newDefinition = JSON.parse(JSON.stringify(currentDef)) as XDFDefinition;
                if (suggestedEquation && newDefinition) newDefinition.equation = suggestedEquation;
                if (suggestedXAxisEquation && newDefinition.xAxisDef) newDefinition.xAxisDef.equation = suggestedXAxisEquation;
                if (suggestedYAxisEquation && newDefinition.yAxisDef) newDefinition.yAxisDef.equation = suggestedYAxisEquation;
                
                try {
                    const correctedMapPreview = readMapFromBin(binFile.buffer, newDefinition);
                    const correctedXAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
                    const correctedYAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);

                    const correctedAxesPreview = {
                        x: correctedXAxisPreview,
                        y: correctedYAxisPreview,
                        xLabel: newDefinition.xAxisDef?.label || 'Eixo X',
                        yLabel: newDefinition.yAxisDef?.label || 'Eixo Y'
                    };

                    setAiSuggestion({
                        reasoning: result.data.reasoning,
                        originalMap,
                        originalAxes: axes,
                        correctedMap: correctedMapPreview,
                        correctedAxes: correctedAxesPreview,
                        newDefinition,
                    });
                    setIsSuggestionModalOpen(true);
                    addLog('A IA propôs uma correção para as equações do mapa.', 'info');

                } catch (error) {
                    addLog(`Erro ao gerar a pré-visualização da IA: ${(error as Error).message}`, 'error');
                    toast({ variant: 'destructive', title: 'Erro na Pré-visualização', description: 'Não foi possível gerar a pré-visualização da sugestão da IA.' });
                }
            }
        } else {
            addLog(`A análise do tipo de mapa falhou: ${result.error}`, 'error');
            toast({ variant: 'destructive', title: 'Falha na Análise do Mapa', description: result.error });
        }
    };
    
    const handleAcceptSuggestion = () => {
        if (!aiSuggestion || !xdfFile) return;

        setOriginalMap(aiSuggestion.correctedMap);
        setAxes(aiSuggestion.correctedAxes);
        
        const newDefinitions = xdfFile.definitions.map(def => 
            def.name === selectedMapName ? aiSuggestion.newDefinition : def
        );
        setXdfFile({ ...xdfFile, definitions: newDefinitions });
        
        addLog(`Correção da IA aplicada ao mapa "${selectedMapName}".`, 'success');
        toast({ title: 'Correção Aplicada', description: 'O mapa foi atualizado com a sugestão da IA.' });

        setIsSuggestionModalOpen(false);
        setAiSuggestion(null);
    };

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
                                        
                                        <div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Marca para novo XDF</Label>
                                                <Select value={selectedBrandForNewXdf} onValueChange={setSelectedBrandForNewXdf}>
                                                    <SelectTrigger className="h-10"><SelectValue placeholder="Marca..." /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="no-brand">Nenhuma</SelectItem>
                                                        <SelectItem value="Yamaha">Yamaha</SelectItem>
                                                        <SelectItem value="Honda">Honda</SelectItem>
                                                        <SelectItem value="Suzuki">Suzuki</SelectItem>
                                                        <SelectItem value="Kawasaki">Kawasaki</SelectItem>
                                                        <SelectItem value="BMW">BMW</SelectItem>
                                                        <SelectItem value="Ducati">Ducati</SelectItem>
                                                        <SelectItem value="Triumph">Triumph</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="w-full" onClick={() => xdfInputRef.current?.click()}><Plus className="mr-2"/> Adicionar novo .XDF à biblioteca</Button>
                                    <Input ref={xdfInputRef} type="file" accept=".xdf" onChange={(e) => handleFileChange(e, 'xdf')} className="hidden" />
                                    {binFile && <p className="text-xs text-green-400 truncate">BIN: {binFile.name}</p>}
                                    
                                    {Object.keys(xdfLibrary).length > 0 && (
                                        <div className="space-y-2 pt-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs text-muted-foreground">Ou use um da biblioteca</Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearXdfLibrary}>
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Limpar Biblioteca XDF</p></TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Select onValueChange={handleSelectXdfFromLibrary} value={selectedXdfFromLibrary}>
                                                <SelectTrigger><SelectValue placeholder="Selecione um XDF..." /></SelectTrigger>
                                                <SelectContent>
                                                    {Object.values(xdfLibrary).map(xdf => (
                                                        <SelectItem key={xdf.name} value={xdf.name}>
                                                            {xdf.brand && <span className="font-semibold mr-1">[{xdf.brand}]</span>}
                                                            {xdf.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {xdfFile && <p className="text-xs text-green-400 truncate">XDF Ativo: {xdfFile.name}{activeXdfBrand && ` (${activeXdfBrand})`}</p>}
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">2. Selecionar Mapa</h3>
                                    <Select onValueChange={handleMapSelect} disabled={!xdfFile || availableMaps.length === 0} value={selectedMapName}>
                                        <SelectTrigger><SelectValue placeholder={!xdfFile ? "Carregue um ficheiro XDF" : "Selecione um mapa compatível"} /></SelectTrigger>
                                        <SelectContent>
                                            {availableMaps.map(def => (<SelectItem key={def.name} value={def.name}>{def.name}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">3. Ferramentas</h3>
                                    <Button variant="outline" className="w-full" onClick={() => setIsAxesModalOpen(true)} disabled={!originalMap}>Editar Eixos</Button>
                                     <Button variant="default" size="sm" className="w-full" onClick={handleValidateMap} disabled={!originalMap || isValidatingMap}>
                                        {isValidatingMap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                        Analisar e Corrigir Mapa
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
                                            <div key={log.id} className="flex items-start gap-2">
                                                <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                                                <span className={cn('min-w-0 break-words', {
                                                    'text-green-400': log.type === 'success',
                                                    'text-red-400': log.type === 'error',
                                                    'text-yellow-400': log.type === 'debug',
                                                })}>{log.message}</span>
                                            </div>
                                        ))}
                                        <div ref={logEndRef} />
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
                                    <MapTable mapData={originalMap} xAxis={axes.x} yAxis={axes.y} xAxisLabel={axes.xLabel} yAxisLabel={axes.yLabel}/>
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
                <EditAxesModal open={isAxesModalOpen} onOpenChange={setIsAxesModalOpen} onConfirm={handleConfirmAxes} currentAxes={axes} />
                <MapAnalysisResultModal open={isAnalysisModalOpen} onOpenChange={setIsAnalysisModalOpen} result={analysisResult} />
                <MapCorrectionSuggestionModal open={isSuggestionModalOpen} onOpenChange={setIsSuggestionModalOpen} suggestion={aiSuggestion} onAccept={handleAcceptSuggestion} />
                <AlertDialog open={isXdfErrorModalOpen} onOpenChange={setIsXdfErrorModalOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Não Foi Possível Ler o Ficheiro XDF</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4 pt-4">
                                <div>A aplicação não conseguiu processar este ficheiro. Isto acontece frequentemente por uma das seguintes razões:</div>
                                <ul className="list-disc pl-5 space-y-2 text-sm">
                                    <li><strong>Protegido por Senha:</strong> O ficheiro pode estar encriptado. A aplicação não consegue ler XDFs protegidos por senha.</li>
                                    <li><strong>Corrompido ou Inválido:</strong> O ficheiro pode não ser um XDF válido ou pode estar danificado.</li>
                                </ul>
                                <div className="font-semibold pt-2">Solução Recomendada:</div>
                                <div>Se o ficheiro estiver protegido, por favor, use o software original (como o TunerPro) para o abrir com a senha e, em seguida, guarde uma nova versão <strong>sem</strong> proteção. Depois, carregue o ficheiro desprotegido aqui.</div>
                            </div>
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogAction onClick={() => setIsXdfErrorModalOpen(false)}>Entendido</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TooltipProvider>
    );
}

function EditAxesModal({ open, onOpenChange, onConfirm, currentAxes }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: (axes: { x: string, y: string }) => void, currentAxes: { x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null }) {
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
                        <Label htmlFor="yAxisText">Eixo Y ({currentAxes?.yLabel || 'e.g. RPM'})</Label>
                        <Input id="yAxisText" value={yAxis} onChange={e => setYAxis(e.target.value)} placeholder="e.g. 800, 1000, 1200..." />
                    </div>
                    <div>
                        <Label htmlFor="xAxisText">Eixo X ({currentAxes?.xLabel || 'e.g. Carga/TPS'})</Label>
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

function MapAnalysisResultModal({ open, onOpenChange, result }: { open: boolean, onOpenChange: (open: boolean) => void, result: { confidence: string; suspectedType: string; reasoning: string; } | null }) {
    const getConfidenceBadgeVariant = (confidence: string | undefined) => {
        switch (confidence) {
            case 'Alta': return 'default';
            case 'Média': return 'secondary';
            case 'Baixa': return 'destructive';
            default: return 'outline';
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="text-primary"/>
                        Resultado da Análise do Mapa pela IA
                    </DialogTitle>
                    <DialogDescription>
                        A IA analisou a forma e os padrões dos dados do mapa para fornecer uma segunda opinião.
                    </DialogDescription>
                </DialogHeader>
                {result && (
                    <div className="space-y-4 pt-4">
                        <div className="flex items-center gap-4">
                             <h3 className="text-sm font-semibold text-muted-foreground">Confiança:</h3>
                             <Badge variant={getConfidenceBadgeVariant(result.confidence)} className="text-base">{result.confidence}</Badge>
                        </div>
                         <div className="flex items-center gap-4">
                             <h3 className="text-sm font-semibold text-muted-foreground">Tipo Suspeito:</h3>
                             <p className="font-semibold">{result.suspectedType}</p>
                        </div>
                        <div>
                             <h3 className="text-sm font-semibold text-muted-foreground mb-2">Justificação da IA:</h3>
                             <p className="text-sm p-3 bg-muted rounded-md border">{result.reasoning}</p>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MapCorrectionSuggestionModal({ open, onOpenChange, suggestion, onAccept }: { open: boolean, onOpenChange: (open: boolean) => void, suggestion: AISuggestion | null, onAccept: () => void }) {
    if (!suggestion) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCompareArrows className="text-primary"/>
                        Sugestão de Correção da IA
                    </DialogTitle>
                    <DialogDescription>
                        A IA detetou um problema e sugere a seguinte correção. Compare os mapas e aceite se a correção parecer adequada.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 -mx-6">
                    <div className="px-6">
                        <div className="space-y-2 mt-2">
                            <h3 className="text-sm font-semibold text-muted-foreground">Justificação da IA:</h3>
                            <p className="text-sm p-3 bg-muted rounded-md border">{suggestion.reasoning}</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 mt-4">
                            <div className="flex flex-col gap-2">
                                <h3 className="font-semibold text-center">Mapa Original</h3>
                                <Card className="flex-1 flex flex-col min-h-[40vh]">
                                <MapTable mapData={suggestion.originalMap} xAxis={suggestion.originalAxes.x} yAxis={suggestion.originalAxes.y} xAxisLabel={suggestion.originalAxes.xLabel} yAxisLabel={suggestion.originalAxes.yLabel} />
                                </Card>
                            </div>
                            <div className="flex flex-col gap-2">
                                <h3 className="font-semibold text-center">Mapa Corrigido (Sugestão)</h3>
                                <Card className="flex-1 flex flex-col border-primary min-h-[40vh]">
                                <MapTable mapData={suggestion.correctedMap} xAxis={suggestion.correctedAxes.x} yAxis={suggestion.correctedAxes.y} xAxisLabel={suggestion.correctedAxes.xLabel} yAxisLabel={suggestion.correctedAxes.yLabel} />
                                </Card>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter className="mt-4 pt-4 border-t">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Rejeitar</Button>
                    <Button onClick={onAccept}>
                        <CheckCircle className="mr-2"/>
                        Aceitar Sugestão
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
