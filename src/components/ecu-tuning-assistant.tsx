
'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { useForm, useFieldArray, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger, SidebarRail, SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UploadCloud, FileCog, Save, BrainCircuit, Cpu, BarChart3, Binary, Table2, Settings2, Loader2, Play, AlertTriangle, Star, Plus, Minus, Blend, Edit, ArrowRightLeft, ClipboardList, PlusCircle, Wand2, Trash2, Eraser, X, ChevronsUpDown, Check, Flame, Search, DownloadCloud, Download } from 'lucide-react';
import { parseXDF, readAndCalculateMapFromBinManual, writeMultipleMapsToBin, calculateCorrections } from '@/lib/ecu';
import type { XDFinition, MapData, LogMessage, ProcessedMap, ManualAxisConfig, AxisData, PlotOrientation, ModifiedCell, IgnitionTimingRun, PotentialMap } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/header';
import LinePlot2D from '@/components/line-plot';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getHeatmapColor, getTextColorForBackground } from '@/lib/colors';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import LogDataTable from '@/components/log-data-table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import IgnitionTimingAnalyzer from '@/components/ignition-timing-analyzer';
import MapScanner from '@/components/map-scanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


const SurfacePlot3D = dynamic(() => import('@/components/surface-plot'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>
});


type CellSelection = {
    start: { y: number; x: number } | null;
    end: { y: number; x: number } | null;
};

type MassEditPayload = {
    selection: CellSelection;
    currentMapData: MapData;
};

const logEntrySchema = z.object({
  loadValue: z.number(),
  rpm: z.string().optional(),
  lambda: z.string().optional(),
});

const dynoFormSchema = z.object({
  loadColumns: z.array(z.object({ id: z.string(), value: z.number() })),
  logRows: z.array(z.object({
    rpm: z.string(),
    lambdas: z.array(z.object({ value: z.string() }))
  }))
});

type DynoFormValues = z.infer<typeof dynoFormSchema>;


function MassEditDialog({
    payload,
    onClose,
    onMassEdit,
}: {
    payload: MassEditPayload;
    onClose: () => void;
    onMassEdit: (selection: CellSelection, operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate', value: number) => void;
}) {
    const [value, setValue] = useState('');
    const { toast } = useToast();

    if (!payload.selection.start || !payload.selection.end) return null;

    const handleAction = (operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate') => {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) && operation !== 'interpolate') { // Interpolate might not need a value
            toast({ title: "Valor Inválido", description: "Por favor, insira um número válido.", variant: "destructive"});
            return;
        }
        onMassEdit(payload.selection, operation, numericValue);
        onClose();
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edição em Massa</DialogTitle>
                    <DialogDescription>
                        Aplique uma operação a todas as células selecionadas.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="mass-edit-value" className="text-right">
                            Valor
                        </Label>
                        <Input
                            id="mass-edit-value"
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="col-span-3"
                            placeholder="Ex: 10 para 10% ou um valor absoluto"
                            autoFocus
                        />
                    </div>
                </div>
                <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-1">
                     <Button size="sm" onClick={() => handleAction('add_percent')}><Plus className="mr-1 h-4 w-4" /> Add %</Button>
                     <Button size="sm" onClick={() => handleAction('sub_percent')}><Minus className="mr-1 h-4 w-4" /> Sub %</Button>
                     <Button size="sm" variant="secondary" onClick={() => handleAction('set_value')}><Edit className="mr-1 h-4 w-4" /> Definir</Button>
                     <Button size="sm" variant="secondary" onClick={() => handleAction('interpolate')}><Blend className="mr-1 h-4 w-4"/> Interpolar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DataTable({ mapData, addresses, axes, selectedMapDefinition, onCellChange, onMassUpdate, aiModifiedCells }: {
    mapData: MapData | null;
    addresses: MapData | null;
    axes: { x: AxisData, y: AxisData } | null;
    selectedMapDefinition: XDFinition | undefined;
    onCellChange: (y: number, x: number, value: number) => void;
    onMassUpdate: (selection: CellSelection, operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate', value: number) => void;
    aiModifiedCells: Set<string>;
}) {
    const { toast } = useToast();
    const [isSelecting, setIsSelecting] = useState(false);
    const [selection, setSelection] = useState<CellSelection>({ start: null, end: null });
    const [massEditPayload, setMassEditPayload] = useState<MassEditPayload | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent<HTMLTableCellElement>, yi: number, xi: number) => {
        e.preventDefault();
        setIsSelecting(true);
        setSelection({ start: { y: yi, x: xi }, end: { y: yi, x: xi } });
    };

    const handleMouseMove = (yi: number, xi: number) => {
        if (isSelecting) {
            setSelection(prev => ({ ...prev, end: { y: yi, x: xi } }));
        }
    };

    const handleMouseUp = useCallback(() => {
        if (isSelecting) {
            setIsSelecting(false);
            if (selection.start && selection.end && mapData) {
                const startY = Math.min(selection.start.y, selection.end.y);
                const endY = Math.max(selection.start.y, selection.end.y);
                const startX = Math.min(selection.start.x, selection.end.x);
                const endX = Math.max(selection.start.x, selection.end.x);
                if (startY !== endY || startX !== endX) {
                    setMassEditPayload({ selection, currentMapData: mapData });
                }
            }
        }
    }, [isSelecting, selection, mapData]);

    const handleMassEditAndClose = (
        editSelection: CellSelection, 
        operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate', 
        value: number
    ) => {
        onMassUpdate(editSelection, operation, value);
        setMassEditPayload(null);
        setSelection({ start: null, end: null });
    };

    if (!axes || !selectedMapDefinition || !mapData) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Carregue os ficheiros e selecione um mapa para ver a tabela de dados.</p>
            </div>
        );
    }
    
    const { minVal, maxVal } = mapData ? mapData.flat().reduce((acc, val) => {
        if (val === null || val === undefined) return acc;
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
        } else {
             e.target.value = mapData?.[yi]?.[xi]?.toFixed(zAxisDecimalPlaces) ?? '';
        }
    };

    const isCellSelected = (y: number, x: number) => {
        if (!selection.start || !selection.end) return false;
        const minY = Math.min(selection.start.y, selection.end.y);
        const maxY = Math.max(selection.start.y, selection.end.y);
        const minX = Math.min(selection.start.x, selection.end.x);
        const maxX = Math.max(selection.start.x, selection.end.x);
        return y >= minY && y <= maxY && x >= minX && x <= maxX;
    };
    
    return (
        <div className="overflow-auto h-full" ref={tableRef} onMouseUp={handleMouseUp}>
            <table className="w-full border-collapse text-xs select-none">
                <thead>
                    <tr>
                        <th className="sticky top-0 left-0 z-20 bg-muted p-2 border border-border text-left font-semibold">
                            <div className="flex items-center justify-between">
                                <span>{yAxisLabel}</span>
                                <span className="mx-2">\</span>
                                <span>{xAxisLabel}</span>
                            </div>
                        </th>
                        {axes.x.calculated.map((x: any, i: number) => (
                            <th key={i} className="sticky top-0 z-10 bg-muted p-2 border border-border font-semibold">
                                {typeof x === 'number' && xAxisDecimalPlaces !== -1 ? x.toFixed(xAxisDecimalPlaces) : x}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {axes.y.calculated.map((y: any, yi: number) => (
                        <tr key={yi}>
                            <td className="sticky left-0 z-10 bg-muted p-2 border border-border font-bold text-right">
                                {typeof y === 'number' && yAxisDecimalPlaces !== -1 ? y.toFixed(yAxisDecimalPlaces) : y}
                            </td>
                            {mapData[yi]?.map((cell, xi) => {
                                const selected = isCellSelected(yi, xi);
                                const isAiModified = aiModifiedCells.has(`${yi}-${xi}`);
                                const bgColor = selected ? 'hsl(var(--primary) / 0.8)' : getHeatmapColor(cell, minVal, maxVal);
                                const textColor = selected ? 'hsl(var(--primary-foreground))' : getTextColorForBackground(bgColor);
                                const address = addresses?.[yi]?.[xi];
                                return (
                                    <td
                                        key={xi}
                                        className={cn("p-0 border border-border text-center h-10 transition-colors", {
                                            'outline outline-2 outline-offset-[-2px] outline-primary': selected,
                                            'outline outline-2 outline-offset-[-2px] outline-amber-400': isAiModified,
                                        })}
                                        style={{ backgroundColor: bgColor, color: textColor }}
                                        onMouseDown={(e) => handleMouseDown(e, yi, xi)}
                                        onMouseMove={() => handleMouseMove(yi, xi)}
                                    >
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger className="w-full h-full flex items-center justify-center p-0">
                                                    <input
                                                        type="text"
                                                        defaultValue={cell !== null && cell !== undefined ? cell.toFixed(zAxisDecimalPlaces) : '-'}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
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
             {massEditPayload && (
                <MassEditDialog
                    payload={massEditPayload}
                    onClose={() => {
                        setMassEditPayload(null);
                        setSelection({ start: null, end: null });
                    }}
                    onMassEdit={handleMassEditAndClose}
                />
            )}
        </div>
    );
}


function DynoEntryTable() {
    const { control, getValues, watch, setValue } = useFormContext<DynoFormValues>();
    const { fields: loadColumnFields, append: appendLoadColumn, remove: removeLoadColumn } = useFieldArray({ control, name: "loadColumns" });
    const { fields: logRowFields, append: appendLogRow, remove: removeLogRow } = useFieldArray({ control, name: "logRows" });
    const { toast } = useToast();

    const { processedMap } = useEcuTuningState();
    
    const loadAxis = useMemo(() => {
        if (!processedMap?.axes) return null;
        const { x, y } = processedMap.axes;
        const loadRegex = /tps|map|carga|load|throttle/i;
        if (x.label && loadRegex.test(x.label)) return x;
        if (y.label && loadRegex.test(y.label)) return y;
        // Default to Y if no match, a common convention
        return y; 
    }, [processedMap]);

    const [selectedLoadToAdd, setSelectedLoadToAdd] = useState('');

    const currentLoadColumnValues = watch('loadColumns').map(c => c.value);

    const handleAddLoadColumn = () => {
        if (!loadAxis) return;
        const loadValue = parseFloat(selectedLoadToAdd);
        if (isNaN(loadValue)) return;
        if (currentLoadColumnValues.includes(loadValue)) {
            toast({ title: "Carga duplicada", description: "Esta coluna de carga já foi adicionada.", variant: "destructive" });
            return;
        }
        appendLoadColumn({ id: `load_${loadValue}`, value: loadValue });
        
        logRowFields.forEach((_, rowIndex) => {
            setValue(`logRows.${rowIndex}.lambdas.${loadColumnFields.length}.value`, '');
        });
        setSelectedLoadToAdd('');
    };

    const handleAddRpmRow = () => {
        const newLambdas = loadColumnFields.map(() => ({ value: '' }));
        appendLogRow({ rpm: '', lambdas: newLambdas });
    };

    if (!processedMap || !loadAxis) {
        return <p className="text-sm text-muted-foreground">Selecione um mapa para ativar a entrada de dados do dinamómetro.</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                    <Label>Eixo de Carga ({loadAxis.label})</Label>
                    <Select value={selectedLoadToAdd} onValueChange={setSelectedLoadToAdd}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione um valor de carga para adicionar..." />
                        </SelectTrigger>
                        <SelectContent>
                            {loadAxis.calculated.map((val, idx) => (
                                <SelectItem key={idx} value={String(val)} disabled={currentLoadColumnValues.includes(Number(val))}>
                                    {val}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button type="button" onClick={handleAddLoadColumn} disabled={!selectedLoadToAdd}><PlusCircle className="mr-2 h-4 w-4" />Adicionar Coluna de Carga</Button>
            </div>
            
            {loadColumnFields.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">RPM</TableHead>
                                {loadColumnFields.map((field, index) => (
                                    <TableHead key={field.id}>
                                        <div className="flex items-center justify-between">
                                            <span>{field.value}</span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLoadColumn(index)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableHead>
                                ))}
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logRowFields.map((rowField, rowIndex) => (
                                <TableRow key={rowField.id}>
                                    <TableCell>
                                        <FormField
                                            control={control}
                                            name={`logRows.${rowIndex}.rpm`}
                                            render={({ field }) => <Input type="number" placeholder="Ex: 3000" {...field} />}
                                        />
                                    </TableCell>
                                    {loadColumnFields.map((_, colIndex) => (
                                        <TableCell key={`${rowField.id}-${colIndex}`}>
                                            <FormField
                                                control={control}
                                                name={`logRows.${rowIndex}.lambdas.${colIndex}.value`}
                                                render={({ field }) => <Input type="number" step="0.01" placeholder="Ex: 0.85" {...field} />}
                                            />
                                        </TableCell>
                                    ))}
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => removeLogRow(rowIndex)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="p-2 border-t">
                        <Button type="button" variant="secondary" size="sm" onClick={handleAddRpmRow}><Plus className="mr-2 h-4 w-4" />Adicionar Linha de RPM</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

const EcuTuningStateContext = React.createContext<{
    processedMap: ProcessedMap | null;
}>({ processedMap: null });

const useEcuTuningState = () => React.useContext(EcuTuningStateContext);


const initialManualConfig: ManualAxisConfig = {
    x: { equation: '', stride: undefined },
    y: { equation: '', stride: undefined },
    z: { equation: '', stride: undefined, rowStride: undefined },
    isBigEndian: true,
    sortX: false,
    sortY: false,
};

type StructureTemplate = {
    structureKey: string;
    config: ManualAxisConfig;
};


export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; content: string, definitions: XDFinition[], allTables: Map<string, Element> } | null>(null);
    const [logFile, setLogFile] = useState<{ name: string; content: string } | null>(null);
    const [logData, setLogData] = useState<any[]>([]);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    
    const [selectedMapIds, setSelectedMapIds] = useState<string[]>([]);
    const [activeMapId, setActiveMapId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('view-table');

    const [processedMap, setProcessedMap] = useState<ProcessedMap | null>(null);
    const [isModified, setIsModified] = useState(false);
    const [aiModifiedCells, setAiModifiedCells] = useState<Set<string>>(new Set());
    const [aiModifiedCellsCache, setAiModifiedCellsCache] = useState<Record<string, Set<string>>>({});
    
    const [selectedLine, setSelectedLine] = useState<number | null>(null);
    const [plotOrientation, setPlotOrientation] = useState<PlotOrientation>('y-vs-x');

    const [manualConfig, setManualConfig] = useState<ManualAxisConfig>(initialManualConfig);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [templateConfig, setTemplateConfig] = useState<StructureTemplate | null>(null);
    const [targetLambda, setTargetLambda] = useState<number | ''>(0.87);
    const [aggressiveness, setAggressiveness] = useState<number>(100);
    const [ignitionRuns, setIgnitionRuns] = useState<IgnitionTimingRun>({ base: [], modified: [] });

    const [processedMapCache, setProcessedMapCache] = useState<Record<string, ProcessedMap>>({});
    const [modifiedStatusCache, setModifiedStatusCache] = useState<Record<string, boolean>>({});
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);


    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);
    const logInputRef = useRef<HTMLInputElement>(null);

    const dynoForm = useForm<DynoFormValues>({
        resolver: zodResolver(dynoFormSchema),
        defaultValues: {
            loadColumns: [],
            logRows: []
        },
    });

    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        const id = `${Date.now()}-${Math.random()}`;
        setLogs(prev => [{ id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), message, type }, ...prev].slice(0, 100));
    }, []);

    const selectedMapDefinition = useMemo(() => {
        if (!activeMapId || !xdfFile) return undefined;
        return xdfFile.definitions.find(def => def.uniqueId === activeMapId);
    }, [activeMapId, xdfFile]);

    const anyMapModified = useMemo(() => {
        return Object.values(modifiedStatusCache).some(status => status);
    }, [modifiedStatusCache]);

    const clearAiModifications = () => {
        if (activeMapId) {
            addLog(`A limpar modificações de IA para o mapa "${selectedMapDefinition?.name ?? activeMapId}".`, 'info');
        }
        const newCache = { ...aiModifiedCellsCache };
        if (activeMapId && newCache[activeMapId]) {
            delete newCache[activeMapId];
        }
        setAiModifiedCellsCache(newCache);
        setAiModifiedCells(new Set());
    };
    
    const clearMapState = useCallback(() => {
        setSelectedMapIds([]);
        setActiveMapId(null);
        setProcessedMap(null);
        setIsModified(false);
        setAiModifiedCells(new Set());
        setAiModifiedCellsCache({});
        setProcessedMapCache({});
        setModifiedStatusCache({});
        setManualConfig(initialManualConfig);
        addLog('Seleção de mapa e cache limpos.', 'info');
    }, [addLog]);

    const handleClearLogData = useCallback(() => {
        setLogFile(null);
        setLogData([]);
        dynoForm.reset({ loadColumns: [], logRows: [] });
        if (logInputRef.current) logInputRef.current.value = '';
        addLog('Dados de ensaio limpos.', 'success');
        toast({ title: 'Dados Limpos', description: 'Os dados de ensaio foram limpos com sucesso.' });
    }, [addLog, toast, dynoForm]);

    const handleResetAll = useCallback(() => {
        setBinFile(null);
        setXdfFile(null);
        setLogFile(null);
        setLogData([]);
        setLogs([]);
        setSelectedMapIds([]);
        setActiveMapId(null);
        setProcessedMap(null);
        setIsModified(false);
        setAiModifiedCells(new Set());
        setAiModifiedCellsCache({});
        setProcessedMapCache({});
        setModifiedStatusCache({});
        setManualConfig(initialManualConfig);
        setTemplateConfig(null);
        setTargetLambda(0.87);
        setAggressiveness(100);
        setIgnitionRuns({ base: [], modified: [] });
        dynoForm.reset();
        
        if (binInputRef.current) binInputRef.current.value = '';
        if (xdfInputRef.current) xdfInputRef.current.value = '';
        if (logInputRef.current) logInputRef.current.value = '';

        const successMsg = 'Aplicação reiniciada para o estado inicial.';
        addLog(successMsg, 'success');
        toast({ title: 'Tudo Limpo', description: successMsg });
    }, [addLog, toast, dynoForm]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        addLog(`A ler o ficheiro ${file.name}...`, 'info');
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const buffer = event.target?.result;
            if (!buffer) {
                const errorMessage = `Erro ao ler o ficheiro ${file.name}`;
                addLog(errorMessage, 'error');
                toast({ title: 'Erro de Leitura', description: errorMessage, variant: 'destructive' });
                return;
            }
            
            if ((type === 'bin' && binFile?.name !== file.name) || (type === 'xdf' && xdfFile?.name !== file.name)) {
                clearMapState();
                if (type === 'bin') {
                    addLog(`Ficheiro BIN "${binFile?.name ?? 'anterior'}" substituído. A limpar dados de ensaio...`, "info");
                    handleClearLogData();
                    if(xdfFile) addLog(`Ficheiro XDF "${xdfFile.name}" mantido.`, "info");
                }
                if (type === 'xdf' && binFile) addLog(`Ficheiro BIN "${binFile.name}" mantido.`, "info");
            }

            if (type === 'bin' && buffer instanceof ArrayBuffer) {
                setBinFile({ name: file.name, buffer });
                const successMessage = `Ficheiro BIN carregado: ${file.name}`;
                addLog(successMessage, 'success');
                toast({ title: 'Ficheiro Carregado', description: successMessage });
            } else if (type === 'xdf' && typeof buffer === 'string') {
                 try {
                    addLog('A processar o ficheiro XDF...', 'info');
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
                    setXdfFile(null);
                 }
            }
        };
        
        reader.onerror = () => {
             const errorMessage = `Erro fatal ao ler o ficheiro ${file.name}.`;
             addLog(errorMessage, 'error');
             toast({ title: 'Erro de Leitura', description: errorMessage, variant: 'destructive' });
        }
        
        if (type === 'xdf') {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
        
    };

    const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        addLog(`A ler o ficheiro de log ${file.name}...`, 'info');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => {
                setLogFile({ name: file.name, content: Papa.unparse(results.data) });
                setLogData(results.data);
                const successMessage = `Ficheiro de log "${file.name}" carregado e processado com ${results.data.length} linhas.`;
                addLog(successMessage, 'success');
                toast({ title: 'Log Carregado', description: successMessage });
            },
            error: (error) => {
                const errorMessage = `Erro ao processar CSV: ${error.message}`;
                addLog(errorMessage, 'error');
                toast({ title: 'Erro de CSV', description: errorMessage, variant: 'destructive' });
                setLogData([]);
            }
        });

        if (logInputRef.current) logInputRef.current.value = '';
    };

    const handleAddDynoLogData = (data: DynoFormValues) => {
        if (!processedMap?.axes) {
            toast({ title: "Mapa não carregado", description: "Carregue um mapa para adicionar dados.", variant: "destructive" });
            return;
        }

        const { x: xAxis, y: yAxis } = processedMap.axes;
        
        const rpmRegex = /rpm/i;
        const loadRegex = /tps|map|carga|load|throttle/i;

        const getAxisByRegex = (regex: RegExp) => {
            if (xAxis.label && regex.test(xAxis.label)) return xAxis;
            if (yAxis.label && regex.test(yAxis.label)) return yAxis;
            return null;
        }

        const rpmAxis = getAxisByRegex(rpmRegex) || xAxis; // Default to X if no clear RPM
        const loadAxis = getAxisByRegex(loadRegex) || yAxis; // Default to Y if no clear load

        const loadAxisLabel = loadAxis.label || 'Carga';
        const rpmAxisLabel = rpmAxis.label || 'RPM';
        
        const newEntries: any[] = [];

        data.logRows.forEach(row => {
            if (row.rpm) {
                row.lambdas.forEach((lambda, colIndex) => {
                    if (lambda.value) {
                        const loadValue = data.loadColumns[colIndex].value;
                        const newEntry: Record<string, number> = {};
                        newEntry[loadAxisLabel] = Number(loadValue);
                        newEntry[rpmAxisLabel] = Number(row.rpm);
                        newEntry['Lambda'] = Number(lambda.value);
                        newEntries.push(newEntry);
                    }
                });
            }
        });

        if(newEntries.length === 0) {
            toast({title: "Nenhum Dado", description: "A tabela de ensaio está vazia.", variant: "destructive"});
            return;
        }

        setLogData(prev => [...prev, ...newEntries]);
        addLog(`${newEntries.length} ponto(s) de ensaio adicionados a partir da tabela.`, 'success');
        
        // Clear only the values, not the structure
        dynoForm.reset({
            loadColumns: data.loadColumns,
            logRows: data.logRows.map(r => ({ rpm: '', lambdas: r.lambdas.map(() => ({ value: '' })) }))
        });
    };


    const processAndCacheMap = useCallback(async (mapId: string, configToProcess: ManualAxisConfig) => {
        if (!mapId || !binFile || !xdfFile) return;

        const def = xdfFile.definitions.find(d => d.uniqueId === mapId);
        if (!def) {
            addLog(`Definição de mapa com ID "${mapId}" não encontrada.`, 'error');
            return null;
        }
        
        setIsProcessing(true);
        addLog(`A processar o mapa: ${def.name}...`, 'info');
        
        try {
            await new Promise(resolve => setTimeout(resolve, 0));
            addLog("A processar com as definições atuais (XDF/Manual)...", 'info');
            const result = readAndCalculateMapFromBinManual(binFile.buffer, def, configToProcess);
            
            setProcessedMapCache(prev => ({...prev, [mapId]: result}));
            addLog(`Mapa "${def.name}" processado com sucesso e colocado na cache.`, 'success');
            return result;
        } catch (error) {
            const errorMessage = `ERRO ao processar o mapa "${def.name}": ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            toast({ title: 'Erro ao Processar Mapa', description: (error as Error).message, variant: 'destructive' });
            return null;
        } finally {
            setIsProcessing(false);
        }
    }, [binFile, xdfFile, addLog, toast]);

    const setActiveMap = useCallback(async (mapId: string | null) => {
        if (activeMapId === mapId) return;
    
        if (!mapId) {
            setActiveMapId(null);
            setProcessedMap(null);
            setIsModified(false);
            return;
        }
    
        if (!xdfFile || !binFile) return;
    
        if (isModified && activeMapId && processedMap) {
            const currentDef = xdfFile.definitions.find(d => d.uniqueId === activeMapId);
            if (currentDef) {
                addLog(`A salvar alterações para "${currentDef.name}" na cache antes de trocar.`, 'info');
                setProcessedMapCache(prev => ({ ...prev, [activeMapId]: processedMap }));
                setModifiedStatusCache(prev => ({ ...prev, [activeMapId]: true }));
            }
        }
    
        setActiveMapId(mapId);
        setSelectedLine(0);
        setPlotOrientation('y-vs-x');
        setAiModifiedCells(aiModifiedCellsCache[mapId] || new Set());
    
        const newActiveMapDef = xdfFile.definitions.find(d => d.uniqueId === mapId);
        if (!newActiveMapDef) return;
    
        addLog(`Tornando o mapa "${newActiveMapDef.name}" ativo.`, 'info');
    
        const mapStructureKey = `${newActiveMapDef.rows}x${newActiveMapDef.cols}`;
        
        let configToApply = {
            ...initialManualConfig,
            x: { equation: newActiveMapDef.xAxisDef?.equation || 'x', stride: newActiveMapDef.xAxisDef?.dataSize },
            y: { equation: newActiveMapDef.yAxisDef?.equation || 'x', stride: newActiveMapDef.yAxisDef?.dataSize },
            z: { equation: newActiveMapDef.equation || 'x', stride: newActiveMapDef.dataSize, rowStride: newActiveMapDef.rowStride },
            isBigEndian: newActiveMapDef.isBigEndian,
            sortX: newActiveMapDef.xAxisDef?.requiresSort,
            sortY: newActiveMapDef.yAxisDef?.requiresSort,
        };
    
        if (templateConfig && templateConfig.structureKey === mapStructureKey) {
            addLog(`Padrão encontrado para estrutura ${mapStructureKey}. A aplicar substituições.`, 'info');
            configToApply = { ...configToApply, ...templateConfig.config };
        }
        
        setManualConfig(configToApply);
    
        const result = processedMapCache[mapId] ? processedMapCache[mapId] : await processAndCacheMap(mapId, configToApply);
        
        if (result) {
            setProcessedMap(result);
            // Check cache for modified status, otherwise it's false
            setIsModified(modifiedStatusCache[mapId] ?? false);
        } else {
            setProcessedMap(null);
            setIsModified(false);
        }
    
    }, [activeMapId, xdfFile, binFile, isModified, processedMap, processedMapCache, modifiedStatusCache, addLog, templateConfig, processAndCacheMap, aiModifiedCellsCache]);


    const handleManualConfigChange = (axis: 'x' | 'y' | 'z' | 'sortX' | 'sortY' | 'isBigEndian', value: any, subfield: 'equation' | 'stride' | 'rowStride' | null = null) => {
        setManualConfig(prev => {
            let newConfig;
            if (subfield && (axis === 'x' || axis === 'y' || axis === 'z')) {
                 const numValue = ((subfield === 'stride' || subfield === 'rowStride') && value === '') ? undefined : value;
                 newConfig = { ...prev, [axis]: { ...prev[axis], [subfield]: numValue }};
            } else {
                 newConfig = { ...prev, [axis]: value };
            }
            return newConfig;
        });
        clearAiModifications();
    };

    const handleApplyAndRecalculate = () => {
        if (!activeMapId) return;
        addLog(`A aplicar substituições manuais e a recalcular o mapa "${selectedMapDefinition?.name ?? activeMapId}".`, 'info');
        processAndCacheMap(activeMapId, manualConfig).then(result => {
             if(result) {
                 setProcessedMap(result);
                 setModifiedStatusCache(prev => ({...prev, [activeMapId]: false}));
                 setIsModified(false);
                 clearAiModifications();
             }
        });
    };

    const handleCellChange = (rowIndex: number, colIndex: number, newValue: number) => {
        if (!processedMap || !processedMap.calculatedMap || !activeMapId) return;

        addLog(`Alteração manual de célula [${rowIndex}, ${colIndex}] para ${newValue.toFixed(2)} no mapa "${selectedMapDefinition?.name ?? activeMapId}".`, 'info');
        const newMap = processedMap.calculatedMap.map(row => [...row]);
        newMap[rowIndex][colIndex] = newValue;
        
        const newProcessedMap = { ...processedMap, calculatedMap: newMap };
        setProcessedMap(newProcessedMap);
        
        setIsModified(true);
        clearAiModifications();
        setProcessedMapCache(prev => ({ ...prev, [activeMapId as string]: newProcessedMap }));
        setModifiedStatusCache(prev => ({...prev, [activeMapId as string]: true}));
    };

    const handlePointChange = (rowIndex: number, colIndex: number, newValue: number) => {
        if (!processedMap || !processedMap.calculatedMap || !activeMapId) return;
    
        const { originalIndices: xOriginalIndices } = processedMap.axes.x;
        const { originalIndices: yOriginalIndices } = processedMap.axes.y;
    
        const originalRowIdx = yOriginalIndices[rowIndex];
        const originalColIdx = xOriginalIndices[colIndex];
    
        addLog(`Alteração de ponto [${rowIndex}, ${colIndex}] (Original [${originalRowIdx}, ${originalColIdx}]) para ${newValue.toFixed(2)} no mapa "${selectedMapDefinition?.name ?? activeMapId}".`, 'info');
    
        const newMap = processedMap.calculatedMap.map(row => [...row]);
        newMap[rowIndex][colIndex] = newValue;
    
        const newProcessedMap = { ...processedMap, calculatedMap: newMap };
        setProcessedMap(newProcessedMap);
        
        setIsModified(true);
        clearAiModifications();
        setProcessedMapCache(prev => ({ ...prev, [activeMapId as string]: newProcessedMap }));
        setModifiedStatusCache(prev => ({...prev, [activeMapId as string]: true}));
    };


    const handleMassUpdate = (
        selection: CellSelection,
        operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate',
        value: number
    ) => {
        if (!processedMap || !processedMap.calculatedMap || !selection.start || !selection.end || !activeMapId) return;

        const newMap = processedMap.calculatedMap.map(row => [...row]);
        const { start, end } = selection;
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const currentValue = newMap[y][x];
                if (currentValue !== null && currentValue !== undefined) {
                    let newValue = currentValue;
                    switch (operation) {
                        case 'add_percent':
                            newValue = currentValue * (1 + value / 100);
                            break;
                        case 'sub_percent':
                            newValue = currentValue * (1 - value / 100);
                            break;
                        case 'set_value':
                             newValue = value;
                             break;
                        case 'interpolate': {
                            const topLeft = newMap[minY][minX]!;
                            const topRight = newMap[minY][maxX]!;
                            const bottomLeft = newMap[maxY][minX]!;
                            const bottomRight = newMap[maxY][maxX]!;
                            
                            const xRatio = (maxX - minX === 0) ? 0 : (x - minX) / (maxX - minX);
                            const yRatio = (maxY - minY === 0) ? 0 : (y - minY) / (maxY - minY);

                            const topInterpolation = topLeft + (topRight - topLeft) * xRatio;
                            const bottomInterpolation = bottomLeft + (bottomRight - topInterpolation) * yRatio;

                            newValue = topInterpolation + (bottomInterpolation - topInterpolation) * yRatio;
                            break;
                        }
                    }
                     newMap[y][x] = newValue;
                }
            }
        }
        
        const newProcessedMap = { ...processedMap, calculatedMap: newMap };
        setProcessedMap(newProcessedMap);
        
        setIsModified(true);
        clearAiModifications();
        setProcessedMapCache(prev => ({ ...prev, [activeMapId as string]: newProcessedMap }));
        setModifiedStatusCache(prev => ({...prev, [activeMapId as string]: true}));
        addLog(`Operação em massa "${operation}" com valor ${value} aplicada a ${ (maxY - minY + 1) * (maxX - minX + 1)} células.`, 'success');
    };
    
    const handleSave = () => {
        if (!binFile || !xdfFile || Object.keys(processedMapCache).length === 0) {
            const msg = "Faltam dados para salvar. Carregue os ficheiros e modifique um mapa primeiro.";
            addLog(msg, 'error');
            toast({ title: 'Erro ao Salvar', description: msg, variant: 'destructive' });
            return;
        }
        
        addLog("A preparar para salvar o ficheiro BIN...", 'info');
        
        const mapsToSave = Object.entries(processedMapCache)
            .filter(([mapId, _]) => modifiedStatusCache[mapId])
            .map(([mapId, mapData]) => {
                const definition = xdfFile.definitions.find(def => def.uniqueId === mapId);
                if (!definition) return null;
                return { definition, processedMap: mapData };
            }).filter(item => item !== null) as { definition: XDFinition; processedMap: ProcessedMap }[];
            
        if (mapsToSave.length === 0) {
            const msg = "Nenhuma modificação para salvar.";
            addLog(msg, 'info');
            toast({ title: 'Nada para Salvar', description: msg });
            return;
        }

        try {
            const newBinBuffer = writeMultipleMapsToBin(binFile.buffer, mapsToSave);
            
            const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const originalName = binFile.name.replace(/\.[^/.]+$/, "");
            a.download = `${originalName}_mod_${mapsToSave.length}map.bin`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            const successMsg = `Ficheiro ${a.download} salvo com ${mapsToSave.length} mapas modificados.`;
            addLog(successMsg, 'success');
            toast({ title: 'Salvo com Sucesso', description: successMsg });
            
            setBinFile({ name: a.download, buffer: newBinBuffer });
            
            mapsToSave.forEach(map => {
                setModifiedStatusCache(prev => ({...prev, [map.definition.uniqueId]: false}));
            });

            if (activeMapId && modifiedStatusCache[activeMapId] === false) {
                 setIsModified(false);
            }
            
            setAiModifiedCells(new Set());
            setAiModifiedCellsCache({});


        } catch (error) {
            const errorMsg = `Falha ao salvar o ficheiro BIN: ${(error as Error).message}`;
            addLog(errorMsg, 'error');
            toast({ title: 'Erro ao Salvar', description: errorMsg, variant: 'destructive' });
        }
    }
    
    const handleSetTemplate = () => {
        if (!selectedMapDefinition) {
            toast({ title: "Nenhum Mapa Selecionado", description: "Selecione um mapa primeiro para definir um padrão.", variant: "destructive"});
            return;
        }
        const structureKey = `${selectedMapDefinition.rows}x${selectedMapDefinition.cols}`;
        const newTemplate: StructureTemplate = {
            structureKey,
            config: manualConfig,
        };
        setTemplateConfig(newTemplate);
        const successMsg = `Padrão salvo para mapas ${structureKey}. Será aplicado automaticamente.`;
        addLog(successMsg, "success");
        toast({ title: "Padrão Salvo", description: successMsg });
    };

    const handleAiTune = async () => {
        if (selectedMapIds.length === 0 || logData.length === 0 || !targetLambda || !xdfFile || !binFile) {
            const msg = "Dados insuficientes. Selecione mapas, adicione dados de ensaio e defina um Lambda alvo.";
            addLog(msg, 'error');
            toast({ title: 'Ajuste Falhou', description: msg, variant: 'destructive' });
            return;
        }

        const numericTargetLambda = Number(targetLambda);
        if(isNaN(numericTargetLambda)) {
            addLog("Lambda Alvo inválido.", 'error');
            toast({ title: 'Ajuste Falhou', description: 'O Lambda Alvo deve ser um número.', variant: 'destructive' });
            return;
        }

        setIsProcessing(true);
        addLog(`A iniciar ajuste automático em ${selectedMapIds.length} mapas com Lambda Alvo ${numericTargetLambda.toFixed(2)} e agressividade de ${aggressiveness}%...`, 'info');
        
        let totalModifiedCells = 0;
        const newAiModifiedCellsByMap: Record<string, Set<string>> = {};
        
        for (const mapId of selectedMapIds) {
            const def = xdfFile.definitions.find(d => d.uniqueId === mapId);
            if (!def) continue;

            addLog(`Ajustando o mapa: ${def.name}...`, 'info');
            
            let mapToProcess = processedMapCache[mapId];
            if (!mapToProcess) {
                 const config = {
                    x: { equation: def.xAxisDef?.equation || 'x', stride: def.xAxisDef?.dataSize },
                    y: { equation: def.yAxisDef?.equation || 'x', stride: def.yAxisDef?.dataSize },
                    z: { equation: def.equation || 'x', stride: def.dataSize, rowStride: def.rowStride },
                    isBigEndian: def.isBigEndian, sortX: def.xAxisDef?.requiresSort, sortY: def.yAxisDef?.requiresSort,
                };
                mapToProcess = await processAndCacheMap(mapId, config);
            }

            if (!mapToProcess) {
                addLog(`Falha ao processar ${def.name} para o ajuste. A saltar.`, 'error');
                continue;
            }

            try {
                const { correctedMap, modifiedIndices } = calculateCorrections(mapToProcess, logData, numericTargetLambda, aggressiveness);
                
                const newProcessedMap = { ...mapToProcess, calculatedMap: correctedMap };
                
                setProcessedMapCache(prev => ({ ...prev, [mapId]: newProcessedMap }));
                setModifiedStatusCache(prev => ({...prev, [mapId]: true}));

                const modifiedSet = new Set<string>();
                modifiedIndices.forEach(cell => modifiedSet.add(`${cell.y}-${cell.x}`));
                newAiModifiedCellsByMap[mapId] = modifiedSet;

                if (mapId === activeMapId) {
                    setProcessedMap(newProcessedMap);
                    setIsModified(true);
                    setAiModifiedCells(modifiedSet);
                }

                addLog(`${modifiedIndices.length} células foram modificadas em ${def.name}.`, 'info');
                totalModifiedCells += modifiedIndices.length;

            } catch (error) {
                 const errorMsg = `Falha no ajuste automático para ${def.name}: ${(error as Error).message}`;
                 addLog(errorMsg, 'error');
            }
        }
        
        setAiModifiedCellsCache(prev => ({ ...prev, ...newAiModifiedCellsByMap }));
        setIsProcessing(false);
        const successMsg = `Ajuste automático aplicado a ${selectedMapIds.length} mapas. Total de ${totalModifiedCells} células modificadas.`;
        addLog(successMsg, 'success');
        toast({ title: 'Ajuste em Massa Aplicado', description: successMsg });
    };

    const togglePlotOrientation = () => {
        const newOrientation = plotOrientation === 'y-vs-x' ? 'x-vs-y' : 'y-vs-x';
        addLog(`A orientação do gráfico 2D foi alterada para ${newOrientation}.`, 'info');
        setPlotOrientation(newOrientation);
        setSelectedLine(0);
    };
    

    const handleMapSelectionChange = (id: string) => {
        const isPotential = id.startsWith('potential_');
    
        const newSelectedIds = selectedMapIds.includes(id)
            ? selectedMapIds.filter(mapId => mapId !== id)
            : [...selectedMapIds, id];
    
        setSelectedMapIds(newSelectedIds);
        const def = xdfFile?.definitions.find(d => d.uniqueId === id);
        addLog(`Mapa "${def?.name ?? id}" ${newSelectedIds.includes(id) ? 'selecionado' : 'desselecionado'}.`, 'info');
    
        // If unselecting the active map, or if there's no active map
        if ((activeMapId === id && !newSelectedIds.includes(id)) || (!activeMapId && newSelectedIds.length > 0)) {
            const nextActiveId = newSelectedIds.find(mapId => mapId !== id) || newSelectedIds[0] || null;
            setActiveMap(nextActiveId);
        } else if (newSelectedIds.length === 0) {
            setActiveMap(null);
        }
    };

    const handleLoadPotentialMap = (map: PotentialMap) => {
        addLog(`A carregar mapa potencial em 0x${map.address.toString(16).toUpperCase()}.`, 'info');
        
        if (!binFile) {
            addLog('Ficheiro BIN não está carregado. Impossível ler os dados do eixo.', 'error');
            return;
        }

        const tempId = `potential_${map.address}_${map.rows}x${map.cols}`;
        
        // This is a new feature: intelligently decide which axis is which and if it should be sorted
        let { xAxisType, yAxisType } = map;
        let finalXAxisAddress = map.xAxisAddress;
        let finalYAxisAddress = map.yAxisAddress;
        let finalRows = map.rows;
        let finalCols = map.cols;

        // Swap axes if Y is RPM and X is Load to follow convention
        if (yAxisType === 'RPM' && xAxisType === 'Carga') {
            [xAxisType, yAxisType] = [yAxisType, xAxisType];
            [finalXAxisAddress, finalYAxisAddress] = [finalYAxisAddress, finalXAxisAddress];
            [finalRows, finalCols] = [finalCols, finalRows];
            addLog('Os eixos X e Y foram trocados para seguir a convenção (RPM em X).', 'info');
        }

        const sortX = xAxisType === 'RPM';
        const sortY = yAxisType === 'RPM';

        const tempDef: XDFinition = {
            uniqueId: tempId,
            name: `Mapa Potencial @ 0x${map.address.toString(16).toUpperCase()}`,
            address: map.address,
            rows: finalRows,
            cols: finalCols,
            dataSize: map.dataSize,
            isBigEndian: map.isBigEndian,
            isRowMajor: true, 
            equation: map.equation || 'x',
            decimalpl: 2,
            xAxisDef: {
                label: finalXAxisAddress ? `${xAxisType} (0x${finalXAxisAddress.toString(16).toUpperCase()})` : `Eixo X (scan)`,
                count: finalCols,
                requiresSort: sortX, // Set sorting intelligently
                address: finalXAxisAddress,
                dataSize: map.dataSize,
                isBigEndian: map.isBigEndian,
                equation: 'x'
            },
            yAxisDef: {
                label: finalYAxisAddress ? `${yAxisType} (0x${finalYAxisAddress.toString(16).toUpperCase()})` : `Eixo Y (scan)`,
                count: finalRows,
                requiresSort: sortY, // Set sorting intelligently
                address: finalYAxisAddress,
                dataSize: map.dataSize,
                isBigEndian: map.isBigEndian,
                equation: 'x'
            },
            rowStride: map.rowStride
        };
        
        addLog(`Eixo X (colunas) identificado como ${xAxisType}, ordenação: ${sortX}.`, 'info');
        addLog(`Eixo Y (linhas) identificado como ${yAxisType}, ordenação: ${sortY}.`, 'info');

        const currentXdfDefs = xdfFile ? xdfFile.definitions.filter(d => d.uniqueId !== tempId) : [];
        const newDefs = [...currentXdfDefs, tempDef];

        setXdfFile(prev => ({
            name: prev?.name || "Manualmente Criado",
            content: prev?.content || "",
            definitions: newDefs,
            allTables: prev?.allTables || new Map()
        }));

        const newSelectedIds = [...new Set([...selectedMapIds, tempId])];
        setSelectedMapIds(newSelectedIds);
        setActiveMap(tempId);
        
        setActiveTab('view-table');
        toast({ title: "Mapa Potencial Carregado", description: "Dados preenchidos no painel de substituição. Ajuste e recalcule se necessário." });
    };
    
    const handleDownloadLog = () => {
        if (logs.length === 0) {
            toast({ title: 'Log Vazio', description: 'Não há nada para descarregar.', variant: 'default' });
            return;
        }

        const logContent = logs
            .slice() // Create a copy to avoid mutating state
            .reverse() // Oldest logs first
            .map(log => `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`)
            .join('\n');

        const blob = new Blob([logContent], { type: 'text/plain;charset=utf-t' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `tuneassist-log-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog('Log descarregado com sucesso.', 'success');
    };


    return (
      <EcuTuningStateContext.Provider value={{ processedMap }}>
        <div className="h-full w-full bg-background">
          <SidebarProvider>
            <Sidebar side="left" className="border-r">
              
              <SidebarHeader>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Cpu size={20} /> Painel de Controlo
                </h2>
              </SidebarHeader>
              <SidebarContent className="p-2 flex flex-col gap-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UploadCloud size={18} /> Ficheiros
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => binInputRef.current?.click()}
                    >
                      <Binary className="mr-2" />{' '}
                      {binFile?.name ? 'Trocar BIN' : 'Carregar .BIN'}
                    </Button>
                    <input
                      ref={binInputRef}
                      type="file"
                      accept=".bin"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, 'bin')}
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => xdfInputRef.current?.click()}
                    >
                      <FileCog className="mr-2" />{' '}
                      {xdfFile?.name ? 'Trocar XDF' : 'Carregar .XDF'}
                    </Button>
                    <input
                      ref={xdfInputRef}
                      type="file"
                      accept=".xdf"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, 'xdf')}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Table2 size={18} /> Seleção de Mapa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                      <PopoverTrigger asChild>
                          <Button
                              variant="outline"
                              className="w-full justify-between"
                              disabled={!binFile || !xdfFile}
                          >
                              <span className="truncate">
                                  {selectedMapIds.length === 0 && "Selecione mapas"}
                                  {selectedMapIds.length === 1 && xdfFile?.definitions.find(d => d.uniqueId === selectedMapIds[0])?.name}
                                  {selectedMapIds.length > 1 && `${selectedMapIds.length} mapas selecionados`}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                      </PopoverTrigger>
                       <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                          {binFile && xdfFile && (
                              <ScrollArea className="h-72">
                                 <div className="p-4 space-y-2">
                                     {xdfFile?.definitions.filter(d => !d.uniqueId.startsWith('potential_')).sort((a,b) => a.name.localeCompare(b.name)).map((def) => (
                                        <div key={def.uniqueId} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={def.uniqueId}
                                            checked={selectedMapIds.includes(def.uniqueId)}
                                            onCheckedChange={() => handleMapSelectionChange(def.uniqueId)}
                                          />
                                          <label
                                            htmlFor={def.uniqueId}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                                            onClick={() => handleMapSelectionChange(def.uniqueId)}
                                          >
                                            {def.name}
                                          </label>
                                        </div>
                                     ))}
                                 </div>
                              </ScrollArea>
                          )}
                       </PopoverContent>
                    </Popover>

                    {selectedMapIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                          {selectedMapIds.map(id => {
                              const def = xdfFile?.definitions.find(d => d.uniqueId === id);
                              if (!def) return null;
                              const isPotential = id.startsWith('potential_');
                              return (
                                  <Badge 
                                      key={id} 
                                      variant={id === activeMapId ? "default" : (isPotential ? "destructive" : "secondary")}
                                      className="cursor-pointer hover:ring-2 hover:ring-ring"
                                      onClick={() => setActiveMap(id)}
                                  >
                                      {def.name}
                                      <X 
                                        className="ml-1 h-3 w-3 rounded-full hover:bg-muted/50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMapSelectionChange(id);
                                        }}
                                      />
                                  </Badge>
                              )
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings2 size={18} /> Substituir
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Use para substituir a configuração do XDF. Útil para
                      depuração.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="y-equation"
                          className="font-semibold text-sm"
                        >
                          Equação Y
                        </Label>
                        <Input
                          id="y-equation"
                          placeholder="x"
                          value={manualConfig.y.equation}
                          onChange={(e) =>
                            handleManualConfigChange('y', e.target.value, 'equation')
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="y-stride"
                          className="font-semibold text-sm"
                        >
                          Passo Y (bytes)
                        </Label>
                        <Input
                          id="y-stride"
                          type="number"
                          placeholder="-"
                          value={manualConfig.y.stride ?? ''}
                          onChange={(e) =>
                            handleManualConfigChange(
                              'y',
                              e.target.value === ''
                                ? undefined
                                : parseInt(e.target.value),
                              'stride'
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="x-equation"
                          className="font-semibold text-sm"
                        >
                          Equação X
                        </Label>
                        <Input
                          id="x-equation"
                          placeholder="x"
                          value={manualConfig.x.equation}
                          onChange={(e) =>
                            handleManualConfigChange('x', e.target.value, 'equation')
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="x-stride"
                          className="font-semibold text-sm"
                        >
                          Passo X (bytes)
                        </Label>
                        <Input
                          id="x-stride"
                          type="number"
                          placeholder="-"
                          value={manualConfig.x.stride ?? ''}
                          onChange={(e) =>
                            handleManualConfigChange(
                              'x',
                              e.target.value === ''
                                ? undefined
                                : parseInt(e.target.value),
                              'stride'
                            )
                          }
                        />
                      </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="z-equation"
                          className="font-semibold text-sm"
                        >
                          Equação Z (Mapa)
                        </Label>
                        <Input
                          id="z-equation"
                          placeholder="x"
                          value={manualConfig.z.equation}
                          onChange={(e) =>
                            handleManualConfigChange('z', e.target.value, 'equation')
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="z-stride"
                          className="font-semibold text-sm"
                        >
                          Passo Z (bytes)
                        </Label>
                        <Input
                          id="z-stride"
                          type="number"
                          placeholder="-"
                          value={manualConfig.z.stride ?? ''}
                          onChange={(e) =>
                            handleManualConfigChange(
                              'z',
                              e.target.value === ''
                                ? undefined
                                : parseInt(e.target.value),
                              'stride'
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label
                          htmlFor="z-row-stride"
                          className="font-semibold text-sm"
                      >
                          Passo da Linha (bytes)
                      </Label>
                      <Input
                          id="z-row-stride"
                          type="number"
                          placeholder="Automático (Cols * Passo Z)"
                          value={manualConfig.z.rowStride ?? ''}
                          onChange={(e) =>
                            handleManualConfigChange(
                              'z',
                               e.target.value === ''
                                ? undefined
                                : parseInt(e.target.value),
                              'rowStride'
                            )
                          }
                      />
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="sort-x"
                          checked={manualConfig.sortX ?? false}
                          onCheckedChange={(checked) =>
                            handleManualConfigChange('sortX', checked)
                          }
                        />
                        <Label htmlFor="sort-x">Ordenar Eixo X</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="sort-y"
                          checked={manualConfig.sortY ?? false}
                          onCheckedChange={(checked) =>
                            handleManualConfigChange('sortY', checked)
                          }
                        />
                        <Label htmlFor="sort-y">Ordenar Eixo Y</Label>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="big-endian"
                        checked={manualConfig.isBigEndian ?? false}
                        onCheckedChange={(checked) =>
                          handleManualConfigChange('isBigEndian', checked)
                        }
                      />
                      <Label htmlFor="big-endian">Big Endian</Label>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={handleApplyAndRecalculate}
                        disabled={!activeMapId || isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : <Play className="mr-2 h-4 w-4" /> }
                        Aplicar e Recalcular
                      </Button>
                       <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleSetTemplate}
                          disabled={!activeMapId}
                      >
                          <Star className="mr-2 h-4 w-4" />
                          Usar como Padrão
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BrainCircuit size={18} /> Ações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={!anyMapModified || isProcessing}
                      onClick={handleSave}
                    >
                      <Save className="mr-2 h-4 w-4" /> Salvar .BIN Modificado
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleResetAll}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Resetar Tudo
                    </Button>
                  </CardContent>
                </Card>
              </SidebarContent>
              <SidebarFooter>
                <div className="p-2">
                  <div className="flex items-center justify-between mb-2 px-2">
                     <h3 className="font-semibold text-sm">
                        Log de Processamento
                     </h3>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownloadLog}>
                                    <Download size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Descarregar Log</p>
                            </TooltipContent>
                        </Tooltip>
                     </TooltipProvider>
                  </div>
                  <ScrollArea className="h-48 w-full rounded-md border p-2 font-mono text-xs">
                    {logs.length > 0 ? (
                      logs.map((log) => (
                        <div key={log.id} className="flex items-start">
                          <span className="text-muted-foreground/60 mr-2 shrink-0">
                            {log.timestamp}
                          </span>
                          <span
                            className={`break-words ${
                              log.type === 'error'
                                ? 'text-destructive font-semibold'
                                : log.type === 'success'
                                ? 'text-green-500 font-semibold'
                                : log.type === 'debug'
                                ? 'text-amber-500'
                                : 'text-foreground/80'
                            }`}
                          >
                            {log.message}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground/60 text-center py-4">
                        Aguardando ações...
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </SidebarFooter>
            </Sidebar>
            <SidebarInset>
              <Header />
              <main className="flex flex-col h-[calc(100%-3.5rem)]">
                <div className="flex items-center p-2 border-b">
                  <SidebarTrigger />
                  <div className="flex items-center ml-2">
                    <h1 className="text-lg font-semibold">
                      {selectedMapDefinition?.name || 'Nenhum Mapa Selecionado'}
                    </h1>
                    {isModified && (
                      <span className="ml-2 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                        Modificado
                      </span>
                    )}
                    {isProcessing && (
                      <Loader2 className="ml-3 h-5 w-5 animate-spin" />
                    )}
                  </div>
                </div>
                <div className="flex-1 flex flex-col p-4 gap-4 min-h-0">
                  <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex-1 flex flex-col w-full min-h-0"
                  >
                    <TabsList className="shrink-0">
                      <TabsTrigger value="view-table">
                        <Table2 className="mr-2" />
                        Tabela de Dados
                      </TabsTrigger>
                      <TabsTrigger value="view-3d">
                        <BarChart3 className="mr-2" />
                        Gráfico 3D
                      </TabsTrigger>
                      <TabsTrigger value="view-2d">
                        <BarChart3 className="mr-2" />
                        Gráfico 2D
                      </TabsTrigger>
                      <TabsTrigger value="fuel-analysis">
                          <ClipboardList className="mr-2" />
                          Análise de Combustível
                      </TabsTrigger>
                       <TabsTrigger value="ignition-analysis">
                          <Flame className="mr-2" />
                          Análise de Ignição
                      </TabsTrigger>
                      <TabsTrigger value="map-scanner">
                          <Search className="mr-2" />
                          Scanner de Mapas
                      </TabsTrigger>
                    </TabsList>
                    
                    <div className="flex-1 flex flex-col mt-4 min-h-0">
                      {isProcessing && !processedMap ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                          <p>A processar o mapa...</p>
                        </div>
                      ) : (
                        <>
                          <TabsContent value="view-table" className="flex-1 flex flex-col min-h-0">
                              <DataTable
                                  key={activeMapId}
                                  mapData={processedMap?.calculatedMap ?? null}
                                  addresses={processedMap?.addresses ?? null}
                                  axes={processedMap?.axes ?? null}
                                  selectedMapDefinition={selectedMapDefinition}
                                  onCellChange={handleCellChange}
                                  onMassUpdate={handleMassUpdate}
                                  aiModifiedCells={aiModifiedCells}
                              />
                          </TabsContent>
                          <TabsContent value="view-3d" className="flex-1 flex flex-col min-h-0">
                                <div className="h-full w-full">
                                    {processedMap?.axes && processedMap?.calculatedMap ? (
                                        <SurfacePlot3D
                                            mapData={processedMap.calculatedMap}
                                            xAxis={processedMap.axes.x.calculated}
                                            yAxis={processedMap.axes.y.calculated}
                                            xAxisLabel={processedMap.axes.x.label || 'Eixo X'}
                                            yAxisLabel={processedMap.axes.y.label || 'Eixo Y'}
                                            zAxisLabel={
                                            selectedMapDefinition?.name || 'Mapa Principal'
                                            }
                                        />
                                    ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <p>
                                        A aguardar dados completos do mapa para o gráfico
                                        3D.
                                        </p>
                                    </div>
                                    )}
                              </div>
                          </TabsContent>
                          <TabsContent value="view-2d" className="flex-1 flex flex-col min-h-0">
                            <div className="h-full w-full">
                                  <LinePlot2D
                                    mapData={processedMap?.calculatedMap ?? null}
                                    xAxis={processedMap?.axes?.x ?? null}
                                    yAxis={processedMap?.axes?.y ?? null}
                                    mapName={
                                      selectedMapDefinition?.name || 'Mapa Principal'
                                    }
                                    selectedLineIndex={selectedLine}
                                    onLineSelect={setSelectedLine}
                                    onPointChange={handlePointChange}
                                    orientation={plotOrientation}
                                    togglePlotOrientation={togglePlotOrientation}
                                  />
                            </div>
                          </TabsContent>
                          <TabsContent value="fuel-analysis" className="flex-1 flex flex-col gap-4 min-h-0">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <Card className="lg:col-span-2">
                                    <CardHeader>
                                        <CardTitle>Dados de Ensaio (Lambda)</CardTitle>
                                        <CardDescription>Carregue um ficheiro de log (.csv) ou adicione pontos de dados manualmente abaixo.</CardDescription>

                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <Button variant="outline" onClick={() => logInputRef.current?.click()} className="flex-1">
                                                <UploadCloud className="mr-2" /> {logFile ? `Trocar: ${logFile.name}` : 'Carregar Log de Ensaio (.csv)'}
                                            </Button>
                                            <input
                                              ref={logInputRef}
                                              type="file"
                                              accept=".csv"
                                              className="hidden"
                                              onChange={handleLogFileChange}
                                            />
                                            <Button variant="outline" size="icon" onClick={handleClearLogData} disabled={logData.length === 0}>
                                                <Eraser className="h-4 w-4" />
                                                <span className="sr-only">Limpar Dados de Ensaio</span>
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <Separator />
                                            <span className="text-xs text-muted-foreground">OU</span>
                                            <Separator />
                                        </div>
                                        
                                        <Form {...dynoForm}>
                                            <form onSubmit={dynoForm.handleSubmit(handleAddDynoLogData)} className="space-y-4">
                                              <DynoEntryTable />
                                              <Button type="submit" className="w-full" disabled={!processedMap || dynoForm.getValues('loadColumns').length === 0}>
                                                  <PlusCircle className="mr-2" /> Adicionar Pontos ao Ensaio
                                              </Button>
                                            </form>
                                        </Form>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Definições de IA</CardTitle>
                                        <CardDescription>Configure os parâmetros para o ajuste automático.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div>
                                            <Label htmlFor="target-lambda">Lambda Alvo</Label>
                                            <Input 
                                                id="target-lambda" 
                                                type="number" 
                                                step="0.01"
                                                value={targetLambda}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setTargetLambda(value === '' ? '' : parseFloat(value));
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="aggressiveness">Agressividade ({aggressiveness}%)</Label>
                                            <Slider
                                                id="aggressiveness"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[aggressiveness]}
                                                onValueChange={(value) => setAggressiveness(value[0])}
                                            />
                                        </div>
                                        <Button className="w-full" onClick={handleAiTune} disabled={selectedMapIds.length === 0 || logData.length === 0 || isProcessing}>
                                            <Wand2 className="mr-2" /> {isProcessing ? "Ajustando..." : `Ajustar ${selectedMapIds.length} Mapa(s)`}
                                        </Button>
                                    </CardContent>
                                </Card>
                            </div>
                            <div className="flex-1 border rounded-lg min-h-0">
                                {logData.length > 0 ? (
                                    <LogDataTable data={logData} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <p>Aguardando dados do ensaio...</p>
                                    </div>
                                )}
                            </div>
                          </TabsContent>
                          <TabsContent value="ignition-analysis" className="flex-1 flex flex-col min-h-0">
                              <IgnitionTimingAnalyzer 
                                runs={ignitionRuns} 
                                onRunsChange={setIgnitionRuns}
                                binFile={binFile}
                                processedMap={processedMap}
                                selectedMapDefinition={selectedMapDefinition}
                              />
                          </TabsContent>
                          <TabsContent value="map-scanner" className="flex-1 flex flex-col min-h-0">
                              <MapScanner
                                binFile={binFile}
                                onLoadMap={handleLoadPotentialMap}
                                addLog={addLog}
                              />
                          </TabsContent>
                        </>
                      )}

                      {!isProcessing && !processedMap && activeMapId === null && (
                        <TabsContent value="view-table" className="flex-1 flex flex-col mt-4 min-h-0">
                            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center h-full">
                              <div>
                                <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
                                <p className="mt-2 font-semibold">
                                  Nenhum dado para exibir.
                                </p>
                                <p className="text-sm">
                                  Carregue os seus ficheiros e selecione um mapa para
                                  iniciar.
                                </p>
                              </div>
                            </div>
                          </TabsContent>
                      )}
                    </div>
                  </Tabs>
                </div>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </EcuTuningStateContext.Provider>
    );
}
