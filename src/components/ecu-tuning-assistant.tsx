
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, AxisDefinition, AxisDataState } from '@/lib/types';
import { parseXDF, readAndCalculateMapFromBin, generateChecksum, bufferToHex, writeMapToBin, recalculateRawMapFromCalculated } from '@/lib/ecu';
import { validateMapType, findPotentialMaps, explainMap, generateSpeech } from '@/app/actions';
import { getHeatmapColor } from '@/lib/colors';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowUpNarrowWide, CheckCircle, FileUp, GitCompareArrows, Loader2, Pencil, RefreshCw, Save, Sparkles, Table, Undo2, Box, LineChart } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import dynamic from 'next/dynamic';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

const LinePlot2D = dynamic(() => import('@/components/line-plot'), {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});


function EditableMapCell({ value: initialValue, valueFormat, isEditable, onCellChange, rawValue, viewMode, dataSize }: { 
    value: number | null, 
    onCellChange: (value: string) => void, 
    isEditable: boolean, 
    valueFormat: 'integer' | 'decimal', 
    rawValue: number | null, 
    viewMode: 'calculated' | 'raw',
    dataSize: number
}) {
  const formatValue = useCallback((val: number | null) => {
    if (viewMode === 'raw') {
        if (val === null || isNaN(val)) return '';
        if (dataSize === 1) return val.toString(16).toUpperCase().padStart(2, '0');
        return val.toString(16).toUpperCase().padStart(4, '0');
    }

    if (val === null || isNaN(val)) return '';
    if (valueFormat === 'integer') {
      return Math.round(val).toString();
    }
    return String(Number(val.toFixed(3)));
  }, [valueFormat, viewMode, dataSize]);
    
  const [value, setValue] = useState(formatValue(viewMode === 'raw' ? rawValue : initialValue));

  useEffect(() => {
    setValue(formatValue(viewMode === 'raw' ? rawValue : initialValue));
  }, [initialValue, rawValue, viewMode, formatValue]);
  
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isEditable) {
      onCellChange(e.target.value);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
  }

  const effectiveIsEditable = isEditable && viewMode === 'calculated';

  return (
    <Input
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      readOnly={!effectiveIsEditable}
      className={cn(
          "w-[60px] h-8 p-0 text-center bg-transparent border-none rounded-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background/80",
          !effectiveIsEditable && "cursor-default focus-visible:ring-0"
      )}
      inputMode={!effectiveIsEditable ? 'none' : 'decimal'}
    />
  );
}


function MapTable({
  mapData,
  rawMapData,
  xAxis,
  yAxis,
  definition,
  onSortAxis,
  onResetSort,
  onCellChange,
  isEditable = true,
  valueFormat = 'decimal',
  selectedCells,
  onCellSelect,
  viewMode,
  onViewModeChange,
}: {
  mapData: MapData;
  rawMapData: MapData;
  xAxis: AxisDataState;
  yAxis: AxisDataState;
  definition: XDFDefinition | undefined;
  onSortAxis: (axis: 'x' | 'y') => void;
  onResetSort: () => void;
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
  isEditable?: boolean;
  valueFormat?: 'integer' | 'decimal';
  selectedCells: Set<string>;
  onCellSelect: (rowIndex: number, colIndex: number, isCtrlOrCmd: boolean) => void;
  viewMode: 'calculated' | 'raw';
  onViewModeChange?: (isRaw: boolean) => void;
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

  const yAxisFormatter = (val: string | number) => {
    if (typeof val !== 'number' || isNaN(val)) return val;
    return val.toFixed(1);
  };
  
  const xAxisFormatter = (val: string | number) => {
    if (typeof val !== 'number' || isNaN(val)) return val;
    return Math.round(val);
  };

  if (!mapData || mapData.length === 0 || !definition || !xAxis || !yAxis) {
    return null;
  }
  
  const Address = ({ addr }: { addr: number | null | undefined }) => {
    if (addr === null || addr === undefined || isNaN(addr) || addr === 0) return null;
    return <span className="ml-1 font-mono text-xs text-muted-foreground">(0x{addr.toString(16).toUpperCase()})</span>;
  };

  return (
    <div className="overflow-auto relative flex-1">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-card">
            <th className="sticky top-0 left-0 z-30 bg-card p-1 border border-border text-left">
                <div className="flex flex-col h-full">
                    <div className="flex flex-col justify-center">
                        <div className="font-semibold text-foreground truncate" title={definition.name}>
                            Z: {definition.name}<Address addr={definition.address} />
                        </div>
                        <div className="text-muted-foreground truncate" title={yAxis.label}>
                            <span className="font-semibold">Y:</span> {yAxis.label}
                            <Address addr={definition.yAxisDef?.address} />
                        </div>
                         <div className="text-muted-foreground truncate" title={xAxis.label}>
                            <span className="font-semibold">X:</span> {xAxis.label}
                             <Address addr={definition.xAxisDef?.address} />
                        </div>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                        {onViewModeChange && (
                           <div className="flex items-center">
                                <Label htmlFor="view-mode-switch" className="text-xs">Hex</Label>
                                <Switch 
                                    id="view-mode-switch"
                                    className="h-4 w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3.5"
                                    checked={viewMode === 'raw'}
                                    onCheckedChange={onViewModeChange}
                                />
                            </div>
                        )}
                        {isEditable && (
                           <>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSortAxis('y')}><ArrowUpNarrowWide className="h-4 w-4" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ordenar o eixo Y e alinhar os dados das linhas em conformidade.</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSortAxis('x')}><ArrowUpNarrowWide className="h-4 w-4 rotate-90" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ordenar o eixo X e alinhar os dados das colunas em conformidade.</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetSort}><Undo2 className="h-4 w-4" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Restaurar ordem original</p></TooltipContent>
                                </Tooltip>
                            </>
                        )}
                    </div>
                </div>
            </th>
            {xAxis.calculated.map((x, i) => (
              <th key={`head-x-${i}`} className="sticky top-0 z-20 bg-card p-1 border border-border font-semibold text-center min-w-[60px]">
                {xAxisFormatter(x)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yAxis.calculated.map((y, yi) => (
            <tr key={`row-${yi}`}>
              <td className="sticky left-0 z-20 p-1 border border-border bg-card font-semibold text-center min-w-[60px] w-[60px]">
                 {yAxisFormatter(y)}
              </td>
              {mapData[yi]?.map((cellValue, xi) => {
                const isSelected = selectedCells.has(`${yi}-${xi}`);
                return (
                  <td 
                    key={`cell-container-${yi}-${xi}`}
                    className={cn(
                        "p-0 border border-border text-center relative",
                        isSelected && "ring-2 ring-primary ring-inset z-10"
                    )}
                    style={{ backgroundColor: getHeatmapColor(cellValue, min, max) }}
                    onClick={(e) => isEditable && onCellSelect(yi, xi, e.ctrlKey || e.metaKey)}
                  >
                    <EditableMapCell
                      value={cellValue}
                      rawValue={rawMapData?.[yi]?.[xi] ?? null}
                      onCellChange={(value) => onCellChange(yi, xi, value)}
                      isEditable={isEditable}
                      valueFormat={valueFormat}
                      viewMode={viewMode}
                      dataSize={definition.dataSize}
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

// Type for AI Correction Suggestion
type AISuggestion = {
    reasoning: string;
    originalMap: MapData;
    correctedMap: MapData;
    originalAxes: { x: (string | number)[]; y: (string | number)[], xLabel: string; yLabel: string; };
    correctedAxes: { x: (string | number)[]; y: (string | number)[], xLabel: string; yLabel: string; };
    newDefinition: XDFDefinition;
    originalDefinition: XDFDefinition;
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
    const [selectedCells, setSelectedCells] = useState(new Set<string>());

    // State for map data. "working" is the editable source of truth, "display" is for rendering (can be sorted)
    const [rawMap, setRawMap] = useState<MapData | null>(null);
    const [workingMap, setWorkingMap] = useState<MapData | null>(null);
    const [sourceAxes, setSourceAxes] = useState<{ x: AxisDataState, y: AxisDataState } | null>(null);
    const [displayMap, setDisplayMap] = useState<MapData | null>(null);
    const [displayRawMap, setDisplayRawMap] = useState<MapData | null>(null);
    const [displayAxes, setDisplayAxes] = useState<{ x: AxisDataState, y: AxisDataState } | null>(null);
    const [mapRenderKey, setMapRenderKey] = useState(0);
    const [mapViewMode, setMapViewMode] = useState<'calculated' | 'raw'>('calculated');
    const [isEndianSwapped, setIsEndianSwapped] = useState(false);

    // AI state
    const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
    const [mapValidationStatus, setMapValidationStatus] = useState<'idle' | 'loading' | 'valid' | 'suggestion' | 'error'>('idle');

    // Modal state
    const [isAxesModalOpen, setIsAxesModalOpen] = useState(false);
    const [isXdfErrorModalOpen, setIsXdfErrorModalOpen] = useState(false);
    const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
    const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
    const [mapToEdit, setMapToEdit] = useState<XDFDefinition | null>(null);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);

    const valueFormat = useMemo<'integer' | 'decimal'>(() => {
        if (!selectedMapName) return 'decimal';
        const lowerCaseName = selectedMapName.toLowerCase();
        const decimalKeywords = ['ignição', 'ignition', 'avanço', 'spark', 'timing', 'comb', 'fuel', 'injeção'];
        if (decimalKeywords.some(keyword => lowerCaseName.includes(keyword))) return 'decimal';
        const integerKeywords = ['tps', 'map', 've', 'etv', 'borboleta'];
        if (integerKeywords.some(keyword => lowerCaseName.includes(keyword))) return 'integer';
        return 'decimal';
    }, [selectedMapName]);

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        if (type === 'debug' && !debugMode) return;
        const id = `${Date.now()}-${Math.random()}`;
        setLogs(prev => [...prev, { id, timestamp: new Date().toLocaleTimeString(), message, type }]);
    }, [debugMode]);
    
    const visibleLogs = useMemo(() => {
        return debugMode ? logs : logs.filter(log => log.type !== 'debug');
    }, [logs, debugMode]);

    useEffect(() => {
        if (!binFile) {
            setAvailableMaps([]);
            return;
        }

        const binSize = binFile.buffer.byteLength;
        const validDefinitions: XDFDefinition[] = [];
        let invalidCount = 0;

        if (xdfFile) {
            xdfFile.definitions.forEach(def => {
                let isInvalid = false;
                const mapEndAddr = def.address + (def.rows * def.cols * def.dataSize);
                if (mapEndAddr > binSize || def.address < 0) isInvalid = true;
                if (isInvalid) invalidCount++;
                else validDefinitions.push(def);
            });
        }
        
        const finalMapNames = new Set<string>();
        const uniqueCombinedMaps = validDefinitions.map(def => {
            let newName = def.name;
            if (finalMapNames.has(newName)) {
                let count = 2;
                do { newName = `${def.name} (${count})`; count++; } while (finalMapNames.has(newName));
            }
            finalMapNames.add(newName);
            return { ...def, name: newName };
        });

        setAvailableMaps(uniqueCombinedMaps);

        if (selectedMapName && !uniqueCombinedMaps.some(def => def.name === selectedMapName)) {
            setSelectedMapName('');
            setDisplayMap(null);
            setDisplayRawMap(null);
            setDisplayAxes(null);
        }

        if (invalidCount > 0) {
            const totalCount = xdfFile?.definitions.length || 0;
            const warningMsg = `${invalidCount} de ${totalCount} definições de mapa são incompatíveis com o ficheiro BIN e foram ocultadas.`;
            addLog(warningMsg, 'error');
            toast({ variant: 'destructive', title: "Aviso de Compatibilidade", description: warningMsg, duration: 8000 });
        }
    }, [binFile, xdfFile, addLog, toast, selectedMapName]);


    const resetState = useCallback(() => {
        setBinFile(null); 
        setXdfFile(null); 
        setSelectedMapName('');
        setRawMap(null); 
        setWorkingMap(null); 
        setSourceAxes(null);
        setDisplayMap(null); 
        setDisplayRawMap(null);
        setDisplayAxes(null);
        setMapValidationStatus('idle');
        setAiSuggestion(null);
        setAvailableMaps([]);
        setSelectedCells(new Set());
        setLogs([]);
        setIsEndianSwapped(false);

        if (binInputRef.current) binInputRef.current.value = '';
        if (xdfInputRef.current) xdfInputRef.current.value = '';
        addLog('O estado da sessão foi reiniciado.', 'info');
    }, [addLog]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const buffer = event.target?.result;
                if (!buffer) throw new Error("Não foi possível ler o conteúdo do ficheiro.");

                if (type === 'bin') {
                    if (!(buffer instanceof ArrayBuffer)) throw new Error("O ficheiro BIN não foi lido como ArrayBuffer.");
                    
                    // Reset everything when a new BIN is loaded
                    resetState();
                    
                    const checksum = generateChecksum(buffer);
                    setBinFile({ name: file.name, buffer, checksum });
                    addLog(`Ficheiro BIN carregado: ${file.name}`, 'success');

                } else { // XDF
                    if (typeof buffer !== 'string') throw new Error("O ficheiro XDF não foi lido como texto.");
                    const { definitions, brand } = parseXDF(buffer);
                    if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    if (brand) addLog(`Marca da ECU detetada no XDF: ${brand}`, 'info');
                    setXdfFile({ name: file.name, definitions: definitions });
                    addLog(`Ficheiro XDF carregado: ${file.name} com ${definitions.length} mapas.`, 'success');
                }
            } catch (error) {
                const msg = `Erro ao carregar ${file.name}: ${(error as Error).message}`;
                addLog(msg, 'error');
                if (type === 'xdf') setIsXdfErrorModalOpen(true);
                else toast({ variant: 'destructive', title: "Erro no Ficheiro", description: msg });
            }
        };
        reader.onerror = () => {
             addLog(`Erro ao ler o ficheiro ${file.name}`, 'error');
             toast({ variant: 'destructive', title: "Erro no Ficheiro", description: `Não foi possível ler o ficheiro ${file.name}` });
        }
        
        if (type === 'xdf') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    };

    const handleMapSelect = useCallback((name: string) => {
        if (!binFile || !name) return;
        
        const definition = availableMaps.find(d => d.name === name);
        if (!definition) {
            addLog(`Definição de mapa "${name}" não encontrada.`, 'error');
            return;
        }
        
        setMapValidationStatus('idle');
        setAiSuggestion(null);
        setSelectedMapName(name);
        setSelectedCells(new Set());

        try {
            const { calculatedMap, rawMap: newRawMap, sortedAxes } = readAndCalculateMapFromBin(binFile.buffer, definition, isEndianSwapped);
            
            setWorkingMap(calculatedMap);
            setRawMap(newRawMap); 
            setSourceAxes(sortedAxes);
            
            setDisplayMap(calculatedMap);
            setDisplayRawMap(newRawMap);
            setDisplayAxes(sortedAxes);

            addLog(`Mapa carregado: ${name}.`, 'info');
            setMapRenderKey(p => p + 1);
            
        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
            setDisplayMap(null);
            setDisplayRawMap(null);
            setDisplayAxes(null);
        }
    }, [binFile, availableMaps, addLog, toast, isEndianSwapped]);
    
    const handleConfirmAxes = useCallback((data: { xEquation: string, yEquation: string, zEquation: string }) => {
        if (!selectedMapName || !binFile) return;

        const currentDef = availableMaps.find(d => d.name === selectedMapName);
        if (!currentDef || !currentDef.xAxisDef || !currentDef.yAxisDef) {
            const msg = `Definição de mapa ou de eixo para "${selectedMapName}" não encontrada para recálculo.`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Recálculo", description: msg });
            return;
        }
        
        const newDef = JSON.parse(JSON.stringify(currentDef)) as XDFDefinition;
        newDef.equation = data.zEquation;
        newDef.xAxisDef.equation = data.xEquation;
        newDef.yAxisDef.equation = data.yEquation;
        
        const newAvailableMaps = availableMaps.map(def => 
            def.name === selectedMapName ? newDef : def
        );
        
        setAvailableMaps(newAvailableMaps);
        
        setTimeout(() => {
            handleMapSelect(selectedMapName);
            addLog(`Equações atualizadas para "${selectedMapName}".`, 'success');
            setIsAxesModalOpen(false);
            toast({ title: 'Equações Aplicadas', description: 'O mapa foi recalculado com as novas equações.' });
        }, 0);

    }, [selectedMapName, availableMaps, binFile, handleMapSelect, addLog, toast]);

    const handleSortAxis = (axis: 'x' | 'y') => {
        if (!displayMap || !displayAxes || !displayRawMap) return;
    
        const newAxes = JSON.parse(JSON.stringify(displayAxes));
        const axisState = axis === 'x' ? newAxes.x : newAxes.y;
    
        const indexed = axisState.calculated.map((value: any, index: any) => ({ value, originalIndex: index }));
        indexed.sort((a: any, b: any) => {
            const valA = Number(a.value);
            const valB = Number(b.value);
            if (!isNaN(valA) && !isNaN(valB)) return valA - valB;
            return String(a.value).localeCompare(String(b.value));
        });
    
        const sortedIndices = indexed.map((item: any) => item.originalIndex);
        axisState.calculated = indexed.map((item: any) => item.value);
    
        let newDisplayMap, newDisplayRawMap;
    
        if (axis === 'y') {
            newDisplayMap = sortedIndices.map((originalIndex: any) => displayMap[originalIndex]);
            newDisplayRawMap = sortedIndices.map((originalIndex: any) => displayRawMap[originalIndex]);
        } else { // axis === 'x'
            newDisplayMap = displayMap.map(row => sortedIndices.map((originalIndex: any) => row[originalIndex]));
            newDisplayRawMap = displayRawMap.map(row => sortedIndices.map((originalIndex: any) => row[originalIndex]));
        }
        
        setDisplayAxes(newAxes);
        setDisplayMap(newDisplayMap);
        setDisplayRawMap(newDisplayRawMap);
        setMapRenderKey(p => p + 1);
        addLog(`Eixo ${axis.toUpperCase()} ordenado.`, 'info');
    };

    const handleResetSort = () => {
        if (workingMap && rawMap && sourceAxes) {
            setDisplayMap(workingMap);
            setDisplayRawMap(rawMap);
            setDisplayAxes(sourceAxes);
            setSelectedCells(new Set());
            setMapRenderKey(p => p + 1);
            addLog('Ordenação do mapa revertida para o original.', 'info');
        }
    };
    
    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
      if (!workingMap || !displayMap || !displayAxes || !rawMap || !sourceAxes) return;

      const newValue = parseFloat(value);
      if (isNaN(newValue)) {
        addLog(`Valor inválido introduzido: "${value}". Apenas números são permitidos.`, 'error');
        setMapRenderKey(p => p + 1);
        return;
      }
      
      const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
      newWorkingMap[rowIndex][colIndex] = newValue;
      setWorkingMap(newWorkingMap);

      const newDisplayMap = JSON.parse(JSON.stringify(displayMap));
      newDisplayMap[rowIndex][colIndex] = newValue;
      setDisplayMap(newDisplayMap);

      setMapValidationStatus('idle');
    };

    const handleCellSelect = useCallback((rowIndex: number, colIndex: number, isCtrlOrCmd: boolean) => {
        const newSelection = new Set(selectedCells);
        const key = `${rowIndex}-${colIndex}`;

        if (isCtrlOrCmd) {
            if (newSelection.has(key)) newSelection.delete(key);
            else newSelection.add(key);
        } else {
            newSelection.clear();
            newSelection.add(key);
        }
        setSelectedCells(newSelection);
    }, [selectedCells]);
    
    const handleSaveModifiedBin = () => {
        if (!binFile || !workingMap || !selectedMapName || !sourceAxes) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Nenhum ficheiro BIN ou mapa carregado para guardar.' });
            return;
        }
        const definition = availableMaps.find(d => d.name === selectedMapName);
        if (!definition) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível encontrar a definição do mapa selecionado.' });
            return;
        }

        addLog('A iniciar a modificação do ficheiro BIN...', 'info');

        try {
            const finalRawMap = recalculateRawMapFromCalculated(workingMap, definition, sourceAxes, isEndianSwapped);
            const modifiedBuffer = writeMapToBin(binFile.buffer, definition, finalRawMap, isEndianSwapped);
            const newChecksum = generateChecksum(modifiedBuffer);
            
            addLog(`Modificação concluída. Novo checksum: ${newChecksum}`, 'success');

            const blob = new Blob([modifiedBuffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const originalName = binFile.name.endsWith('.bin') ? binFile.name.slice(0, -4) : binFile.name;
            link.download = `${originalName}_modificado.bin`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            toast({ title: 'Sucesso!', description: `Ficheiro "${link.download}" guardado.` });

        } catch (error) {
            const msg = `Falha ao guardar o BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: 'Erro ao Guardar', description: msg });
        }
    };

    const handleOpenEditNameModal = () => {
        if (!selectedMapName) return;
        const map = availableMaps.find(m => m.name === selectedMapName);
        if (map) {
            setMapToEdit(map);
            setIsEditNameModalOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível encontrar o mapa para editar.' });
        }
    };

    const handleConfirmNameChange = (oldName: string, newName: string) => {
        const trimmedNewName = newName.trim();
        if (!trimmedNewName) {
            toast({ variant: 'destructive', title: 'Nome Inválido', description: 'O nome do mapa não pode estar vazio.' });
            return;
        }

        if (trimmedNewName !== oldName && availableMaps.some(m => m.name === trimmedNewName)) {
            toast({ variant: 'destructive', title: 'Nome Duplicado', description: 'Já existe um mapa com este nome.' });
            return;
        }

        setAvailableMaps(prev => prev.map(m => m.name === oldName ? { ...m, name: trimmedNewName } : m));
        setSelectedMapName(trimmedNewName);
        toast({ title: 'Nome Atualizado', description: `O mapa foi renomeado para "${trimmedNewName}".` });
        setIsEditNameModalOpen(false);
        setMapToEdit(null);
    };

    const handleToggleEndianness = () => {
        const newIsEndianSwapped = !isEndianSwapped;
        setIsEndianSwapped(newIsEndianSwapped);
        if (selectedMapName) handleMapSelect(selectedMapName);
        addLog(`Ordem de bytes de 16-bit invertida. Swap está ${newIsEndianSwapped ? 'ATIVO' : 'INATIVO'}.`, 'info');
    };


    const selectedMapDefinition = useMemo(() => {
        return availableMaps.find(m => m.name === selectedMapName);
    }, [availableMaps, selectedMapName]);

    const saveButton = (
        <Button onClick={handleSaveModifiedBin} disabled={!binFile || !workingMap}>
            <Save className="mr-2 h-4 w-4" />
            Guardar BIN Modificado
        </Button>
    );

    return (
        <TooltipProvider>
            <div className="flex h-screen flex-col gap-4 p-4">
                <main className="flex min-h-0 flex-1 flex-col gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Painel de Controlo</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">1. Carregar Ficheiros</h3>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Button variant="outline" className="w-full" onClick={() => binInputRef.current?.click()}>
                                            <FileUp className="mr-2 h-4 w-4" />
                                            Carregar .BIN
                                        </Button>
                                        <Input ref={binInputRef} type="file" accept=".bin" onChange={(e) => handleFileChange(e, 'bin')} className="hidden" />

                                        <Button variant="outline" className="w-full" onClick={() => xdfInputRef.current?.click()}>
                                            <FileUp className="mr-2 h-4 w-4" />
                                            Carregar .XDF
                                        </Button>
                                        <Input ref={xdfInputRef} type="file" accept=".xdf" onChange={(e) => handleFileChange(e, 'xdf')} className="hidden" />
                                    </div>
                                    <div className="space-y-1 pt-2 text-xs">
                                        {binFile && <p className="truncate text-green-400">BIN Ativo: {binFile.name}</p>}
                                        {xdfFile && <p className="truncate text-green-400">XDF Ativo: {xdfFile.name}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">2. Selecionar Mapa</h3>
                                    <div className="flex items-center gap-2">
                                        <Select onValueChange={handleMapSelect} disabled={!binFile || availableMaps.length === 0} value={selectedMapName} >
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder={!binFile ? "Carregue um ficheiro BIN" : availableMaps.length === 0 ? "Carregue um ficheiro XDF" : "Selecione um mapa"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableMaps.map(def => (
                                                  <SelectItem key={def.name} value={def.name}>
                                                      <div className="flex w-full items-center justify-between">
                                                          <span className="truncate">{def.name}</span>
                                                          <span className="ml-4 flex-shrink-0 font-mono text-xs text-muted-foreground">0x{def.address.toString(16).toUpperCase()}</span>
                                                      </div>
                                                  </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={handleOpenEditNameModal} disabled={!selectedMapName}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Editar Nome do Mapa</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Button variant="secondary" className="w-full" onClick={handleToggleEndianness} disabled={!selectedMapDefinition || selectedMapDefinition.dataSize !== 2}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Inverter Ordem de Bytes (Endian)
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">3. Corrigir Mapa (Opcional)</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Ajuste as equações se os eixos ou os valores dos dados parecerem incorretos.
                                    </p>
                                    <Button variant="secondary" className="w-full" onClick={() => setIsAxesModalOpen(true)} disabled={!displayMap}>
                                        <GitCompareArrows className="mr-2 h-4 w-4" />
                                        Corrigir Equações Man.
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">4. Sessão</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Reinicie o estado para começar do zero com novos ficheiros.
                                    </p>
                                    <Button onClick={resetState} variant="destructive" className="w-full">Reset</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="flex flex-1 flex-col min-h-0">
                        <CardHeader className="flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <CardTitle className="flex items-center gap-2">
                                        Visualizador de Mapas
                                        {mapValidationStatus === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                                        {mapValidationStatus === 'valid' && <Tooltip><TooltipTrigger><CheckCircle className="h-5 w-5 text-green-500" /></TooltipTrigger><TooltipContent>A IA confirmou que as equações parecem corretas.</TooltipContent></Tooltip>}
                                        {mapValidationStatus === 'suggestion' && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={() => setIsSuggestionModalOpen(true)}><Sparkles className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>A IA tem uma sugestão de correção. Clique para ver.</TooltipContent></Tooltip>}
                                        {mapValidationStatus === 'error' && <Tooltip><TooltipTrigger><AlertCircle className="h-5 w-5 text-destructive" /></TooltipTrigger><TooltipContent>A análise da IA falhou. Verifique o log.</TooltipContent></Tooltip>}
                                    </CardTitle>
                                    <CardDescription>
                                        {selectedMapDefinition ? <span dangerouslySetInnerHTML={{ __html: `${selectedMapDefinition.name} <span class="font-mono text-xs text-muted-foreground ml-2">(0x${selectedMapDefinition.address.toString(16).toUpperCase()})</span>` }} /> : "Carregue os ficheiros e selecione um mapa para começar"}
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col p-6 pt-0 min-h-0">
                            {displayMap && displayAxes ? (
                                <Tabs defaultValue="2d" className="flex flex-1 flex-col min-h-0 h-full">
                                    <TabsList className="mb-2 shrink-0">
                                        <TabsTrigger value="2d"><Table className="mr-2 h-4 w-4" />Tabela 2D</TabsTrigger>
                                        <TabsTrigger value="plot-2d"><LineChart className="mr-2 h-4 w-4" />Gráfico 2D</TabsTrigger>
                                        <TabsTrigger value="3d"><Box className="mr-2 h-4 w-4" />Gráfico 3D</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="2d" className="flex flex-1 flex-col min-h-0 overflow-hidden">
                                        <MapTable
                                            key={mapRenderKey}
                                            mapData={displayMap || []} 
                                            rawMapData={displayRawMap || []}
                                            xAxis={displayAxes.x} 
                                            yAxis={displayAxes.y} 
                                            definition={selectedMapDefinition}
                                            onSortAxis={handleSortAxis}
                                            onResetSort={handleResetSort}
                                            onCellChange={handleCellChange}
                                            valueFormat={valueFormat}
                                            selectedCells={selectedCells}
                                            onCellSelect={handleCellSelect}
                                            viewMode={mapViewMode}
                                            onViewModeChange={(isRaw) => setMapViewMode(isRaw ? 'raw' : 'calculated')}
                                        />
                                        <div className="border-t pt-4 flex justify-end mt-auto flex-shrink-0">
                                            {saveButton}
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="plot-2d" className="flex flex-1 flex-col min-h-0 overflow-hidden">
                                        <div className="flex-1 relative">
                                            <LinePlot2D mapData={displayMap} xAxis={displayAxes.x.calculated} yAxis={displayAxes.y.calculated} yAxisLabel={selectedMapDefinition?.yAxisDef?.label || 'Eixo Y'} xAxisLabel={selectedMapDefinition?.xAxisDef?.label || 'Eixo X'} sliceIndex={0} className="absolute inset-0" />
                                        </div>
                                        <div className="border-t pt-4 flex justify-end mt-auto flex-shrink-0">
                                            {saveButton}
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="3d" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                      <div className="flex-1 relative">
                                        <SurfacePlot3D key={mapRenderKey + '-3d'} mapData={displayMap} xAxis={displayAxes.x.calculated} yAxis={displayAxes.y.calculated} xAxisLabel={selectedMapDefinition?.xAxisDef?.label || 'Eixo X'} yAxisLabel={selectedMapDefinition?.yAxisDef?.label || 'Eixo Y'}/>
                                      </div>
                                    </TabsContent>
                                </Tabs>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-12">
                                    <FileUp className="w-16 h-16 mb-4"/>
                                    <p className="font-semibold">Nenhum mapa carregado</p>
                                    <p className="text-sm">Por favor carregue um ficheiro .BIN e um .XDF para começar.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="flex-shrink-0">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Log de Operações</CardTitle>
                                <div className="flex items-center space-x-2">
                                    <Label htmlFor="debugMode" className="text-xs">Debug</Label>
                                    <Switch id="debugMode" checked={debugMode} onCheckedChange={setDebugMode} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea id="log-container" className="h-40 w-full rounded-md border p-2 font-mono text-xs">
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
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </main>
                
                {/* Modals */}
                <EditAxesModal
                    open={isAxesModalOpen}
                    onOpenChange={setIsAxesModalOpen}
                    onConfirm={handleConfirmAxes}
                    currentDefinition={availableMaps.find(d => d.name === selectedMapName)}
                />
                <MapCorrectionSuggestionModal 
                    open={isSuggestionModalOpen} 
                    onOpenChange={setIsSuggestionModalOpen} 
                    suggestion={aiSuggestion} 
                    onAccept={() => {}}
                    binBuffer={binFile?.buffer || null}
                    mapRenderKey={mapRenderKey}
                />
                <EditNameModal
                    open={isEditNameModalOpen}
                    onOpenChange={setIsEditNameModalOpen}
                    currentName={mapToEdit?.name || ''}
                    onConfirm={handleConfirmNameChange}
                />
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

function EditAxesModal({ open, onOpenChange, onConfirm, currentDefinition }: { 
    open: boolean, 
    onOpenChange: (open: boolean) => void, 
    onConfirm: (data: { xEquation: string, yEquation: string, zEquation: string }) => void, 
    currentDefinition: XDFDefinition | undefined,
}) {
    const [yEquation, setYEquation] = useState('');
    const [xEquation, setXEquation] = useState('');
    const [zEquation, setZEquation] = useState('');

    useEffect(() => {
        if(open && currentDefinition) {
            setYEquation(currentDefinition.yAxisDef?.equation || 'X');
            setXEquation(currentDefinition.xAxisDef?.equation || 'X');
            setZEquation(currentDefinition.equation || 'X');
        }
    }, [open, currentDefinition]);

    if (!currentDefinition) return null;

    const yAxisLabel = currentDefinition.yAxisDef?.label || 'Eixo Y';
    const xAxisLabel = currentDefinition.xAxisDef?.label || 'Eixo X';
    const zAxisLabel = currentDefinition.name || 'Dados Principais';

    const handleConfirm = () => {
        onConfirm({ yEquation, xEquation, zEquation });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Equações do Mapa</DialogTitle>
                    <DialogDescription>
                        Ajuste as equações de cálculo para os eixos e para os dados do mapa. Use 'X' como a variável para o valor lido do ficheiro BIN.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="yEquationText">Equação do Eixo Y ({yAxisLabel})</Label>
                        <Input id="yEquationText" value={yEquation} onChange={e => setYEquation(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="xEquationText">Equação do Eixo X ({xAxisLabel})</Label>
                        <Input id="xEquationText" value={xEquation} onChange={e => setXEquation(e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="zEquationText">Equação dos Dados Principais ({zAxisLabel})</Label>
                        <Input id="zEquationText" value={zEquation} onChange={e => setZEquation(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Aplicar e Recalcular</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MapCorrectionSuggestionModal({ open, onOpenChange, suggestion, onAccept, binBuffer, mapRenderKey }: { open: boolean, onOpenChange: (open: boolean) => void, suggestion: AISuggestion | null, onAccept: () => void, binBuffer: ArrayBuffer | null, mapRenderKey: number }) {
    if (!suggestion) return null;

    const { originalDefinition, newDefinition, reasoning } = suggestion;
    const hasZCorrection = !!newDefinition.equation && newDefinition.equation !== originalDefinition.equation;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl flex flex-col max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCompareArrows className="text-primary"/>
                        Sugestão de Correção para o Eixo Z
                    </DialogTitle>
                    <DialogDescription>
                         A IA analisou os dados do mapa (Eixo Z) e sugere uma melhoria.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                         <div>
                            <h3 className="font-semibold mb-2 text-center">Original</h3>
                            <div className="h-[400px] overflow-auto border rounded-md">
                              <MapTable
                                key={mapRenderKey + '-orig-sugg'}
                                mapData={suggestion.originalMap}
                                rawMapData={suggestion.originalMap}
                                xAxis={{raw: [], calculated: suggestion.originalAxes.x, originalIndices: [], label: suggestion.originalAxes.xLabel }}
                                yAxis={{raw: [], calculated: suggestion.originalAxes.y, originalIndices: [], label: suggestion.originalAxes.yLabel }}
                                definition={suggestion.originalDefinition}
                                isEditable={false}
                                onSortAxis={() => {}}
                                onResetSort={() => {}}
                                onCellChange={() => {}}
                                selectedCells={new Set()}
                                onCellSelect={() => {}}
                                viewMode={'calculated'}
                              />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-2 text-center">Pré-visualização da Sugestão</h3>
                            <div className="h-[400px] overflow-auto border rounded-md">
                               <MapTable
                                  key={mapRenderKey + '-prev-sugg'}
                                  mapData={suggestion.correctedMap}
                                  rawMapData={suggestion.correctedMap}
                                  xAxis={{raw: [], calculated: suggestion.correctedAxes.x, originalIndices: [], label: suggestion.correctedAxes.xLabel }}
                                  yAxis={{raw: [], calculated: suggestion.correctedAxes.y, originalIndices: [], label: suggestion.correctedAxes.yLabel }}
                                  definition={suggestion.newDefinition}
                                  isEditable={false}
                                  onSortAxis={() => {}}
                                  onResetSort={() => {}}
                                  onCellChange={() => {}}
                                  selectedCells={new Set()}
                                  onCellSelect={() => {}}
                                  viewMode={'calculated'}
                               />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-muted-foreground">Justificação da IA:</h3>
                            <p className="text-sm p-3 bg-muted rounded-md border">{reasoning}</p>
                        </div>
                        
                        {hasZCorrection && (
                           <div className="p-3 rounded-lg border bg-card">
                              <p className="text-sm font-medium">Alteração da Equação do Eixo Z</p>
                               <div className="text-xs space-y-1 mt-1">
                                  <p>Original: <code className="bg-muted px-1 py-0.5 rounded">{originalDefinition.equation}</code></p>
                                  <p className="flex items-center gap-2">Sugerida: <code className="bg-primary/20 font-semibold px-1 py-0.5 rounded">{newDefinition.equation}</code></p>
                              </div>
                           </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="mt-auto pt-4 border-t shrink-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Rejeitar</Button>
                    <Button onClick={onAccept} disabled={!hasZCorrection}>
                        <CheckCircle className="mr-2"/>
                        Aplicar Correção
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function EditNameModal({ open, onOpenChange, onConfirm, currentName }: { 
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (oldName: string, newName: string) => void;
    currentName: string;
}) {
    const [newName, setNewName] = useState('');

    useEffect(() => {
        if (open) setNewName(currentName);
    }, [open, currentName]);

    const handleConfirm = () => onConfirm(currentName, newName);

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Nome do Mapa</DialogTitle>
                    <DialogDescription>Escolha um novo nome para "{currentName}".</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                    <Label htmlFor="mapNameInput" className="sr-only">Nome do Mapa</Label>
                    <Input id="mapNameInput" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }} autoFocus />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Guardar Nome</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
