

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, AxisDefinition, OriginalSortOrder } from '@/lib/types';
import { parseXDF, readAndCalculateMapFromBin, readAxisFromBin, generateChecksum, bufferToHex, writeMapToBin, invertEquation } from '@/lib/ecu';
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowDownAZ, ArrowUpNarrowWide, CheckCircle, ChevronRight, FileUp, GitCompareArrows, Loader2, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Table, Box, Undo2, Save, Pencil, AudioLines, Pause } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import dynamic from 'next/dynamic';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});


function EditableMapCell({ value: initialValue, onCellChange, isEditable, valueFormat }: { value: number | null, onCellChange: (value: string) => void, isEditable: boolean, valueFormat: 'integer' | 'decimal' }) {
  const formatValue = useCallback((val: number | null) => {
    if (val === null || isNaN(val)) return '';
    if (valueFormat === 'integer') {
      return Math.round(val).toString();
    }
    return String(Number(val.toFixed(3)));
  }, [valueFormat]);
    
  const [value, setValue] = useState(formatValue(initialValue));

  useEffect(() => {
    setValue(formatValue(initialValue));
  }, [initialValue, formatValue]);
  
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isEditable) {
      onCellChange(e.target.value);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
  }

  return (
    <Input
      type="text"
      inputMode={valueFormat === 'integer' ? 'numeric' : 'decimal'}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      readOnly={!isEditable}
      className={cn(
          "w-[60px] h-8 p-0 text-center bg-transparent border-none rounded-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background/80",
          !isEditable && "cursor-default focus-visible:ring-0"
      )}
    />
  );
}


function MapTable({
  mapData,
  xAxis,
  yAxis,
  xAxisLabel,
  yAxisLabel,
  mapName,
  onSortAxis,
  onSortByFirstColumn,
  onResetSort,
  onCellChange,
  isEditable = true,
  valueFormat = 'decimal',
  selectedCells,
  onCellSelect,
}: {
  mapData: MapData;
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  yAxisLabel: string;
  mapName: string;
  onSortAxis: (axis: 'x' | 'y') => void;
  onSortByFirstColumn: () => void;
  onResetSort: () => void;
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
  isEditable?: boolean;
  valueFormat?: 'integer' | 'decimal';
  selectedCells: Set<string>;
  onCellSelect: (rowIndex: number, colIndex: number, isCtrlOrCmd: boolean) => void;
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

  const transposedData = yAxis[0] !== undefined ? mapData[0]?.map((_, colIndex) => mapData.map(row => row[colIndex])) : [];

  const displayYAxis = xAxis; 
  const displayXAxis = yAxis; 
  
  const yAxisFormatter = (val: string | number) => {
    if (typeof val !== 'number') return val;
    return val.toFixed(1);
  };
  
  const xAxisFormatter = (val: string | number) => {
    if (typeof val !== 'number') return val;
    return Math.round(val);
  };


  return (
    <div className="overflow-auto relative h-full">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-card">
            <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-muted-foreground text-left min-w-[120px]">
              <div className="flex justify-between items-start">
                  <div>
                      <div className="font-semibold text-xs">Valores (Z): <span className="font-normal text-foreground">{mapName}</span></div>
                      <div className="font-semibold text-xs">Vertical (Y): <span className="font-normal text-foreground">{yAxisLabel}</span></div>
                      <div className="font-semibold text-xs">Horizontal (X): <span className="font-normal text-foreground">{xAxisLabel}</span></div>
                  </div>
                  {isEditable && (
                     <div className="flex items-center gap-1">
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
                               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onSortByFirstColumn}><ArrowDownAZ className="h-4 w-4" /></Button>
                           </TooltipTrigger>
                           <TooltipContent><p>Ordenar linhas pelos valores da 1ª coluna (Z)</p></TooltipContent>
                       </Tooltip>
                       <Tooltip>
                           <TooltipTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetSort}><Undo2 className="h-4 w-4" /></Button>
                           </TooltipTrigger>
                           <TooltipContent><p>Restaurar ordem original</p></TooltipContent>
                       </Tooltip>
                    </div>
                  )}
              </div>
            </th>
            {displayYAxis.map((y, i) => (
              <th key={`head-y-${i}`} className="sticky top-0 z-10 bg-muted p-1 border border-border font-semibold text-center min-w-[60px]">
                {xAxisFormatter(y)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayXAxis.map((x, xi) => (
            <tr key={`row-${xi}`}>
              <td className="sticky left-0 z-10 bg-muted p-1 border border-border font-semibold text-center">
                 {yAxisFormatter(x)}
              </td>
              {displayYAxis.map((_y, yi) => {
                const cellValue = transposedData[yi]?.[xi];
                const isSelected = selectedCells.has(`${xi}-${yi}`);
                return (
                  <td 
                    key={`cell-container-${xi}-${yi}`}
                    className={cn(
                        "p-0 border border-border text-center relative",
                        isSelected && "ring-2 ring-primary ring-inset z-10"
                    )}
                    style={{ backgroundColor: getHeatmapColor(cellValue, min, max) }}
                    onClick={(e) => isEditable && onCellSelect(xi, yi, e.ctrlKey || e.metaKey)}
                  >
                    <EditableMapCell
                      value={cellValue}
                      onCellChange={(value) => onCellChange(xi, yi, value)}
                      isEditable={isEditable}
                      valueFormat={valueFormat}
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

    // State for map data. "working" is the editable source of truth, "display" is for rendering (can be sorted)
    const [rawMap, setRawMap] = useState<MapData | null>(null);
    const [workingMap, setWorkingMap] = useState<MapData | null>(null);
    const [sourceAxes, setSourceAxes] = useState<{ x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null>(null);
    const [displayMap, setDisplayMap] = useState<MapData | null>(null);
    const [displayAxes, setDisplayAxes] = useState<{ x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null>(null);
    const [originalSortOrder, setOriginalSortOrder] = useState<OriginalSortOrder | null>(null);
    const [displayIndexMap, setDisplayIndexMap] = useState<{ x: number[], y: number[] } | null>(null);
    const [mapRenderKey, setMapRenderKey] = useState(0);

    const [xdfLibrary, setXdfLibrary] = useState<Record<string, { name: string; content: string; brand?: string }>>({});
    const [potentialMapsDb, setPotentialMapsDb] = useState<Record<string, XDFDefinition[]>>({});
    const [selectedXdfFromLibrary, setSelectedXdfFromLibrary] = useState<string>('');
    const [selectedBrandForNewXdf, setSelectedBrandForNewXdf] = useState<string>('Yamaha');
    const [motorcycleModel, setMotorcycleModel] = useState('R3');
    const [activeXdfBrand, setActiveXdfBrand] = useState('');

    // Quick Edit & Selection State
    const [quickEditValue, setQuickEditValue] = useState('');
    const [quickEditType, setQuickEditType] = useState<'percent' | 'unit'>('percent');
    const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

    // AI state
    const [isScanning, setIsScanning] = useState(false);
    const [isValidatingMap, setIsValidatingMap] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<{ confidence: string; suspectedType: string; reasoning: string; } | null>(null);
    const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);


    // Modal state
    const [isAxesModalOpen, setIsAxesModalOpen] = useState(false);
    const [isXdfErrorModalOpen, setIsXdfErrorModalOpen] = useState(false);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
    const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
    const [mapToEdit, setMapToEdit] = useState<XDFDefinition | null>(null);


    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const valueFormat = useMemo<'integer' | 'decimal'>(() => {
        if (!selectedMapName) return 'decimal';
        
        const lowerCaseName = selectedMapName.toLowerCase();
        
        const decimalKeywords = ['ignição', 'ignition', 'avanço', 'spark', 'timing', 'comb', 'fuel', 'injeção'];
        if (decimalKeywords.some(keyword => lowerCaseName.includes(keyword))) {
            return 'decimal';
        }

        const integerKeywords = ['tps', 'map', 've', 'etv', 'borboleta'];
        if (integerKeywords.some(keyword => lowerCaseName.includes(keyword))) {
            return 'integer';
        }

        return 'decimal';
    }, [selectedMapName]);

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


    // Load custom data from localStorage on component mount
    useEffect(() => {
        try {
            const savedLibrary = localStorage.getItem('xdfLibrary');
            if (savedLibrary) {
                setXdfLibrary(JSON.parse(savedLibrary));
                addLog('Biblioteca XDF carregada.', 'debug');
            }
            const savedPotentialMaps = localStorage.getItem('potentialMapsLibrary');
            if (savedPotentialMaps) {
                setPotentialMapsDb(JSON.parse(savedPotentialMaps));
                addLog('Biblioteca de mapas potenciais carregada.', 'debug');
            }
        } catch (error) {
            console.error("Failed to load from localStorage", error);
            addLog('Não foi possível carregar dados do armazenamento local.', 'error');
        }
    }, [addLog]);

    // Save custom data to localStorage whenever they change
    useEffect(() => {
        try {
            if (Object.keys(xdfLibrary).length > 0) localStorage.setItem('xdfLibrary', JSON.stringify(xdfLibrary));
            if (Object.keys(potentialMapsDb).length > 0) localStorage.setItem('potentialMapsLibrary', JSON.stringify(potentialMapsDb));
        } catch (error) {
            console.error("Failed to save to localStorage", error);
            addLog('Não foi possível guardar dados no armazenamento local.', 'error');
        }
    }, [xdfLibrary, potentialMapsDb]);

    // Rebuild available maps when files or potential maps DB changes
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
        }

        const previouslyFoundMaps = potentialMapsDb[binFile.checksum] || [];
        const definedAddresses = new Set(validDefinitions.map(d => d.address));
        const uniquePotentials = previouslyFoundMaps.filter(pMap => !definedAddresses.has(pMap.address));

        const combinedMaps = [...validDefinitions, ...uniquePotentials];

        const finalMapNames = new Set<string>();
        const uniqueCombinedMaps = combinedMaps.map(def => {
            let newName = def.name;
            if (finalMapNames.has(newName)) {
                let count = 2;
                do {
                    newName = `${def.name} (${count})`;
                    count++;
                } while (finalMapNames.has(newName));
            }
            finalMapNames.add(newName);
            
            const lowerName = newName.toLowerCase();
            const isFuelMap = ['comb', 'fuel', 'injeção', 'injection'].some(kw => lowerName.includes(kw));
            const isIgnitionMap = ['ign', 'ignition', 'avanço', 'spark', 'timing'].some(kw => lowerName.includes(kw));

            // Heuristic for 16-bit Fuel maps (us -> ms)
            if (isFuelMap && def.dataSize === 2 && def.equation.trim().toLowerCase() === 'x') {
                const newDef = { ...def, name: newName, equation: '(X) / 1000' };
                addLog(`Mapa de combustível de 16-bit "${newName}" detetado. A aplicar conversão automática de µs para ms.`, 'debug');
                return newDef;
            }
            
            // Heuristic for 8-bit Ignition maps
            if (isIgnitionMap && def.dataSize === 1 && def.equation.trim().toLowerCase() === 'x') {
                const newDef = { ...def, name: newName, equation: 'X / 4' };
                addLog(`Mapa de ignição de 8-bit "${newName}" detetado. A aplicar conversão automática para graus (X/4).`, 'debug');
                return newDef;
            }

            return { ...def, name: newName };
        });

        setAvailableMaps(uniqueCombinedMaps);

        if (selectedMapName && !uniqueCombinedMaps.some(def => def.name === selectedMapName)) {
            setSelectedMapName('');
            setDisplayMap(null);
            setDisplayAxes(null);
        }

        if (invalidCount > 0) {
            const totalCount = xdfFile?.definitions.length || 0;
            const warningMsg = `${invalidCount} de ${totalCount} definições de mapa são incompatíveis com o ficheiro BIN e foram ocultadas.`;
            addLog(warningMsg, 'error');
            toast({
                variant: 'destructive',
                title: "Aviso de Compatibilidade",
                description: warningMsg,
                duration: 8000,
            });
        }
    }, [binFile, xdfFile, potentialMapsDb, addLog, toast, selectedMapName]);


    const resetState = () => {
        setBinFile(null); setXdfFile(null); setSelectedMapName('');
        setRawMap(null); setWorkingMap(null); setSourceAxes(null);
        setDisplayMap(null); setDisplayAxes(null);
        setOriginalSortOrder(null);
        setDisplayIndexMap(null);
        setIsValidatingMap(false);
        setAiSuggestion(null);
        setAnalysisResult(null);
        setSelectedXdfFromLibrary('');
        setActiveXdfBrand('');
        setSelectedBrandForNewXdf('no-brand');
        setAvailableMaps([]);
        setAudioUrl(null);
        setSelectedCells(new Set());
        setQuickEditValue('');

        if (binInputRef.current) binInputRef.current.value = '';
        if (xdfInputRef.current) xdfInputRef.current.value = '';
        addLog('O estado da sessão foi reiniciado. As suas bibliotecas foram preservadas.', 'info');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const buffer = event.target?.result as ArrayBuffer;
                if (type === 'bin') {
                    setXdfFile(null); 
                    setSelectedMapName('');
                    setDisplayMap(null);
                    setDisplayAxes(null);
                    setRawMap(null);
                    setAvailableMaps([]);
                    setAudioUrl(null);
                    setSelectedCells(new Set());
                    
                    const checksum = generateChecksum(buffer);
                    setBinFile({ name: file.name, buffer, checksum });
                    addLog(`Ficheiro BIN carregado: ${file.name} (Checksum: ${checksum})`, 'success');
                    
                    const mapsForBin = potentialMapsDb[checksum] || [];
                    if (mapsForBin.length > 0) {
                      addLog(`${mapsForBin.length} mapa(s) potencial(is) previamente encontrado(s) foram carregados para este BIN.`, 'info');
                    }

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

                    try {
                        const newLibrary = { ...xdfLibrary, [file.name]: { name: file.name, content: text, brand: brandValue }};
                        setXdfLibrary(newLibrary);
                        setSelectedXdfFromLibrary(file.name);
                        addLog(`"${file.name}" ${brandValue ? `(Marca: ${brandValue}) `: ''}adicionado à biblioteca XDF.`, 'info');
                    } catch (error) {
                        addLog('Não foi possível guardar o XDF na biblioteca (pode estar cheia).', 'error');
                        toast({ variant: 'destructive', title: "Biblioteca Cheia", description: "Não foi possível guardar o XDF na biblioteca." });
                    }
                }
            } catch (error) {
                const msg = `Erro ao carregar ${file.name}: ${(error as Error).message}`;
                addLog(msg, 'error');
                if (type === 'xdf') {
                    setIsXdfErrorModalOpen(true);
                } else {
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
            
            setSelectedMapName(''); setDisplayMap(null); setDisplayAxes(null); setRawMap(null); setAudioUrl(null);
            setSelectedCells(new Set());

            setXdfFile({ name, definitions });
            setSelectedXdfFromLibrary(name);
            setActiveXdfBrand(xdfData.brand || '');
            addLog(`XDF "${name}" ${xdfData.brand ? `(Marca: ${xdfData.brand}) `: ''}carregado da biblioteca.`, 'success');
        } catch (error) {
            const msg = `Erro ao carregar ${name} da biblioteca: ${(error as Error).message}`;
            addLog(msg, 'error');
            setIsXdfErrorModalOpen(true);
            setXdfFile(null);
        }
    }
    
    const handleClearXdfLibrary = () => {
        setXdfLibrary({});
        localStorage.removeItem('xdfLibrary');
        setXdfFile(null);
        setAvailableMaps([]);
        setSelectedXdfFromLibrary('');
        setActiveXdfBrand('');
        addLog('Biblioteca XDF limpa.', 'info');
        toast({ title: 'Biblioteca Limpa', description: 'A sua biblioteca de ficheiros XDF foi removida.' });
    }

    const handleMapSelect = (name: string) => {
        if (!binFile || !name) return;
        
        const definition = availableMaps.find(d => d.name === name);
        if (!definition) {
            addLog(`Definição de mapa "${name}" não encontrada.`, 'error');
            return;
        }

        setSelectedMapName(name);
        setAudioUrl(null);
        setSelectedCells(new Set());

        try {
            const tempEixoX = readAxisFromBin(binFile.buffer, definition.xAxisDef);
            const tempEixoY = readAxisFromBin(binFile.buffer, definition.yAxisDef);
            const { calculatedMap, rawMap: newRawMap } = readAndCalculateMapFromBin(binFile.buffer, definition, tempEixoX, tempEixoY);

            const mapAxes = {
              x: tempEixoX,
              y: tempEixoY,
              xLabel: definition.xAxisDef?.label || 'Carga',
              yLabel: definition.yAxisDef?.label || 'RPM',
            };
            
            setWorkingMap(calculatedMap);
            setRawMap(newRawMap);
            setDisplayMap(JSON.parse(JSON.stringify(calculatedMap)));
            setSourceAxes(mapAxes);
            setDisplayAxes(mapAxes);
            setOriginalSortOrder({
              x: mapAxes.x.map((value, index) => ({ value, index })),
              y: mapAxes.y.map((value, index) => ({ value, index })),
            });
            setDisplayIndexMap({
              x: mapAxes.x.map((_, i) => i),
              y: mapAxes.y.map((_, i) => i),
            });
            
            setMapRenderKey(p => p + 1);
            addLog(`Mapa carregado com sucesso: ${name}`, 'success');

        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
        }
    };
    
    const handleConfirmAxes = (data: { xEquation: string, yEquation: string, zEquation: string }) => {
        if (!selectedMapName || !binFile) return;

        const definition = availableMaps.find(d => d.name === selectedMapName);
        if (!definition || !definition.xAxisDef || !definition.yAxisDef) {
            addLog(`Definição de mapa ou de eixo para "${selectedMapName}" não encontrada para recálculo.`, 'error');
            return;
        }

        try {
            const newDefinition = JSON.parse(JSON.stringify(definition)) as XDFDefinition;
            newDefinition.equation = data.zEquation;
            newDefinition.equationVar = 'X'; // Assume X for simplicity after manual edit
            newDefinition.xAxisDef!.equation = data.xEquation;
            newDefinition.yAxisDef!.equation = data.yEquation;

            const newX = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
            const newY = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);
            const { calculatedMap: newMapData, rawMap: newRawMap } = readAndCalculateMapFromBin(binFile.buffer, newDefinition, newX, newY);

            const newAxesState = {
              x: newX,
              y: newY,
              xLabel: newDefinition.xAxisDef?.label || 'Carga',
              yLabel: newDefinition.yAxisDef?.label || 'RPM',
            };

            if (newDefinition.isPotential) {
                setPotentialMapsDb(prev => ({
                    ...prev,
                    [binFile.checksum]: (prev[binFile.checksum] || []).map(pMap =>
                        pMap.name === selectedMapName ? newDefinition : pMap
                    ),
                }));
                addLog(`Equações atualizadas para o mapa potencial "${selectedMapName}".`, 'success');
            } else if (xdfFile) {
                const newDefinitions = xdfFile.definitions.map(def =>
                    def.name === selectedMapName ? newDefinition : def
                );
                setXdfFile({ ...xdfFile, definitions: newDefinitions });
                addLog(`Equações atualizadas na definição XDF para "${selectedMapName}".`, 'success');
            } else {
                addLog(`Não foi possível persistir as alterações na equação para "${selectedMapName}".`, 'error');
            }

            setWorkingMap(newMapData);
            setRawMap(newRawMap);
            setDisplayMap(newMapData);
            setSourceAxes(newAxesState);
            setDisplayAxes(newAxesState);
            setAudioUrl(null);
            setSelectedCells(new Set());
            setOriginalSortOrder({
              x: newX.map((value, index) => ({ value, index })),
              y: newY.map((value, index) => ({ value, index })),
            });
            setDisplayIndexMap({
              x: newX.map((_, i) => i),
              y: newY.map((_, i) => i),
            });
            
            setMapRenderKey(p => p + 1);
            setIsAxesModalOpen(false);
            toast({ title: 'Equações Aplicadas', description: 'O mapa foi recalculado com as novas equações.' });

        } catch (error) {
            const msg = `Erro ao recalcular o mapa com as novas equações: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Recálculo", description: msg });
        }
    };

    const handleSortAxis = (axis: 'x' | 'y') => {
        if (!workingMap || !sourceAxes || !originalSortOrder || !displayAxes) return;

        const sortedAxisWithIndices = [...originalSortOrder[axis]].sort((a, b) => {
            const valA = a.value;
            const valB = b.value;
            if (typeof valA === 'number' && typeof valB === 'number') {
                return valA - valB;
            }
            return String(valA).localeCompare(String(valB));
        });

        const newSortedAxisValues = sortedAxisWithIndices.map(item => item.value);
        const newIndexMap = sortedAxisWithIndices.map(item => item.index);

        let newSortedMap: MapData;

        if (axis === 'y') { // Sorting rows
            newSortedMap = newIndexMap.map(originalRowIndex => workingMap[originalRowIndex]);
            setDisplayIndexMap(prev => ({ ...(prev!), y: newIndexMap }));
        } else { // Sorting columns
            newSortedMap = workingMap.map(row => newIndexMap.map(originalColIndex => row[originalColIndex]));
            setDisplayIndexMap(prev => ({ ...(prev!), x: newIndexMap }));
        }

        setDisplayAxes(prev => ({
            ...(prev!),
            [axis]: newSortedAxisValues,
        }));
        setDisplayMap(newSortedMap);
        setSelectedCells(new Set());
        addLog(`Eixo ${axis === 'x' ? displayAxes.xLabel : displayAxes.yLabel} ordenado.`, 'info');
    };

    const handleSortByFirstColumn = useCallback(() => {
        if (!workingMap || !sourceAxes) return;

        const sortable = workingMap.map((row, index) => ({
            value: row[0],
            index: index,
        }));

        sortable.sort((a, b) => {
            const valA = a.value;
            const valB = b.value;
            if (valA === null) return 1;
            if (valB === null) return -1;
            if (typeof valA === 'number' && typeof valB === 'number') {
                return valA - valB;
            }
            return String(valA).localeCompare(String(valB));
        });

        const newSortedMap = sortable.map(item => workingMap[item.index]);
        const newSortedYAxis = sortable.map(item => sourceAxes.y[item.index]);
        const newYIndexMap = sortable.map(item => item.index);
        
        setDisplayMap(newSortedMap);
        setDisplayAxes(prev => ({
            ...(prev!),
            y: newSortedYAxis,
        }));
        setDisplayIndexMap(prev => ({...(prev!), y: newYIndexMap }));
        setSelectedCells(new Set());
        setMapRenderKey(p => p + 1);
        addLog(`Linhas ordenadas com base nos valores da primeira coluna (Z).`, 'info');
    }, [workingMap, sourceAxes, addLog]);
    
    const handleResetSort = () => {
        if (workingMap && sourceAxes) {
            setDisplayMap(JSON.parse(JSON.stringify(workingMap)));
            setDisplayAxes(JSON.parse(JSON.stringify(sourceAxes)));
            setDisplayIndexMap({
              x: sourceAxes.x.map((_, i) => i),
              y: sourceAxes.y.map((_, i) => i),
            });
            setSelectedCells(new Set());
            setMapRenderKey(p => p + 1);
            addLog('Ordenação do mapa revertida para o original.', 'info');
        }
    };
    
    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
      if (!workingMap || !displayMap || !displayIndexMap || !rawMap) return;

      const newValue = parseFloat(value);
      if (isNaN(newValue)) {
        addLog(`Valor inválido introduzido: "${value}". Apenas números são permitidos.`, 'error');
        setMapRenderKey(p => p + 1); // Rerender to show original value
        return;
      }
      
      const workingRowIndex = displayIndexMap.y[rowIndex];
      const workingColIndex = displayIndexMap.x[colIndex];

      if (workingRowIndex === undefined || workingColIndex === undefined) {
        addLog('Não foi possível atualizar o valor: célula correspondente não encontrada após a ordenação.', 'error');
        return;
      }

      // Update the source-of-truth map (workingMap)
      const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
      newWorkingMap[workingRowIndex][workingColIndex] = newValue;
      setWorkingMap(newWorkingMap);

      // Update the display map to reflect the change immediately
      const newDisplayMap = JSON.parse(JSON.stringify(displayMap));
      newDisplayMap[rowIndex][colIndex] = newValue;
      setDisplayMap(newDisplayMap);
      setAudioUrl(null);
      
      // Update the underlying raw value
      const currentDef = availableMaps.find(d => d.name === selectedMapName);
      if (currentDef) {
          try {
              const newRawValue = invertEquation(currentDef.equation, currentDef.equationVar, newValue, currentDef.dataSize, currentDef.name);
              const newRawMap = JSON.parse(JSON.stringify(rawMap));
              newRawMap[workingRowIndex][workingColIndex] = newRawValue;
              setRawMap(newRawMap);
          } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              addLog(`Não foi possível calcular o valor raw para a célula [${rowIndex}, ${colIndex}]: ${msg}`, 'error');
          }
      }
    };

    const handleCellSelect = useCallback((rowIndex: number, colIndex: number, isCtrlOrCmd: boolean) => {
        const newSelection = new Set(selectedCells);
        const key = `${rowIndex}-${colIndex}`;

        if (isCtrlOrCmd) {
            if (newSelection.has(key)) {
                newSelection.delete(key);
            } else {
                newSelection.add(key);
            }
        } else {
            newSelection.clear();
            newSelection.add(key);
            
        }
        setSelectedCells(newSelection);
    }, [selectedCells]);


    const handleQuickEdit = (operation: 'add' | 'subtract') => {
        const value = parseFloat(quickEditValue);
        if (isNaN(value) || !workingMap || !rawMap || !displayMap || !displayAxes || !sourceAxes || !displayIndexMap) {
            addLog("Valor de edição rápida inválido ou nenhum mapa carregado.", "error");
            return;
        }

        const currentDef = availableMaps.find(d => d.name === selectedMapName);
        if (!currentDef) {
            addLog("Definição de mapa não encontrada para edição rápida.", "error");
            return;
        }

        const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
        const newRawMap = JSON.parse(JSON.stringify(rawMap));
        const newDisplayMap = JSON.parse(JSON.stringify(displayMap));
        let changesMade = 0;
        const hasSelection = selectedCells.size > 0;

        const rows = displayMap.length;
        const cols = displayMap[0]?.length || 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const key = `${r}-${c}`;
                if (hasSelection && !selectedCells.has(key)) {
                    continue;
                }

                const workingRowIndex = displayIndexMap.y[r];
                const workingColIndex = displayIndexMap.x[c];

                if (workingRowIndex === undefined || workingColIndex === undefined) continue;

                const currentCalculatedValue = newWorkingMap[workingRowIndex][workingColIndex];
                if (currentCalculatedValue === null) continue;
                
                let newCalculatedValue: number;

                if (quickEditType === 'percent') {
                    let effectiveOperation = (operation === 'add' ? 1 : -1);
                    // If the value is negative, "adding" a percentage should make it more positive (increase its value).
                    if (currentCalculatedValue < 0) {
                         newCalculatedValue = currentCalculatedValue * (1 - (value/100 * effectiveOperation));
                    } else {
                         newCalculatedValue = currentCalculatedValue * (1 + (value/100 * effectiveOperation));
                    }
                } else { // 'unit'
                    const changeAmount = value * (operation === 'add' ? 1 : -1);
                    newCalculatedValue = currentCalculatedValue + changeAmount;
                }
                
                try {
                    const newRawValue = invertEquation(currentDef.equation, currentDef.equationVar, newCalculatedValue, currentDef.dataSize, currentDef.name);

                    newRawMap[workingRowIndex][workingColIndex] = newRawValue;
                    newWorkingMap[workingRowIndex][workingColIndex] = newCalculatedValue;
                    newDisplayMap[r][c] = newCalculatedValue;
                    changesMade++;

                } catch (e) {
                     const errorMsg = e instanceof Error ? e.message : "Erro desconhecido";
                     addLog(`Não foi possível calcular o valor raw para a célula [${r}, ${c}]: ${errorMsg}`, 'error');
                }
            }
        }

        if (changesMade > 0) {
            setWorkingMap(newWorkingMap);
            setRawMap(newRawMap);
            setDisplayMap(newDisplayMap);
            setAudioUrl(null);
            
            const targetDescription = hasSelection ? `${changesMade} células selecionadas` : 'todas as células';
            addLog(`Edição rápida aplicada a ${targetDescription}.`, 'success');
        } else {
             addLog(`Nenhuma célula elegível para a edição rápida.`, 'info');
        }
        setQuickEditValue('');
    };


    const handleValidateMap = async () => {
        if (!displayMap || !displayAxes || !selectedMapName || !binFile) return;

        const currentDef = availableMaps.find(d => d.name === selectedMapName);
        if (!currentDef) {
            addLog(`Não foi possível encontrar a definição do mapa para validar.`, 'error');
            toast({ variant: 'destructive', title: 'Erro de Validação', description: 'Não foi possível encontrar a definição do mapa selecionado.' });
            return;
        }

        setIsValidatingMap(true);
        addLog(`A iniciar a análise do tipo de mapa para "${selectedMapName}"...`, 'info');

        const numericXAxis = displayAxes.x.filter(v => typeof v === 'number') as number[];
        const numericYAxis = displayAxes.y.filter(v => typeof v === 'number') as number[];

        if(numericXAxis.length !== displayAxes.x.length || numericYAxis.length !== displayAxes.y.length) {
            addLog('A validação de mapa requer eixos puramente numéricos.', 'error');
            toast({ variant: 'destructive', title: 'Falha na Validação', description: 'Os eixos devem ser numéricos para a validação do tipo de mapa.' });
            setIsValidatingMap(false);
            return;
        }

        const result = await validateMapType({
            mapName: selectedMapName,
            mapData: displayMap,
            xAxis: numericXAxis,
            yAxis: numericYAxis,
            equation: currentDef.equation,
        });

        setIsValidatingMap(false);

        if (result.success && result.data) {
            setAnalysisResult(result.data);
            setIsAnalysisModalOpen(true);
            addLog(`Análise de tipo de mapa concluída. Confiança: ${result.data.confidence}.`, 'success');

            const { suggestedEquation, suggestedXAxisEquation, suggestedYAxisEquation } = result.data;
            const hasSuggestion = suggestedEquation || suggestedXAxisEquation || suggestedYAxisEquation;
            
            if (hasSuggestion) {
                const newDefinition = JSON.parse(JSON.stringify(currentDef)) as XDFDefinition;
                if (suggestedEquation && newDefinition) newDefinition.equation = suggestedEquation;
                if (suggestedXAxisEquation && newDefinition.xAxisDef) newDefinition.xAxisDef.equation = suggestedXAxisEquation;
                if (suggestedYAxisEquation && newDefinition.yAxisDef) newDefinition.yAxisDef.equation = suggestedYAxisEquation;
                
                try {
                    const correctedXAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
                    const correctedYAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);
                    const { calculatedMap: correctedMapPreview } = readAndCalculateMapFromBin(binFile.buffer, newDefinition, correctedXAxisPreview, correctedYAxisPreview);
                    const correctedAxesPreview = {
                        x: correctedXAxisPreview,
                        y: correctedYAxisPreview,
                        xLabel: newDefinition.xAxisDef?.label || 'Carga',
                        yLabel: newDefinition.yAxisDef?.label || 'RPM'
                    };

                    setAiSuggestion({
                        reasoning: result.data.reasoning,
                        originalMap: displayMap,
                        originalAxes: displayAxes,
                        correctedMap: correctedMapPreview,
                        correctedAxes: correctedAxesPreview,
                        newDefinition,
                        originalDefinition: JSON.parse(JSON.stringify(currentDef)),
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
    
    const handleAcceptSuggestion = (correctionsToApply: { x: boolean; y: boolean; z: boolean; }) => {
        if (!aiSuggestion || !binFile || !selectedMapName) return;

        const newDefinition = JSON.parse(JSON.stringify(aiSuggestion.originalDefinition)) as XDFDefinition;
        const suggestedDefinition = aiSuggestion.newDefinition;
        let appliedCorrectionsLog = [];

        if (correctionsToApply.x && newDefinition.xAxisDef && suggestedDefinition.xAxisDef?.equation) {
            newDefinition.xAxisDef.equation = suggestedDefinition.xAxisDef.equation;
            appliedCorrectionsLog.push("Eixo X");
        }
        if (correctionsToApply.y && newDefinition.yAxisDef && suggestedDefinition.yAxisDef?.equation) {
            newDefinition.yAxisDef.equation = suggestedDefinition.yAxisDef.equation;
            appliedCorrectionsLog.push("Eixo Y");
        }
        if (correctionsToApply.z && suggestedDefinition.equation) {
            newDefinition.equation = suggestedDefinition.equation;
            appliedCorrectionsLog.push("Dados do Mapa (Z)");
        }


        if (appliedCorrectionsLog.length === 0) {
            addLog("Nenhuma correção foi selecionada para ser aplicada.", "info");
            setIsSuggestionModalOpen(false);
            setAiSuggestion(null);
            return;
        }

        try {
            const correctedXAxis = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
            const correctedYAxis = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);
            const { calculatedMap: correctedMap, rawMap: correctedRawMap } = readAndCalculateMapFromBin(binFile.buffer, newDefinition, correctedXAxis, correctedYAxis);
            const newSourceAxes = {
                x: correctedXAxis,
                y: correctedYAxis,
                xLabel: newDefinition.xAxisDef?.label || 'Carga',
                yLabel: newDefinition.yAxisDef?.label || 'RPM'
            };

            if (newDefinition.isPotential) {
                setPotentialMapsDb(prev => ({
                    ...prev,
                    [binFile.checksum]: (prev[binFile.checksum] || []).map(pMap => 
                        pMap.address === newDefinition.address ? newDefinition : pMap
                    ),
                }));
                 addLog(`Correções da IA guardadas para o mapa potencial "${selectedMapName}".`, 'success');
            } else if (xdfFile) {
                const newDefinitions = xdfFile.definitions.map(def => 
                    def.name === selectedMapName ? newDefinition : def
                );
                setXdfFile({ ...xdfFile, definitions: newDefinitions });
                 addLog(`Correções da IA aplicadas à definição XDF para "${selectedMapName}".`, 'success');
            }

            setWorkingMap(correctedMap);
            setRawMap(correctedRawMap);
            setDisplayMap(correctedMap);
            setSourceAxes(newSourceAxes);
            setDisplayAxes(newSourceAxes);
            setAudioUrl(null);
            setSelectedCells(new Set());
            setOriginalSortOrder({
              x: newSourceAxes.x.map((value, index) => ({ value, index })),
              y: newSourceAxes.y.map((value, index) => ({ value, index })),
            });
            setDisplayIndexMap({
              x: newSourceAxes.x.map((_, i) => i),
              y: newSourceAxes.y.map((_, i) => i),
            });
            
            setMapRenderKey(p => p + 1);
            toast({ title: 'Correções Aplicadas', description: `O mapa foi atualizado com as sugestões selecionadas.` });

        } catch (error) {
            addLog(`Erro ao aplicar a sugestão da IA: ${(error as Error).message}`, 'error');
            toast({ variant: 'destructive', title: 'Erro ao Aplicar Correção', description: 'Não foi possível recalcular o mapa com a nova equação.' });
        } finally {
            setIsSuggestionModalOpen(false);
            setAiSuggestion(null);
        }
    };

    const handleScanForMaps = async () => {
        if (!binFile || selectedBrandForNewXdf === 'no-brand') {
            toast({ variant: 'destructive', title: "Ação Necessária", description: "Por favor, carregue um ficheiro BIN e selecione uma marca para procurar mapas." });
            return;
        }

        setIsScanning(true);
        addLog(`A iniciar a procura de mapas com IA para a marca ${selectedBrandForNewXdf}${motorcycleModel ? ` ${motorcycleModel}` : ''}...`, 'info');

        const scanBuffer = binFile.buffer.slice(0, 8192);
        const hexData = bufferToHex(scanBuffer);
        const existingMaps = availableMaps.map(d => ({
                name: d.name,
                address: d.address,
                sizeInBytes: d.rows * d.cols * d.dataSize
            }));

        const result = await findPotentialMaps({ binHexData: hexData, existingMaps, brand: selectedBrandForNewXdf, model: motorcycleModel });

        setIsScanning(false);

        if (result.success && result.data?.maps.length > 0) {
            const numMapsFound = result.data.maps.length;
            
            const existingAndPotentials = [...availableMaps.map(m => m.name), ...potentialMapsDb[binFile.checksum]?.map(m => m.name) || []];
            const allKnownNames = new Set(existingAndPotentials);
            
            const newPotentialMaps: XDFDefinition[] = result.data.maps.map(pMap => {
                let uniqueName = `${pMap.name} (IA)`;
                if (allKnownNames.has(uniqueName)) {
                    let count = 2;
                    do {
                        uniqueName = `${pMap.name} (IA) (${count})`;
                        count++;
                    } while (allKnownNames.has(uniqueName));
                }
                allKnownNames.add(uniqueName);

                return {
                    name: uniqueName,
                    address: pMap.address,
                    rows: pMap.rows,
                    cols: pMap.cols,
                    dataSize: pMap.dataSize,
                    isBigEndian: false,
                    equation: 'X',
                    xAxisDef: { address: null, count: pMap.cols, dataSize: 1, isBigEndian: false, equation: 'X', label: 'Coluna' },
                    yAxisDef: { address: null, count: pMap.rows, dataSize: 1, isBigEndian: false, equation: 'X', label: 'Linha' },
                    isPotential: true,
                };
            });
            
            const message = `A IA encontrou ${newPotentialMaps.length} novo(s) mapa(s) potencial(is). Eles foram guardados para este BIN.`;
            addLog(message, 'success');
            toast({
                title: "Mapas Encontrados!",
                description: message
            });

            setPotentialMapsDb(prevDb => {
                const existingForThisBin = prevDb[binFile.checksum] || [];
                const existingAddresses = new Set(existingForThisBin.map(m => m.address));
                const mapsToAdd = newPotentialMaps.filter(pMap => !existingAddresses.has(pMap.address));

                return {
                    ...prevDb,
                    [binFile.checksum]: [...existingForThisBin, ...mapsToAdd]
                };
            });

        } else if (result.error) {
            addLog(`Erro ao procurar mapas: ${result.error}`, 'error');
            toast({ variant: 'destructive', title: "Falha na Procura", description: result.error });
        } else {
            const analysisMessage = result.data?.analysis || 'A IA concluiu a análise mas não encontrou novos mapas potenciais.';
            addLog(analysisMessage, 'info');
            toast({
                title: "Procura Concluída",
                description: analysisMessage,
                duration: 8000
            });
        }
    };
    
    const handleSaveModifiedBin = () => {
        if (!binFile || !rawMap || !selectedMapName) {
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
            const modifiedBuffer = writeMapToBin(binFile.buffer, definition, rawMap);
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

        let mapUpdated = false;

        if (binFile?.checksum && potentialMapsDb[binFile.checksum]) {
            const potentialMapIndex = potentialMapsDb[binFile.checksum].findIndex(m => m.name === oldName);
            if (potentialMapIndex > -1) {
                setPotentialMapsDb(prev => {
                    const newPotentialMaps = [...prev[binFile.checksum]];
                    newPotentialMaps[potentialMapIndex] = { ...newPotentialMaps[potentialMapIndex], name: trimmedNewName };
                    return { ...prev, [binFile.checksum]: newPotentialMaps };
                });
                mapUpdated = true;
            }
        }

        if (!mapUpdated && xdfFile) {
            const xdfMapIndex = xdfFile.definitions.findIndex(m => m.name === oldName);
            if (xdfMapIndex > -1) {
                setXdfFile(prev => {
                    const newDefinitions = [...prev!.definitions];
                    newDefinitions[xdfMapIndex] = { ...newDefinitions[xdfMapIndex], name: trimmedNewName };
                    return { ...prev!, definitions: newDefinitions };
                });
                mapUpdated = true;
            }
        }
        
        if (mapUpdated) {
            setSelectedMapName(trimmedNewName);
            toast({ title: 'Nome Atualizado', description: `O mapa foi renomeado para "${trimmedNewName}".` });
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível encontrar o mapa para renomear.' });
        }

        setIsEditNameModalOpen(false);
        setMapToEdit(null);
    };

    const handleExplainMap = async () => {
        if (isPlaying) {
            audioRef.current?.pause();
            return;
        }
        if (audioUrl && !isPlaying) {
            audioRef.current?.play();
            return;
        }
        if (!displayMap || !displayAxes || !selectedMapName) return;

        setIsExplaining(true);
        addLog(`A gerar explicação áudio para "${selectedMapName}"...`, 'info');
        setAudioUrl(null);

        try {
            const explanationResult = await explainMap({
                mapName: selectedMapName,
                mapData: displayMap,
                xAxis: displayAxes.x,
                yAxis: displayAxes.y,
                xAxisLabel: displayAxes.xLabel,
                yAxisLabel: displayAxes.yLabel
            });

            if (!explanationResult.success || !explanationResult.data?.explanation) {
                throw new Error(explanationResult.error || 'A IA não conseguiu gerar o texto da explicação.');
            }

            addLog('Texto da explicação gerado. A gerar áudio...', 'debug');

            const speechResult = await generateSpeech(explanationResult.data.explanation);

            if (!speechResult.success || !speechResult.data?.media) {
                throw new Error(speechResult.error || 'A IA não conseguiu gerar o áudio.');
            }

            setAudioUrl(speechResult.data.media);
            addLog('Explicação em áudio pronta.', 'success');

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            addLog(`Falha ao gerar explicação: ${msg}`, 'error');
            toast({ variant: 'destructive', title: 'Erro na Explicação', description: msg });
        } finally {
            setIsExplaining(false);
        }
    };

    useEffect(() => {
        if (audioUrl && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Erro ao reproduzir áudio:", e));
        }
    }, [audioUrl]);

    useEffect(() => {
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            // Auto-scrolling removed per user request
            // logContainer.scrollTop = logContainer.scrollHeight;
        }
    }, [logs]);


    return (
        <TooltipProvider>
            <div className="max-w-screen-2xl mx-auto">
                <audio ref={audioRef} src={audioUrl ?? undefined} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />
                <header className="text-center mb-8 flex items-center justify-center relative">
                    <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center justify-center gap-3">
                        <Sparkles className="text-primary w-8 h-8"/> TuneAssist AI
                    </h1>
                    <p className="text-lg text-muted-foreground mt-2 absolute top-full">Assistente de Afinação de ECU Potenciado por IA</p>
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
                                    <Button variant="outline" className="w-full" onClick={() => binInputRef.current?.click()}><FileUp className="mr-2"/> .BIN</Button>
                                    <Input ref={binInputRef} type="file" accept=".bin" onChange={(e) => handleFileChange(e, 'bin')} className="hidden" />

                                    <div className="space-y-1 pt-2">
                                        <Label className="text-xs text-muted-foreground">Marca e Modelo (para procura com IA e novos XDFs)</Label>
                                        <div className="grid grid-cols-2 gap-2">
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
                                            <Input 
                                                className="h-10"
                                                placeholder="Modelo (ex: R3)" 
                                                value={motorcycleModel} 
                                                onChange={(e) => setMotorcycleModel(e.target.value)} 
                                            />
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
                                    <div className="flex items-center gap-2">
                                        <Select onValueChange={handleMapSelect} disabled={availableMaps.length === 0} value={selectedMapName} >
                                            <SelectTrigger className="flex-1"><SelectValue placeholder={!binFile ? "Carregue um ficheiro BIN" : availableMaps.length === 0 ? "Nenhum mapa disponível" : "Selecione um mapa"} /></SelectTrigger>
                                            <SelectContent>
                                                {availableMaps.map(def => (
                                                  <SelectItem key={def.name} value={def.name}>
                                                      <div className="flex w-full items-center justify-between">
                                                          <div className="flex items-center gap-2 overflow-hidden">
                                                              {def.isPotential && <Sparkles className="h-4 w-4 text-primary shrink-0" />}
                                                              <span className="truncate">{def.name}</span>
                                                          </div>
                                                          <span className="ml-4 flex-shrink-0 font-mono text-xs text-muted-foreground">
                                                              0x{def.address.toString(16).toUpperCase()}
                                                          </span>
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
                                            <TooltipContent>
                                                <p>Editar Nome do Mapa</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">3. Corrigir Mapa (Opcional)</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Se os eixos ou os valores dos dados parecerem incorretos, corrija-os manualmente. A precisão da IA depende de dados base corretos.
                                    </p>
                                    <Button variant="secondary" className="w-full" onClick={() => setIsAxesModalOpen(true)} disabled={!displayMap}>
                                        <GitCompareArrows className="mr-2 h-4 w-4" />
                                        Corrigir Equações
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">4. Análise com IA</h3>
                                    <div className="space-y-2">
                                        <Button variant="outline" className="w-full" onClick={handleScanForMaps} disabled={!binFile || isScanning || selectedBrandForNewXdf === 'no-brand'}>
                                            {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Procurar Mapas Novos
                                        </Button>
                                         <Button variant="default" size="sm" className="w-full" onClick={handleValidateMap} disabled={!displayMap || isValidatingMap}>
                                            {isValidatingMap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                            Analisar e Corrigir Mapa
                                        </Button>
                                        <Button variant="outline" className="w-full" onClick={handleExplainMap} disabled={!displayMap || isExplaining}>
                                            {isExplaining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <AudioLines className="mr-2 h-4 w-4" />}
                                            {isExplaining ? 'A Gerar...' : isPlaying ? 'Pausar' : audioUrl ? 'Ouvir Novamente' : 'Ouvir Explicação'}
                                        </Button>
                                    </div>
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
                                </div>
                            </CardContent>
                        </Card>
                    </aside>

                    {/* Map View */}
                    <main className="xl:col-span-9">
                        <Card className="min-h-[85vh] flex flex-col">
                            <CardHeader>
                                <CardTitle>Visualizador de Mapas</CardTitle>
                                <CardDescription>{selectedMapName || "Carregue os ficheiros e selecione um mapa para começar"}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col min-h-0">
                                {displayMap && displayAxes ? (
                                    <Tabs defaultValue="2d" className="flex-1 flex flex-col">
                                        <TabsList className="mb-2">
                                            <TabsTrigger value="2d"><Table className="mr-2 h-4 w-4" />Visualização 2D</TabsTrigger>
                                            <TabsTrigger value="3d"><Box className="mr-2 h-4 w-4" />Visualização 3D</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="2d" forceMount className="flex-1 relative data-[state=inactive]:hidden">
                                            <MapTable
                                                key={mapRenderKey}
                                                mapData={displayMap} 
                                                xAxis={displayAxes.x} 
                                                yAxis={displayAxes.y} 
                                                xAxisLabel={displayAxes.xLabel} 
                                                yAxisLabel={displayAxes.yLabel}
                                                mapName={selectedMapName}
                                                onSortAxis={handleSortAxis}
                                                onSortByFirstColumn={handleSortByFirstColumn}
                                                onResetSort={handleResetSort}
                                                onCellChange={handleCellChange}
                                                valueFormat={valueFormat}
                                                selectedCells={selectedCells}
                                                onCellSelect={handleCellSelect}
                                            />
                                        </TabsContent>
                                        <TabsContent value="3d" className="flex-1 data-[state=inactive]:hidden">
                                            <SurfacePlot3D key={mapRenderKey + '-3d'} mapData={displayMap} xAxis={displayAxes.x} yAxis={displayAxes.y} xAxisLabel={displayAxes.xLabel} yAxisLabel={displayAxes.yLabel}/>
                                        </TabsContent>
                                    </Tabs>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                                        <FileUp className="w-16 h-16 mb-4"/>
                                        <p className="font-semibold">Nenhum mapa carregado</p>
                                        <p className="text-sm">Por favor carregue um ficheiro .BIN e procure por mapas ou carregue um .XDF.</p>
                                    </div>
                                )}
                            </CardContent>
                            {displayMap && (
                                <CardFooter className="border-t pt-4 justify-between items-center flex-wrap gap-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Label htmlFor="quick-edit-val" className="text-sm font-medium">Edição Rápida:</Label>
                                        <Input 
                                            id="quick-edit-val"
                                            type="number" 
                                            className="w-24 h-9" 
                                            placeholder="Valor"
                                            value={quickEditValue}
                                            onChange={(e) => setQuickEditValue(e.target.value)}
                                        />
                                        <Select value={quickEditType} onValueChange={(v: 'percent' | 'unit') => setQuickEditType(v)}>
                                            <SelectTrigger className="w-[100px] h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="percent">%</SelectItem>
                                                <SelectItem value="unit">Unid.</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button size="sm" variant="outline" onClick={() => handleQuickEdit('subtract')}>- Subtrair</Button>
                                        <Button size="sm" variant="outline" onClick={() => handleQuickEdit('add')}>+ Adicionar</Button>
                                        <p className="text-xs text-muted-foreground ml-2">
                                            {selectedCells.size > 0 ? `${selectedCells.size} células selecionadas` : 'Todas as células'}
                                        </p>
                                    </div>
                                    <Button onClick={handleSaveModifiedBin} disabled={!binFile || !workingMap}>
                                        <Save className="mr-2 h-4 w-4" />
                                        Guardar BIN Modificado
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    </main>
                </div>
                
                {/* Modals */}
                <EditAxesModal
                    open={isAxesModalOpen}
                    onOpenChange={setIsAxesModalOpen}
                    onConfirm={handleConfirmAxes}
                    currentDefinition={availableMaps.find(d => d.name === selectedMapName)}
                />
                <MapAnalysisResultModal open={isAnalysisModalOpen} onOpenChange={setIsAnalysisModalOpen} result={analysisResult} />
                <MapCorrectionSuggestionModal 
                    open={isSuggestionModalOpen} 
                    onOpenChange={setIsSuggestionModalOpen} 
                    suggestion={aiSuggestion} 
                    onAccept={handleAcceptSuggestion}
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

function MapCorrectionSuggestionModal({ open, onOpenChange, suggestion, onAccept, binBuffer, mapRenderKey }: { open: boolean, onOpenChange: (open: boolean) => void, suggestion: AISuggestion | null, onAccept: (corrections: { x: boolean; y: boolean; z: boolean; }) => void, binBuffer: ArrayBuffer | null, mapRenderKey: number }) {
    const [correctionsToApply, setCorrectionsToApply] = useState({ x: true, y: true, z: true });
    const [preview, setPreview] = useState<{ map: MapData; axes: { x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } } | null>(null);

    useEffect(() => {
        if (open && suggestion) {
            const initialCorrections = {
                x: suggestion.newDefinition.xAxisDef?.equation !== suggestion.originalDefinition.xAxisDef?.equation,
                y: suggestion.newDefinition.yAxisDef?.equation !== suggestion.originalDefinition.yAxisDef?.equation,
                z: !!suggestion.newDefinition.equation && suggestion.newDefinition.equation !== suggestion.originalDefinition.equation,
            };
            setCorrectionsToApply(initialCorrections);
        } else {
          setPreview(null);
        }
    }, [open, suggestion]);

    useEffect(() => {
        if (!open || !suggestion || !binBuffer) {
            if (open) setPreview(null);
            return;
        }

        try {
            const tempDefinition = JSON.parse(JSON.stringify(suggestion.originalDefinition));

            if (correctionsToApply.x && suggestion.newDefinition.xAxisDef?.equation) {
                tempDefinition.xAxisDef.equation = suggestion.newDefinition.xAxisDef.equation;
            }
            if (correctionsToApply.y && suggestion.newDefinition.yAxisDef?.equation) {
                tempDefinition.yAxisDef.equation = suggestion.newDefinition.yAxisDef.equation;
            }
            if (correctionsToApply.z && suggestion.newDefinition.equation) {
                tempDefinition.equation = suggestion.newDefinition.equation;
            }
            
            const correctedXAxis = readAxisFromBin(binBuffer, tempDefinition.xAxisDef);
            const correctedYAxis = readAxisFromBin(binBuffer, tempDefinition.yAxisDef);
            const { calculatedMap: correctedMap } = readAndCalculateMapFromBin(binBuffer, tempDefinition, correctedXAxis, correctedYAxis);

            setPreview({
                map: correctedMap,
                axes: {
                    x: correctedXAxis,
                    y: correctedYAxis,
                    xLabel: tempDefinition.xAxisDef?.label || 'Carga',
                    yLabel: tempDefinition.yAxisDef?.label || 'RPM',
                }
            });
        } catch (error) {
            console.error("Error generating correction preview", error);
            setPreview(null);
        }

    }, [open, correctionsToApply, suggestion, binBuffer]);

    if (!suggestion) return null;

    const { originalDefinition, newDefinition, reasoning } = suggestion;
    const hasXCorrection = newDefinition.xAxisDef?.equation !== originalDefinition.xAxisDef?.equation;
    const hasYCorrection = newDefinition.yAxisDef?.equation !== originalDefinition.yAxisDef?.equation;
    const hasZCorrection = !!newDefinition.equation && newDefinition.equation !== originalDefinition.equation;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl flex flex-col max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCompareArrows className="text-primary"/>
                        Sugestão de Correção da IA
                    </DialogTitle>
                    <DialogDescription>
                         A IA detetou um problema. Selecione as correções para pré-visualizar e aplicar.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                         <div>
                            <h3 className="font-semibold mb-2 text-center">Original</h3>
                            <div className="h-[400px] overflow-auto border rounded-md">
                              <MapTable
                                key={mapRenderKey + '-orig'}
                                mapData={suggestion.originalMap}
                                xAxis={suggestion.originalAxes.x}
                                yAxis={suggestion.originalAxes.y}
                                xAxisLabel={suggestion.originalAxes.xLabel}
                                yLabel={suggestion.originalAxes.yLabel}
                                mapName={suggestion.originalDefinition.name}
                                isEditable={false}
                                onSortAxis={() => {}}
                                onSortByFirstColumn={() => {}}
                                onResetSort={() => {}}
                                onCellChange={() => {}}
                                selectedCells={new Set()}
                                onCellSelect={() => {}}
                              />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-2 text-center">Pré-visualização (com correções selecionadas)</h3>
                            <div className="h-[400px] overflow-auto border rounded-md">
                               {preview ? (
                                 <MapTable
                                    key={mapRenderKey + '-prev'}
                                    mapData={preview.map}
                                    xAxis={preview.axes.x}
                                    yAxis={preview.axes.y}
                                    xAxisLabel={preview.axes.xLabel}
                                    yAxisLabel={preview.axes.yLabel}
                                    mapName={suggestion.newDefinition.name}
                                    isEditable={false}
                                    onSortAxis={() => {}}
                                    onSortByFirstColumn={() => {}}
                                    onResetSort={() => {}}
                                    onCellChange={() => {}}
                                    selectedCells={new Set()}
                                    onCellSelect={() => {}}
                                 />
                               ) : (
                                 <div className="flex items-center justify-center h-full text-muted-foreground">
                                    A gerar pré-visualização...
                                 </div>
                               )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-muted-foreground">Justificação da IA:</h3>
                            <p className="text-sm p-3 bg-muted rounded-md border">{reasoning}</p>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Comandos (Selecione para pré-visualizar e aplicar)</h3>
                            
                            {hasXCorrection && newDefinition.xAxisDef && originalDefinition.xAxisDef && (
                                <div className="flex items-start space-x-4 p-3 rounded-lg border bg-card hover:bg-muted/50">
                                    <Checkbox id="corr_x" className="mt-1" checked={correctionsToApply.x} onCheckedChange={(checked) => setCorrectionsToApply(p => ({...p, x: !!checked}))} />
                                    <div className="grid gap-1.5 leading-none">
                                        <label htmlFor="corr_x" className="text-sm font-medium">Corrigir Eixo X ({originalDefinition.xAxisDef.label})</label>
                                        <div className="text-xs space-y-1">
                                            <p>Original: <code className="bg-muted px-1 py-0.5 rounded">{originalDefinition.xAxisDef.equation}</code></p>
                                            <p className="flex items-center gap-2">Sugerida: <ChevronRight className="h-3 w-3" /> <code className="bg-primary/20 font-semibold px-1 py-0.5 rounded">{newDefinition.xAxisDef.equation}</code></p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {hasYCorrection && newDefinition.yAxisDef && originalDefinition.yAxisDef && (
                                <div className="flex items-start space-x-4 p-3 rounded-lg border bg-card hover:bg-muted/50">
                                    <Checkbox id="corr_y" className="mt-1" checked={correctionsToApply.y} onCheckedChange={(checked) => setCorrectionsToApply(p => ({...p, y: !!checked}))} />
                                    <div className="grid gap-1.5 leading-none">
                                        <label htmlFor="corr_y" className="text-sm font-medium">Corrigir Eixo Y ({originalDefinition.yAxisDef.label})</label>
                                        <div className="text-xs space-y-1">
                                            <p>Original: <code className="bg-muted px-1 py-0.5 rounded">{originalDefinition.yAxisDef.equation}</code></p>
                                            <p className="flex items-center gap-2">Sugerida: <ChevronRight className="h-3 w-3" /> <code className="bg-primary/20 font-semibold px-1 py-0.5 rounded">{newDefinition.yAxisDef.equation}</code></p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {hasZCorrection && (
                                 <div className="flex items-start space-x-4 p-3 rounded-lg border bg-card hover:bg-muted/50">
                                    <Checkbox id="corr_z" className="mt-1" checked={correctionsToApply.z} onCheckedChange={(checked) => setCorrectionsToApply(p => ({...p, z: !!checked}))} />
                                    <div className="grid gap-1.5 leading-none">
                                        <label htmlFor="corr_z" className="text-sm font-medium">Corrigir Dados do Mapa (Eixo Z)</label>
                                        <div className="text-xs space-y-1">
                                            <p>Original: <code className="bg-muted px-1 py-0.5 rounded">{originalDefinition.equation}</code></p>
                                            <p className="flex items-center gap-2">Sugerida: <ChevronRight className="h-3 w-3" /> <code className="bg-primary/20 font-semibold px-1 py-0.5 rounded">{newDefinition.equation}</code></p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!(hasXCorrection || hasYCorrection || hasZCorrection) && (
                                <p className="text-sm text-center text-muted-foreground p-4">Nenhuma nova equação foi sugerida, mas a IA forneceu a sua análise.</p>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-auto pt-4 border-t shrink-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Rejeitar</Button>
                    <Button onClick={() => onAccept(correctionsToApply)} disabled={!correctionsToApply.x && !correctionsToApply.y && !correctionsToApply.z}>
                        <CheckCircle className="mr-2"/>
                        Aplicar Correções Selecionadas
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
        if (open) {
            setNewName(currentName);
        }
    }, [open, currentName]);

    const handleConfirm = () => {
        onConfirm(currentName, newName);
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Nome do Mapa</DialogTitle>
                    <DialogDescription>
                        Escolha um novo nome para "{currentName}".
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                    <Label htmlFor="mapNameInput" className="sr-only">Nome do Mapa</Label>
                    <Input
                        id="mapNameInput"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Guardar Nome</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
