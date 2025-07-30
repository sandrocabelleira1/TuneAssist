'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LogMessage, XDFDefinition, MapData, AxisDataState, AxisDimension } from '@/lib/types';
import { parseXDF, readAndCalculateMapFromBin, generateChecksum, bufferToHex, writeMapToBin, recalculateRawMapFromCalculated, getCellAddress } from '@/lib/ecu';
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
import { AlertCircle, FileUp, Loader2, Pencil, RefreshCw, Save, TableIcon, Box, LineChart, Settings } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import dynamic from 'next/dynamic';

const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

const LinePlot2D = dynamic(() => import('@/components/line-plot'), {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});


function EditableMapCell({ 
    value: initialValue, 
    decimalPlaces,
    isEditable, 
    onCellChange, 
    rawValue, 
    viewMode, 
    dataSize,
    address,
}: { 
    value: number | null, 
    onCellChange: (value: string) => void, 
    isEditable: boolean, 
    decimalPlaces: number, 
    rawValue: number | null, 
    viewMode: 'calculated' | 'raw',
    dataSize: number,
    address: number | null
}) {
  const formatValue = useCallback((val: number | null) => {
    if (viewMode === 'raw') {
        if (val === null || isNaN(val)) return '';
        if (dataSize === 1) return val.toString(16).toUpperCase().padStart(2, '0');
        return val.toString(16).toUpperCase().padStart(4, '0');
    }

    if (val === null || isNaN(val)) return '';
    return String(Number(val.toFixed(decimalPlaces)));
  }, [decimalPlaces, viewMode, dataSize]);
    
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
  
  const inputElement = (
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
  
  if (address === null) {
      return inputElement;
  }

  return (
    <Tooltip>
        <TooltipTrigger asChild>{inputElement}</TooltipTrigger>
        <TooltipContent>
            <p>Endereço: <span className="font-mono">0x{address.toString(16).toUpperCase()}</span></p>
        </TooltipContent>
    </Tooltip>
  );
}


function MapTable({
  mapData,
  rawMapData,
  xAxis,
  yAxis,
  definition,
  onCellChange,
  isEditable = true,
  selectedCells,
  onCellSelect,
  viewMode,
  onViewModeChange,
  className,
}: {
  mapData: MapData;
  rawMapData: MapData;
  xAxis: AxisDataState;
  yAxis: AxisDataState;
  definition: XDFDefinition | undefined;
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
  isEditable?: boolean;
  selectedCells: Set<string>;
  onCellSelect: (rowIndex: number, colIndex: number, isCtrlOrCmd: boolean) => void;
  viewMode: 'calculated' | 'raw';
  onViewModeChange?: (isRaw: boolean) => void;
  className?: string;
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

  const yAxisFormatter = useCallback((val: string | number) => {
    if (typeof val !== 'number' || isNaN(val)) return val;
    return val.toFixed(definition?.yAxisDef?.decimalpl ?? 1);
  }, [definition]);
  
  const xAxisFormatter = useCallback((val: string | number) => {
    if (typeof val !== 'number' || isNaN(val)) return val;
    return val.toFixed(definition?.xAxisDef?.decimalpl ?? 1);
  }, [definition]);

  if (!mapData || mapData.length === 0 || !definition || !xAxis || !yAxis) {
    return null;
  }
  
  const Address = ({ addr }: { addr: number | null | undefined }) => {
    if (addr === null || addr === undefined || isNaN(addr) || addr === 0) return null;
    return <span className="ml-1 font-mono text-xs text-muted-foreground">(0x{addr.toString(16).toUpperCase()})</span>;
  };

  return (
    <div className={cn("overflow-auto", className)}>
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
                const address = getCellAddress(definition, yi, xi);

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
                      decimalPlaces={definition.decimalpl}
                      viewMode={mapViewMode}
                      dataSize={definition.dataSize}
                      address={address}
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

// Main Component
export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [debugMode, setDebugMode] = useState(false);
    
    // File & map state
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer; checksum: string } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; definitions: XDFDefinition[], brand: string | null } | null>(null);
    const [availableMaps, setAvailableMaps] = useState<XDFDefinition[]>([]);
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [selectedCells, setSelectedCells] = useState(new Set<string>());
    const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);

    const [rawMap, setRawMap] = useState<MapData | null>(null);
    const [workingMap, setWorkingMap] = useState<MapData | null>(null);
    const [sourceAxes, setSourceAxes] = useState<{ x: AxisDataState, y: AxisDataState } | null>(null);
    const [mapRenderKey, setMapRenderKey] = useState(0);
    const [mapViewMode, setMapViewMode] = useState<'calculated' | 'raw'>('calculated');

    // Modal state
    const [isAxesModalOpen, setIsAxesModalOpen] = useState(false);
    const [isXdfErrorModalOpen, setIsXdfErrorModalOpen] = useState(false);
    const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
    const [mapToEdit, setMapToEdit] = useState<XDFDefinition | null>(null);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);

    const selectedMapDefinition = useMemo(() => {
        return availableMaps.find(m => m.name === selectedMapName);
    }, [availableMaps, selectedMapName]);

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
            setWorkingMap(null);
            setRawMap(null);
            setSourceAxes(null);
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
        setAvailableMaps([]);
        setSelectedCells(new Set());
        setSelectedLineIndex(null);
        setLogs([]);

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
                    
                    resetState();
                    
                    const checksum = generateChecksum(buffer);
                    setBinFile({ name: file.name, buffer, checksum });
                    addLog(`Ficheiro BIN carregado: ${file.name}`, 'success');

                } else { // XDF
                    if (typeof buffer !== 'string') throw new Error("O ficheiro XDF não foi lido como texto.");
                    const { definitions, brand } = parseXDF(buffer);
                    if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    if (brand) addLog(`Marca da ECU detetada no XDF: ${brand}`, 'info');
                    setXdfFile({ name: file.name, definitions, brand });
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
        
        setSelectedMapName(name);
        setSelectedCells(new Set());
        setSelectedLineIndex(null);

        try {
            const { calculatedMap, rawMap: newRawMap, sortedAxes } = readAndCalculateMapFromBin(binFile.buffer, definition);
            
            setWorkingMap(calculatedMap);
            setRawMap(newRawMap); 
            setSourceAxes(sortedAxes);

            addLog(`Mapa carregado: ${name}.`, 'info');
            setMapRenderKey(p => p + 1);
            
        } catch (error) {
            const msg = `Erro ao ler o mapa do BIN: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ variant: 'destructive', title: "Erro de Leitura do Mapa", description: msg });
            setWorkingMap(null);
            setRawMap(null);
            setSourceAxes(null);
        }
    }, [binFile, availableMaps, addLog, toast]);
    
    const handleConfirmAxes = useCallback((data: { 
        xEquation: string, yEquation: string, zEquation: string,
        zIsBigEndian: boolean, xIsBigEndian: boolean, yIsBigEndian: boolean,
    }) => {
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
        newDef.isBigEndian = data.zIsBigEndian;

        newDef.xAxisDef.equation = data.xEquation;
        newDef.xAxisDef.isBigEndian = data.xIsBigEndian;

        newDef.yAxisDef.equation = data.yEquation;
        newDef.yAxisDef.isBigEndian = data.yIsBigEndian;
        
        const newAvailableMaps = availableMaps.map(def => 
            def.name === selectedMapName ? newDef : def
        );
        
        setAvailableMaps(newAvailableMaps);
        
        setTimeout(() => {
            handleMapSelect(selectedMapName);
            addLog(`Equações e ordem de bytes atualizadas para "${selectedMapName}".`, 'success');
            setIsAxesModalOpen(false);
            toast({ title: 'Configurações Aplicadas', description: 'O mapa foi recalculado com as novas configurações.' });
        }, 0);

    }, [selectedMapName, availableMaps, binFile, handleMapSelect, addLog, toast]);

    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
      if (!workingMap || !rawMap || !sourceAxes) return;

      const newValue = parseFloat(value);
      if (isNaN(newValue)) {
        addLog(`Valor inválido introduzido: "${value}". Apenas números são permitidos.`, 'error');
        setMapRenderKey(p => p + 1);
        return;
      }
      
      const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
      newWorkingMap[rowIndex][colIndex] = newValue;
      setWorkingMap(newWorkingMap);
    };

    const handlePointChange = useCallback((rowIndex: number, colIndex: number, newValue: number) => {
        if (!workingMap) return;

        const newWorkingMap = JSON.parse(JSON.stringify(workingMap));
        if (newWorkingMap[rowIndex] !== undefined && newWorkingMap[rowIndex][colIndex] !== undefined) {
             newWorkingMap[rowIndex][colIndex] = newValue;
             setWorkingMap(newWorkingMap);
        }
        
    }, [workingMap]);

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
            const finalRawMap = recalculateRawMapFromCalculated(workingMap, definition, sourceAxes);
            const modifiedBuffer = writeMapToBin(binFile.buffer, definition, finalRawMap);
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

    const saveButton = (
        <Button onClick={handleSaveModifiedBin} disabled={!binFile || !workingMap}>
            <Save className="mr-2 h-4 w-4" />
            Guardar BIN Modificado
        </Button>
    );

    return (
        <TooltipProvider>
            <div className="flex flex-1 flex-col xl:flex-row p-4 gap-4">
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                    <Card className="flex-shrink-0">
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
                                                <SelectValue placeholder={!binFile ? "Carregue um ficheiro BIN" : (xdfFile ? "Selecione um mapa" : "Carregue um XDF")} />
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
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="secondary" className="w-full" onClick={() => setIsAxesModalOpen(true)} disabled={!selectedMapDefinition}>
                                                <Settings className="mr-2 h-4 w-4" />
                                                Configurações do Mapa
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Editar equações e ordem de bytes para cada eixo.</TooltipContent>
                                    </Tooltip>
                                </div>

                                <div className="space-y-2">
                                     <h3 className="font-semibold text-primary">3. Ações</h3>
                                     <div className="grid grid-cols-1 gap-2">
                                         <Button onClick={resetState} variant="destructive" className="w-full">
                                             <RefreshCw className="mr-2 h-4 w-4" />
                                             Reiniciar Sessão
                                         </Button>
                                     </div>
                                </div>

                                 <div className="space-y-2">
                                     <h3 className="font-semibold text-primary">4. Guardar</h3>
                                     <div className="grid grid-cols-1 gap-2">
                                        {saveButton}
                                     </div>
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
                                    </CardTitle>
                                    <CardDescription>
                                        {selectedMapDefinition ? <span dangerouslySetInnerHTML={{ __html: `${selectedMapDefinition.name} <span class="font-mono text-xs text-muted-foreground ml-2">(0x${selectedMapDefinition.address.toString(16).toUpperCase()})</span>` }} /> : "Carregue os ficheiros e selecione um mapa para começar"}
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col p-6 pt-0 min-h-0">
                            {workingMap && sourceAxes && selectedMapDefinition ? (
                                <Tabs defaultValue="2d" className="flex flex-1 flex-col min-h-0">
                                    <TabsList className="mb-2 shrink-0">
                                        <TabsTrigger value="2d"><TableIcon className="mr-2 h-4 w-4" />Tabela 2D</TabsTrigger>
                                        <TabsTrigger value="plot-2d"><LineChart className="mr-2 h-4 w-4" />Gráfico 2D</TabsTrigger>
                                        <TabsTrigger value="3d"><Box className="mr-2 h-4 w-4" />Gráfico 3D</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="2d" className="flex flex-1 flex-col min-h-0">
                                        <div className="flex-1 overflow-auto min-h-0">
                                            <MapTable
                                                key={mapRenderKey}
                                                mapData={workingMap || []} 
                                                rawMapData={rawMap || []}
                                                xAxis={sourceAxes.x} 
                                                yAxis={sourceAxes.y} 
                                                definition={selectedMapDefinition}
                                                onCellChange={handleCellChange}
                                                selectedCells={selectedCells}
                                                onCellSelect={handleCellSelect}
                                                viewMode={mapViewMode}
                                                onViewModeChange={(isRaw) => setMapViewMode(isRaw ? 'raw' : 'calculated')}
                                            />
                                        </div>
                                        <div className="border-t pt-4 flex justify-end items-center mt-4 flex-shrink-0">
                                            {saveButton}
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="plot-2d" className="flex flex-1 flex-col min-h-0">
                                        <div className="relative flex-1 overflow-hidden min-h-0">
                                            <LinePlot2D
                                                mapData={workingMap}
                                                xAxis={sourceAxes.x}
                                                yAxis={sourceAxes.y}
                                                selectedLineIndex={selectedLineIndex}
                                                onLineSelect={setSelectedLineIndex}
                                                onPointChange={handlePointChange}
                                                yAxisLabel={selectedMapDefinition?.yAxisDef?.label}
                                                xAxisLabel={selectedMapDefinition?.xAxisDef?.label}
                                            />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="3d" className="flex-1 flex flex-col min-h-0">
                                        <div className="relative flex-1">
                                          <SurfacePlot3D key={mapRenderKey + '-3d'} mapData={workingMap} xAxis={sourceAxes.x.calculated} yAxis={sourceAxes.y.calculated} xAxisLabel={selectedMapDefinition?.xAxisDef?.label || 'Eixo X'} yAxisLabel={selectedMapDefinition?.yAxisDef?.label || 'Eixo Y'} />
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
                </div>
                
                <div className="w-full xl:w-96 flex flex-col gap-4 flex-shrink-0">
                    <Card className="flex-1 flex flex-col min-h-0">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Log de Operações</CardTitle>
                                <div className="flex items-center space-x-2">
                                    <Label htmlFor="debugMode" className="text-xs">Debug</Label>
                                    <Switch id="debugMode" checked={debugMode} onCheckedChange={setDebugMode} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col min-h-0">
                            <ScrollArea id="log-container" className="h-full w-full rounded-md border p-2 font-mono text-xs">
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
                </div>
                
                {/* Modals */}
                <EditAxesModal
                    open={isAxesModalOpen}
                    onOpenChange={setIsAxesModalOpen}
                    onConfirm={handleConfirmAxes}
                    currentDefinition={availableMaps.find(d => d.name === selectedMapName)}
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
    onConfirm: (data: { 
        xEquation: string, yEquation: string, zEquation: string,
        zIsBigEndian: boolean, xIsBigEndian: boolean, yIsBigEndian: boolean,
    }) => void, 
    currentDefinition: XDFDefinition | undefined,
}) {
    const [yEquation, setYEquation] = useState('');
    const [xEquation, setXEquation] = useState('');
    const [zEquation, setZEquation] = useState('');
    const [zIsBigEndian, setZIsBigEndian] = useState(false);
    const [xIsBigEndian, setXIsBigEndian] = useState(false);
    const [yIsBigEndian, setYIsBigEndian] = useState(false);

    useEffect(() => {
        if(open && currentDefinition) {
            setYEquation(currentDefinition.yAxisDef?.equation || 'X');
            setXEquation(currentDefinition.xAxisDef?.equation || 'X');
            setZEquation(currentDefinition.equation || 'X');
            setZIsBigEndian(currentDefinition.isBigEndian ?? false);
            setXIsBigEndian(currentDefinition.xAxisDef?.isBigEndian ?? false);
            setYIsBigEndian(currentDefinition.yAxisDef?.isBigEndian ?? false);
        }
    }, [open, currentDefinition]);

    if (!currentDefinition) return null;

    const yAxisLabel = currentDefinition.yAxisDef?.label || 'Eixo Y';
    const xAxisLabel = currentDefinition.xAxisDef?.label || 'Eixo X';
    const zAxisLabel = currentDefinition.name || 'Dados Principais';

    const handleConfirm = () => {
        onConfirm({ yEquation, xEquation, zEquation, zIsBigEndian, xIsBigEndian, yIsBigEndian });
    };

    const EndianCheckbox = ({ label, checked, onCheckedChange, disabled }: { label:string, checked: boolean, onCheckedChange: (checked: boolean) => void, disabled: boolean }) => (
        <div className={cn("flex items-center space-x-2", disabled && "opacity-50")}>
            <Checkbox id={`endian-${label}`} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
            <Label htmlFor={`endian-${label}`} className={cn(disabled && "text-muted-foreground")}>
                Inverter Ordem de Bytes (Big Endian)
            </Label>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configurações Avançadas do Mapa</DialogTitle>
                    <DialogDescription>
                        Ajuste as equações e a ordem de bytes (endianness) para cada eixo. Use 'X' como a variável.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-2 p-3 border rounded-md">
                        <Label htmlFor="zEquationText" className="font-semibold">Eixo Z ({zAxisLabel})</Label>
                        <Input id="zEquationText" value={zEquation} onChange={e => setZEquation(e.target.value)} />
                        <EndianCheckbox label="z" checked={zIsBigEndian} onCheckedChange={setZIsBigEndian} disabled={currentDefinition.dataSize < 2} />
                    </div>
                     <div className="space-y-2 p-3 border rounded-md">
                        <Label htmlFor="yEquationText" className="font-semibold">Eixo Y ({yAxisLabel})</Label>
                        <Input id="yEquationText" value={yEquation} onChange={e => setYEquation(e.target.value)} />
                         <EndianCheckbox label="y" checked={yIsBigEndian} onCheckedChange={setYIsBigEndian} disabled={(currentDefinition.yAxisDef?.dataSize ?? 1) < 2} />
                    </div>
                    <div className="space-y-2 p-3 border rounded-md">
                        <Label htmlFor="xEquationText" className="font-semibold">Eixo X ({xAxisLabel})</Label>
                        <Input id="xEquationText" value={xEquation} onChange={e => setXEquation(e.target.value)} />
                         <EndianCheckbox label="x" checked={xIsBigEndian} onCheckedChange={setXIsBigEndian} disabled={(currentDefinition.xAxisDef?.dataSize ?? 1) < 2} />
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
