
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, AxisDefinition, OriginalSortOrder } from '@/lib/types';
import { parseXDF, readMapFromBin, readAxisFromBin, generateChecksum, bufferToHex } from '@/lib/ecu';
import { validateMapType, findPotentialMaps } from '@/app/actions';
import { getHeatmapColor } from '@/lib/colors';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowDownAZ, ArrowUpNarrowWide, CheckCircle, ChevronRight, FileUp, GitCompareArrows, Loader2, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Table, Box, Undo2 } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import dynamic from 'next/dynamic';
import type { PlotlyProps } from 'react-plotly.js';

// Dynamically import Plotly to avoid SSR issues and show a loader
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});


function EditableMapCell({ value: initialValue, rowIndex, colIndex, onCellChange, isEditable, min, max }: { value: number | null, rowIndex: number, colIndex: number, onCellChange: (rowIndex: number, colIndex: number, value: string) => void, isEditable: boolean, min: number, max: number }) {
  const [value, setValue] = useState(initialValue === null || isNaN(initialValue) ? '' : initialValue.toFixed(2));

  useEffect(() => {
    setValue(initialValue === null || isNaN(initialValue) ? '' : initialValue.toFixed(2));
  }, [initialValue]);
  
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isEditable) {
      onCellChange(rowIndex, colIndex, e.target.value);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
  }

  return (
    <td className="p-0 border border-border text-center" style={{ backgroundColor: getHeatmapColor(initialValue, min, max) }}>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        readOnly={!isEditable}
        className={cn(
            "w-[60px] h-8 p-0 text-center bg-transparent border-none rounded-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background/80",
            !isEditable && "cursor-default focus-visible:ring-0"
        )}
      />
    </td>
  );
}


// Simplified MapTable with editable cells
function MapTable({
  mapData,
  xAxis,
  yAxis,
  xAxisLabel,
  yAxisLabel,
  onSortAxis,
  onSortByFirstColumn,
  onResetSort,
  onCellChange,
  isEditable = true,
}: {
  mapData: MapData;
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  yAxisLabel: string;
  onSortAxis: (axis: 'x' | 'y') => void;
  onSortByFirstColumn: () => void;
  onResetSort: () => void;
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
  isEditable?: boolean;
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

  // Transpose data for display if needed (Y-axis on top, X-axis on left)
  const transposedData = yAxis[0] !== undefined ? mapData[0]?.map((_, colIndex) => mapData.map(row => row[colIndex])) : [];

  const displayYAxis = xAxis; // Now displayed horizontally on top
  const displayXAxis = yAxis; // Now displayed vertically on the left

  return (
    <div className="overflow-auto relative h-full">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-card">
            <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-muted-foreground text-left min-w-[120px]">
              <div className="flex justify-between items-start">
                  <div>
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
                {typeof y === 'number' ? Math.round(y) : y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayXAxis.map((x, xi) => (
            <tr key={`row-${xi}`}>
              <td className="sticky left-0 z-10 bg-muted p-1 border border-border font-semibold text-center">
                {typeof x === 'number' ? x.toFixed(1) : x}
              </td>
              {displayYAxis.map((_y, yi) => {
                const cell = transposedData[yi]?.[xi];
                return (
                  <EditableMapCell
                    key={`cell-${xi}-${yi}`}
                    value={cell}
                    rowIndex={xi}
                    colIndex={yi}
                    onCellChange={onCellChange}
                    isEditable={isEditable}
                    min={min}
                    max={max}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// New 3D Surface Plot component
function SurfacePlot3D({ mapData, xAxis, yAxis, xAxisLabel, yAxisLabel }: { mapData: MapData; xAxis: (string | number)[]; yAxis: (string | number)[]; xAxisLabel: string; yAxisLabel: string; }) {
  const data: PlotlyProps['data'] = [{
    x: yAxis as any[],
    y: xAxis as any[],
    z: mapData as any[][],
    type: 'surface',
    colorscale: [
      [0, 'rgb(0,0,255)'],      // Blue for low values
      [0.5, 'rgb(0,255,0)'],    // Green for mid values
      [1, 'rgb(255,0,0)']       // Red for high values
    ],
    colorbar: {
      title: 'Valor',
      tickfont: { color: 'hsl(var(--foreground))' },
      titlefont: { color: 'hsl(var(--foreground))' }
    }
  }];

  const layout: PlotlyProps['layout'] = {
    title: '',
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: 'hsl(var(--foreground))' },
    scene: {
      xaxis: { title: yAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      yaxis: { title: xAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      zaxis: { title: 'Valor', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      camera: { eye: {x: 1.8, y: -1.8, z: 1.2} }
    },
    margin: { l: 0, r: 0, b: 0, t: 0 },
  };

  return (
    <div className="h-full w-full">
      <Plot
        data={data}
        layout={layout}
        useResizeHandler
        className="h-full w-full"
        config={{ responsive: true }}
      />
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
    const [workingMap, setWorkingMap] = useState<MapData | null>(null);
    const [sourceAxes, setSourceAxes] = useState<{ x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null>(null);
    const [displayMap, setDisplayMap] = useState<MapData | null>(null);
    const [displayAxes, setDisplayAxes] = useState<{ x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } | null>(null);
    const [originalSortOrder, setOriginalSortOrder] = useState<OriginalSortOrder | null>(null);
    const [mapRenderKey, setMapRenderKey] = useState(0);

    const [customAxes, setCustomAxes] = useState<Record<string, Record<string, { x: (string|number)[], y: (string|number)[] }>>>({});
    const [xdfLibrary, setXdfLibrary] = useState<Record<string, { name: string; content: string; brand?: string }>>({});
    const [selectedXdfFromLibrary, setSelectedXdfFromLibrary] = useState<string>('');
    const [selectedBrandForNewXdf, setSelectedBrandForNewXdf] = useState<string>('no-brand');
    const [activeXdfBrand, setActiveXdfBrand] = useState<string>('');


    // AI state
    const [isScanning, setIsScanning] = useState(false);
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
            if (!xdfFile) {
                // If there's no XDF, availableMaps should be empty (except for potential maps from scanning)
                setAvailableMaps(prev => prev.filter(m => m.isPotential));
            }
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
        
        // Merge with existing potential maps, preventing duplicates
        setAvailableMaps(prev => {
            const existingPotentials = prev.filter(m => m.isPotential);
            const validDefAddresses = new Set(validDefinitions.map(d => d.address));
            const uniquePotentials = existingPotentials.filter(p => !validDefAddresses.has(p.address));
            return [...validDefinitions, ...uniquePotentials];
        });
        
        if (selectedMapName && !validDefinitions.some(def => def.name === selectedMapName)) {
            setSelectedMapName('');
            setDisplayMap(null);
            setDisplayAxes(null);
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
        setWorkingMap(null); setSourceAxes(null);
        setDisplayMap(null); setDisplayAxes(null);
        setOriginalSortOrder(null);
        setIsValidatingMap(false);
        setAiSuggestion(null);
        setAnalysisResult(null);
        setSelectedXdfFromLibrary('');
        setActiveXdfBrand('');
        setSelectedBrandForNewXdf('no-brand');
        setAvailableMaps([]);
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
                    setDisplayMap(null); setDisplayAxes(null);
                    setAvailableMaps([]);
                    
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
            
            setSelectedMapName(''); setDisplayMap(null); setDisplayAxes(null);

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
        try {
            const tempEixoX = readAxisFromBin(binFile.buffer, definition.xAxisDef);
            const tempEixoY = readAxisFromBin(binFile.buffer, definition.yAxisDef);

            // The map data MUST be read AFTER the axes are calculated, in case the map equation uses axis values (x, y).
            const map = readMapFromBin(binFile.buffer, definition, tempEixoX, tempEixoY);

            const mapAxes = {
              x: tempEixoX,
              y: tempEixoY,
              xLabel: definition.xAxisDef?.label || 'Eixo X',
              yLabel: definition.yAxisDef?.label || 'Eixo Y',
            };
            
            setWorkingMap(map);
            setDisplayMap(JSON.parse(JSON.stringify(map)));
            setOriginalSortOrder({
              x: mapAxes.x.map((value, index) => ({ value, index })),
              y: mapAxes.y.map((value, index) => ({ value, index })),
            });
            
            if (binFile?.checksum) {
              const userAxes = customAxes[binFile.checksum]?.[name];
              if (userAxes) {
                  const newAxes = { ...mapAxes, x: userAxes.x, y: userAxes.y };
                  setSourceAxes(newAxes);
                  setDisplayAxes(newAxes);
                  addLog(`Eixos personalizados carregados para o mapa "${name}".`, 'info');
              } else {
                  setSourceAxes(mapAxes);
                  setDisplayAxes(mapAxes);
              }
            } else {
              setSourceAxes(mapAxes);
              setDisplayAxes(mapAxes);
            }
            
            setMapRenderKey(p => p + 1); // Force a re-render of the table components
            addLog(`Mapa carregado com sucesso: ${name}`, 'success');

        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
        }
    };
    
    const handleConfirmAxes = (newAxesData: { y: string, x: string }) => {
        if (!displayAxes || !selectedMapName) return;
        
        const newY = newAxesData.y.split(',').map(s => { const n = parseFloat(s.trim()); return isNaN(n) ? s.trim() : n; });
        const newX = newAxesData.x.split(',').map(s => { const n = parseFloat(s.trim()); return isNaN(n) ? s.trim() : n; });

        if (newY.length !== displayAxes.y.length || newX.length !== displayAxes.x.length) {
            addLog('O número de valores dos eixos não corresponde às dimensões originais.', 'error');
            toast({ variant: 'destructive', title: "Erro nos Eixos", description: "O número de valores deve corresponder às dimensões originais." });
            return;
        }
        
        const newAxesState = { ...displayAxes, x: newX, y: newY };
        setSourceAxes(newAxesState);
        setDisplayAxes(newAxesState);
        setOriginalSortOrder({
          x: newX.map((value, index) => ({ value, index })),
          y: newY.map((value, index) => ({ value, index })),
        });


        if (binFile?.checksum) {
          setCustomAxes(prev => ({
              ...prev,
              [binFile.checksum]: { ...(prev[binFile.checksum] || {}), [selectedMapName]: { x: newX, y: newY } }
          }));
          addLog('Eixos personalizados guardados para este ficheiro BIN.', 'success');
          toast({ title: 'Eixos Personalizados Guardados', description: 'As suas correções foram guardadas e serão aplicadas automaticamente a este mapa.' });
        } else {
          toast({ variant: 'destructive', title: "Erro", description: "Não foi possível guardar os eixos porque nenhum ficheiro BIN está carregado." });
          addLog('Não foi possível guardar os eixos personalizados: ficheiro BIN não carregado.', 'error');
        }
        
        setMapRenderKey(p => p + 1); // Force re-render
        setIsAxesModalOpen(false);
        addLog('Eixos do mapa atualizados.', 'success');
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
        } else { // Sorting columns
            newSortedMap = workingMap.map(row => newIndexMap.map(originalColIndex => row[originalColIndex]));
        }

        setDisplayAxes(prev => ({
            ...(prev!),
            [axis]: newSortedAxisValues,
        }));
        setDisplayMap(newSortedMap);
        addLog(`Eixo ${axis === 'x' ? displayAxes.xLabel : displayAxes.yLabel} ordenado.`, 'info');
    };

    const handleSortByFirstColumn = useCallback(() => {
        if (!workingMap || !sourceAxes) return;

        // Create pairs of [value_from_first_column, original_index]
        const sortable = workingMap.map((row, index) => ({
            value: row[0], // Sort by the first cell of each row
            index: index,
        }));

        // Sort the pairs based on the cell value
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

        // Create the new sorted map and sorted Y axis from the sorted indices
        const newSortedMap = sortable.map(item => workingMap[item.index]);
        const newSortedYAxis = sortable.map(item => sourceAxes.y[item.index]);
        
        setDisplayMap(newSortedMap);
        setDisplayAxes(prev => ({
            ...(prev!),
            y: newSortedYAxis,
        }));
        setMapRenderKey(p => p + 1);
        addLog(`Linhas ordenadas com base nos valores da primeira coluna (Z).`, 'info');
    }, [workingMap, sourceAxes, addLog]);
    
    const handleResetSort = () => {
        if (workingMap && sourceAxes) {
            setDisplayMap(JSON.parse(JSON.stringify(workingMap)));
            setDisplayAxes(JSON.parse(JSON.stringify(sourceAxes)));
            setMapRenderKey(p => p + 1); // Force re-render
            addLog('Ordenação do mapa revertida para o original.', 'info');
        }
    };
    
    // Handles changes from the editable cells in MapTable
    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
      if (!workingMap || !displayMap) return;

      const newValue = parseFloat(value);
      if (isNaN(newValue)) {
        addLog(`Valor inválido introduzido: "${value}". Apenas números são permitidos.`, 'error');
        // Re-render display map to revert the input field
        setMapRenderKey(p => p + 1);
        return;
      }
      
      // Since sorting is complex, we'll find the corresponding cell in the workingMap
      // by matching axis values. This is more robust than index mapping if axes have unique values.
      if (!displayAxes || !sourceAxes) return;

      const displayRowValue = displayAxes.y[rowIndex];
      const displayColValue = displayAxes.x[colIndex];
      
      const workingRowIndex = sourceAxes.y.findIndex(v => v === displayRowValue);
      const workingColIndex = sourceAxes.x.findIndex(v => v === displayColValue);

      if (workingRowIndex !== -1 && workingColIndex !== -1) {
        const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
        newWorkingMap[workingRowIndex][workingColIndex] = newValue;
        setWorkingMap(newWorkingMap);

        // Also update the display map to reflect the change immediately
        const newDisplayMap = JSON.parse(JSON.stringify(displayMap));
        newDisplayMap[rowIndex][colIndex] = newValue;
        setDisplayMap(newDisplayMap);
      } else {
        addLog('Não foi possível atualizar o valor: célula correspondente não encontrada após a ordenação.', 'error');
      }
    };


    const handleValidateMap = async () => {
        if (!displayMap || !displayAxes || !selectedMapName || !binFile || !xdfFile) return;

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
                    const correctedXAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
                    const correctedYAxisPreview = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);
                    const correctedMapPreview = readMapFromBin(binFile.buffer, newDefinition, correctedXAxisPreview, correctedYAxisPreview);
                    const correctedAxesPreview = {
                        x: correctedXAxisPreview,
                        y: correctedYAxisPreview,
                        xLabel: newDefinition.xAxisDef?.label || 'Eixo X',
                        yLabel: newDefinition.yAxisDef?.label || 'Eixo Y'
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
        if (!aiSuggestion || !xdfFile || !binFile || !selectedMapName) return;

        // Start with the original definition from before this suggestion
        const newDefinition = JSON.parse(JSON.stringify(aiSuggestion.originalDefinition)) as XDFDefinition;
        const suggestedDefinition = aiSuggestion.newDefinition;
        let appliedCorrectionsLog = [];

        // Conditionally apply corrections based on user's checkbox selection.
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
            // Recalculate map and axes based on the new, partially or fully updated definition
            const correctedXAxis = readAxisFromBin(binFile.buffer, newDefinition.xAxisDef);
            const correctedYAxis = readAxisFromBin(binFile.buffer, newDefinition.yAxisDef);
            const correctedMap = readMapFromBin(binFile.buffer, newDefinition, correctedXAxis, correctedYAxis);
            const newSourceAxes = {
                x: correctedXAxis,
                y: correctedYAxis,
                xLabel: newDefinition.xAxisDef?.label || 'Eixo X',
                yLabel: newDefinition.yAxisDef?.label || 'Eixo Y'
            };

            // Update all the component's state
            setWorkingMap(correctedMap);
            setDisplayMap(correctedMap);
            setSourceAxes(newSourceAxes);
            setDisplayAxes(newSourceAxes);
            setOriginalSortOrder({
              x: newSourceAxes.x.map((value, index) => ({ value, index })),
              y: newSourceAxes.y.map((value, index) => ({ value, index })),
            });
            
            // Update the main XDF definition state
            const newDefinitions = xdfFile.definitions.map(def => 
                def.name === selectedMapName ? newDefinition : def
            );
            setXdfFile({ ...xdfFile, definitions: newDefinitions });
            
            setMapRenderKey(p => p + 1); // Force re-render
            addLog(`Correções da IA aplicadas para: ${appliedCorrectionsLog.join(', ')} no mapa "${selectedMapName}".`, 'success');
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
        addLog(`A iniciar a procura de mapas com IA para a marca ${selectedBrandForNewXdf}...`, 'info');

        const scanBuffer = binFile.buffer.slice(0, 8192);
        const hexData = bufferToHex(scanBuffer);
        const existingMaps = xdfFile
            ? xdfFile.definitions.map(d => ({
                name: d.name,
                address: d.address,
                sizeInBytes: d.rows * d.cols * d.dataSize
            }))
            : [];

        const result = await findPotentialMaps({ binHexData: hexData, existingMaps, brand: selectedBrandForNewXdf });

        setIsScanning(false);

        if (result.success && result.data) {
            if (result.data.maps.length > 0) {
                const numMapsFound = result.data.maps.length;
                const message = `A IA encontrou ${numMapsFound} mapa${numMapsFound > 1 ? 's' : ''} potencial${numMapsFound > 1 ? 's' : ''}.`;
                addLog(message, 'success');
                toast({
                    title: "Mapas Encontrados!",
                    description: `Foram adicionados ${numMapsFound} mapa${numMapsFound > 1 ? 's' : ''} à lista de seleção.`
                });

                const newPotentialMaps: XDFDefinition[] = result.data.maps.map(pMap => ({
                    name: `${pMap.name} (IA)`,
                    address: pMap.address,
                    rows: pMap.rows,
                    cols: pMap.cols,
                    dataSize: pMap.dataSize,
                    isBigEndian: false, // Assume little-endian as a common default
                    equation: 'X',
                    xAxisDef: { address: null, count: pMap.cols, dataSize: 1, isBigEndian: false, equation: 'X', label: 'Coluna' },
                    yAxisDef: { address: null, count: pMap.rows, dataSize: 1, isBigEndian: false, equation: 'X', label: 'Linha' },
                    isPotential: true,
                }));

                setAvailableMaps(prev => {
                    const existingAddresses = new Set(prev.map(m => m.address));
                    const allKnownNames = new Set(prev.map(m => m.name));
                    const newMapsToAdd: XDFDefinition[] = [];

                    // First, filter out maps with addresses that already exist
                    const mapsToProcess = newPotentialMaps.filter(pMap => !existingAddresses.has(pMap.address));

                    // Then, ensure unique names for the new maps
                    mapsToProcess.forEach(newMap => {
                        let finalName = newMap.name;
                        let counter = 2;
                        while (allKnownNames.has(finalName)) {
                            // If "Map (IA)" exists, try "Map (IA) (2)", then "(3)", etc.
                            // The base name for appending the counter should be the original name, not the one with the previous counter.
                            finalName = `${newMap.name.replace(/ \(\d+\)$/, '')} (${counter})`;
                            counter++;
                        }
                        newMap.name = finalName;
                        newMapsToAdd.push(newMap);
                        allKnownNames.add(finalName); // Add the newly generated unique name to the set for subsequent checks
                    });
                    
                    return [...prev, ...newMapsToAdd];
                });
            } else {
                const analysisMessage = result.data.analysis || 'A IA concluiu a análise mas não encontrou novos mapas potenciais.';
                addLog(analysisMessage, 'info');
                toast({
                    title: "Procura Concluída",
                    description: analysisMessage,
                    duration: 8000
                });
            }
        } else if (result.error) {
            addLog(`Erro ao procurar mapas: ${result.error}`, 'error');
            toast({ variant: 'destructive', title: "Falha na Procura", description: result.error });
        }
    };


    return (
        <TooltipProvider>
            <div className="max-w-screen-2xl mx-auto">
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
                                    <Select onValueChange={handleMapSelect} disabled={availableMaps.length === 0} value={selectedMapName}>
                                        <SelectTrigger><SelectValue placeholder={!binFile ? "Carregue um ficheiro BIN" : availableMaps.length === 0 ? "Nenhum mapa disponível" : "Selecione um mapa"} /></SelectTrigger>
                                        <SelectContent>
                                            {availableMaps.map(def => (
                                              <SelectItem key={def.name} value={def.name} className="flex items-center">
                                                  {def.isPotential && <Sparkles className="mr-2 h-4 w-4 text-primary shrink-0" />}
                                                  <span>{def.name}</span>
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">3. Corrigir Eixos (Opcional)</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Se os eixos (RPM, Carga, etc.) parecerem incorretos, corrija-os manualmente. A precisão da IA depende de eixos corretos.
                                    </p>
                                    <Button variant="secondary" className="w-full" onClick={() => setIsAxesModalOpen(true)} disabled={!displayMap}>
                                        <GitCompareArrows className="mr-2 h-4 w-4" />
                                        Corrigir Eixos do Mapa
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold text-primary">4. Análise com IA</h3>
                                    <div className="space-y-2">
                                        <Button variant="outline" className="w-full" onClick={handleScanForMaps} disabled={!binFile || isScanning || selectedBrandForNewXdf === 'no-brand'}>
                                            {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Procurar Mapas Novos
                                        </Button>
                                         <Button variant="default" size="sm" className="w-full" onClick={handleValidateMap} disabled={!displayMap || isValidatingMap || !xdfFile}>
                                            {isValidatingMap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                            Analisar e Corrigir Mapa
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
                                                onSortAxis={handleSortAxis}
                                                onSortByFirstColumn={handleSortByFirstColumn}
                                                onResetSort={handleResetSort}
                                                onCellChange={handleCellChange}
                                            />
                                        </TabsContent>
                                        <TabsContent value="3d" forceMount className="flex-1 data-[state=inactive]:hidden">
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
                        </Card>
                    </main>
                </div>
                
                {/* Modals */}
                <EditAxesModal open={isAxesModalOpen} onOpenChange={setIsAxesModalOpen} onConfirm={handleConfirmAxes} currentAxes={displayAxes} />
                <MapAnalysisResultModal open={isAnalysisModalOpen} onOpenChange={setIsAnalysisModalOpen} result={analysisResult} />
                <MapCorrectionSuggestionModal 
                    open={isSuggestionModalOpen} 
                    onOpenChange={setIsSuggestionModalOpen} 
                    suggestion={aiSuggestion} 
                    onAccept={handleAcceptSuggestion}
                    binBuffer={binFile?.buffer || null}
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
                    <DialogTitle>Corrigir e Salvar Eixos do Mapa</DialogTitle>
                    <DialogDescription>
                        Os eixos corrigidos serão guardados e carregados automaticamente para este mapa neste ficheiro BIN.
                    </DialogDescription>
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
                    <Button onClick={() => onConfirm({ y: yAxis, x: xAxis })}>Confirmar e Salvar</Button>
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

function MapCorrectionSuggestionModal({ open, onOpenChange, suggestion, onAccept, binBuffer }: { open: boolean, onOpenChange: (open: boolean) => void, suggestion: AISuggestion | null, onAccept: (corrections: { x: boolean; y: boolean; z: boolean; }) => void, binBuffer: ArrayBuffer | null }) {
    const [correctionsToApply, setCorrectionsToApply] = useState({ x: true, y: true, z: true });
    const [preview, setPreview] = useState<{ map: MapData; axes: { x: (string|number)[], y: (string|number)[], xLabel: string, yLabel: string } } | null>(null);

    // Effect to initialize state when modal opens
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

    // Effect to update the preview whenever `correctionsToApply` changes
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
            const correctedMap = readMapFromBin(binBuffer, tempDefinition, correctedXAxis, correctedYAxis);

            setPreview({
                map: correctedMap,
                axes: {
                    x: correctedXAxis,
                    y: correctedYAxis,
                    xLabel: tempDefinition.xAxisDef?.label || 'Eixo X',
                    yLabel: tempDefinition.yAxisDef?.label || 'Eixo Y',
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
                                yAxisLabel={suggestion.originalAxes.yLabel}
                                isEditable={false}
                                onSortAxis={() => {}}
                                onSortByFirstColumn={() => {}}
                                onResetSort={() => {}}
                                onCellChange={() => {}}
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
                                    isEditable={false}
                                    onSortAxis={() => {}}
                                    onSortByFirstColumn={() => {}}
                                    onResetSort={() => {}}
                                    onCellChange={() => {}}
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
