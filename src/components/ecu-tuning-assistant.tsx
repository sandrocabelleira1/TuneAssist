'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { useForm, useFieldArray, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UploadCloud, FileCog, Save, BrainCircuit, Cpu, BarChart3, Binary, Table2, Settings2, Loader2, Play, AlertTriangle, Star, Plus, Minus, Blend, Edit, ArrowRightLeft, ClipboardList, PlusCircle, Wand2, Trash2, Eraser, X, ChevronsUpDown, Check, Flame, Search, Download, LineChart as LineChartIcon, FolderClock, ChevronDown, Info, RotateCcw, Cloud, CloudUpload, Clock, HardDriveDownload } from 'lucide-react';
import { parseXDF, readAndCalculateMapFromBinManual, writeMultipleMapsToBin, calculateCorrections } from '@/lib/ecu';
import type { XDFinition, MapData, LogMessage, ProcessedMap, ManualAxisConfig, AxisData, PlotOrientation, ModifiedCell, IgnitionTimingRun, BackupFile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/header';
import LinePlot2D from '@/components/line-plot';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getHeatmapColor, getTextColorForBackground } from '@/lib/colors';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { useUser, useFirestore, useAuth, useMemoFirebase } from '@/firebase';
import { collection, serverTimestamp, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useCollection } from '@/firebase';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


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
    onMassEdit: (selection: CellSelection, operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate' | 'revert', value: number) => void;
}) {
    const [value, setValue] = useState('');
    const { toast } = useToast();

    if (!payload.selection.start || !payload.selection.end) return null;

    const handleAction = (operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate' | 'revert') => {
        const numericValue = parseFloat(value);
        if (operation !== 'interpolate' && operation !== 'revert' && isNaN(numericValue)) {
            toast({ title: "Valor Inválido", description: "Por favor, insira um número válido para esta operação.", variant: "destructive"});
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
                        Aplique uma operação a todas as células selecionadas. A interpolação usa os cantos da seleção.
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
                            placeholder="Ex: 10 para 10%, ou um valor absoluto"
                            autoFocus
                        />
                    </div>
                </div>
                <DialogFooter className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                     <Button size="sm" onClick={() => handleAction('add_percent')}><Plus className="mr-1 h-4 w-4" /> Add %</Button>
                     <Button size="sm" onClick={() => handleAction('sub_percent')}><Minus className="mr-1 h-4 w-4" /> Sub %</Button>
                     <Button size="sm" variant="secondary" onClick={() => handleAction('set_value')}><Edit className="mr-1 h-4 w-4" /> Definir</Button>
                     <Button size="sm" variant="secondary" onClick={() => handleAction('interpolate')}><Blend className="mr-1 h-4 w-4"/> Interpolar</Button>
                     <Button size="sm" variant="outline" onClick={() => handleAction('revert')}>Bin Original</Button>
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
    onMassUpdate: (selection: CellSelection, operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate' | 'revert', value: number) => void;
    aiModifiedCells: Set<string>;
}) {
    const { toast } = useToast();
    const [isSelecting, setIsSelecting] = useState(false);
    const [selection, setSelection] = useState<CellSelection>({ start: null, end: null });
    const [massEditPayload, setMassEditPayload] = useState<MassEditPayload | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const hasDraggedRef = useRef(false);

    const handleMouseDown = (e: React.MouseEvent<HTMLTableCellElement>, yi: number, xi: number) => {
        // Don't prevent default on the input itself
        if ((e.target as HTMLElement).tagName.toLowerCase() !== 'input') {
            e.preventDefault();
        }
        setIsSelecting(true);
        setSelection({ start: { y: yi, x: xi }, end: { y: yi, x: xi } });
        hasDraggedRef.current = false;
    };

    const handleMouseMove = (yi: number, xi: number) => {
        if (isSelecting) {
            setSelection(prev => {
                if (prev.end?.y !== yi || prev.end?.x !== xi) {
                    hasDraggedRef.current = true;
                }
                return { ...prev, end: { ...prev.end, y: yi, x: xi } };
            });
        }
    };

    const handleMouseUp = useCallback(() => {
        if (isSelecting) {
            setIsSelecting(false);
            if (selection.start && selection.end && mapData && hasDraggedRef.current) {
                const isSingleCellSelection = selection.start.y === selection.end.y && selection.start.x === selection.end.x;
                if (!isSingleCellSelection) {
                    setMassEditPayload({ selection, currentMapData: mapData });
                }
            }
             hasDraggedRef.current = false;
        }
    }, [isSelecting, selection, mapData]);


    const handleMassEditAndClose = (
        editSelection: CellSelection, 
        operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate' | 'revert', 
        value: number
    ) => {
        onMassUpdate(editSelection, operation, value);
        setMassEditPayload(null);
        setSelection({ start: null, end: null });
    };

    if (!axes || !selectedMapDefinition || !mapData) {
        return (
            <div className="flex items-center justify-center text-muted-foreground h-full">
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
        <div className="overflow-auto h-full" ref={tableRef} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <table className="w-full border-collapse text-xs select-none">
                <thead>
                    <tr>
                        <th className="sticky top-0 left-0 z-20 bg-background/80 backdrop-blur-sm p-2 border-b border-border text-left font-semibold">
                            <div className="flex items-center justify-between">
                                <span>{yAxisLabel}</span>
                                <span className="mx-2">\</span>
                                <span>{xAxisLabel}</span>
                            </div>
                        </th>
                        {axes.x.calculated.map((x: any, i: number) => (
                            <th key={i} className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-2 border-b border-border font-semibold">
                                {typeof x === 'number' && xAxisDecimalPlaces !== -1 ? x.toFixed(xAxisDecimalPlaces) : x}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {axes.y.calculated.map((y: any, yi: number) => (
                        <tr key={yi}>
                            <td className="sticky left-0 z-10 bg-background/80 backdrop-blur-sm p-2 border-r border-border font-bold text-right">
                                {typeof y === 'number' && yAxisDecimalPlaces !== -1 ? y.toFixed(yAxisDecimalPlaces) : y}
                            </td>
                            {mapData[yi]?.map((cell, xi) => {
                                const selected = isCellSelected(yi, xi);
                                const isAiModified = aiModifiedCells.has(`${yi}-${xi}`);
                                const bgColor = selected ? 'hsl(var(--primary))' : getHeatmapColor(cell, minVal, maxVal);
                                const textColor = selected ? 'hsl(var(--primary-foreground))' : getTextColorForBackground(bgColor);
                                const address = addresses?.[yi]?.[xi];
                                return (
                                    <td
                                        key={xi}
                                        className={cn("p-0 border border-border/50 text-center h-10 transition-colors relative", {
                                            'outline outline-2 outline-offset-[-2px] outline-primary': selected,
                                            'ring-2 ring-amber-400 ring-inset z-10': isAiModified,
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

    const { processedMap, loadAxis } = useEcuTuningState();
    
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
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 w-full space-y-2">
                    <Label>Eixo de Carga ({loadAxis.label})</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                                {currentLoadColumnValues.length > 0 ? `${currentLoadColumnValues.length} colunas selecionadas` : "Selecione um valor de carga para adicionar..."}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width)] p-0">
                             <Command>
                                <CommandInput placeholder="Procurar valor de carga..." />
                                <CommandList>
                                    <CommandEmpty>Nenhum resultado.</CommandEmpty>
                                    <CommandGroup>
                                        {loadAxis.calculated.map((val, idx) => {
                                            const isSelected = currentLoadColumnValues.includes(Number(val));
                                            return (
                                                <CommandItem
                                                    key={idx}
                                                    onSelect={() => {
                                                        const loadValue = Number(val);
                                                        if (isSelected) {
                                                            const indexToRemove = loadColumnFields.findIndex(f => f.value === loadValue);
                                                            if (indexToRemove > -1) removeLoadColumn(indexToRemove);
                                                        } else {
                                                            appendLoadColumn({ id: `load_${loadValue}`, value: loadValue });
                                                        }
                                                    }}
                                                >
                                                    <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                                                        <Check className={cn("h-4 w-4")} />
                                                    </div>
                                                    <span>{val}</span>
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
            
            {loadColumnFields.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <ScrollArea className="w-full">
                        <Table className="min-w-max">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[120px]">RPM</TableHead>
                                    {loadColumnFields.map((field, index) => (
                                        <TableHead key={field.id} className="min-w-[100px]">
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
                    </ScrollArea>
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
    loadAxis: AxisData | null;
}>({ processedMap: null, loadAxis: null });

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

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};


export default function EcuTuningAssistant() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const auth = useAuth();
    const firestore = useFirestore();
    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        const id = `${Date.now()}-${Math.random()}`;
        setLogs(prev => [{ id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), message, type }, ...prev].slice(0, 100));
    }, []);

    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; content: string, definitions: XDFinition[], allTables: Map<string, Element> } | null>(null);
    const [logFile, setLogFile] = useState<{ name: string; content: string } | null>(null);
    const [logData, setLogData] = useState<any[]>([]);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [logHeaders, setLogHeaders] = useState<string[]>([]);
    const [selectedLogLoadColumn, setSelectedLogLoadColumn] = useState<string>('');
    const [selectedLoadValues, setSelectedLoadValues] = useState<string[]>([]);
    
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
    const [originalMapCache, setOriginalMapCache] = useState<Record<string, ProcessedMap>>({});
    const [modifiedStatusCache, setModifiedStatusCache] = useState<Record<string, boolean>>({});
    const [isMapSelectPopoverOpen, setIsMapSelectPopoverOpen] = useState(false);
    const [isLoadPopoverOpen, setIsLoadPopoverOpen] = useState(false);
    

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);
    const logInputRef = useRef<HTMLInputElement>(null);

    const backupsQuery = useMemoFirebase(() => {
        if (!firestore || !user?.uid) return null;
        return query(
            collection(firestore, `users/${user.uid}/backups`),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, user?.uid]);
    const { data: cloudBackups, isLoading: backupsLoading, error: backupsError } = useCollection<BackupFile>(backupsQuery);


    const dynoForm = useForm<DynoFormValues>({
        resolver: zodResolver(dynoFormSchema),
        defaultValues: {
            loadColumns: [],
            logRows: []
        },
    });

    const selectedMapDefinition = useMemo(() => {
        if (!activeMapId || !xdfFile) return undefined;
        return xdfFile.definitions.find(def => def.uniqueId === activeMapId);
    }, [activeMapId, xdfFile]);

    const anyMapModified = useMemo(() => {
        return Object.values(modifiedStatusCache).some(status => status);
    }, [modifiedStatusCache]);

    const { rpmAxis, loadAxis } = useMemo(() => {
        if (!processedMap?.axes) return { rpmAxis: null, loadAxis: null };
        const { x, y } = processedMap.axes;
        const rpmRegex = /rpm/i;
    
        if (x.label && rpmRegex.test(x.label)) {
            return { rpmAxis: x, loadAxis: y };
        }
        if (y.label && rpmRegex.test(y.label)) {
            return { rpmAxis: y, loadAxis: x };
        }
        // Default assumption if no clear "rpm" label
        return { rpmAxis: x, loadAxis: y };
    }, [processedMap]);
    
    const handleMapUpdate = useCallback((mapId: string, newMap: ProcessedMap, modifiedCells?: Set<string>) => {
        if (mapId === activeMapId) {
            setProcessedMap(newMap);
            if (modifiedCells) {
                setAiModifiedCells(modifiedCells);
            }
        }
        setProcessedMapCache(prev => ({...prev, [mapId]: newMap}));
        setModifiedStatusCache(prev => ({...prev, [mapId]: true}));
        
        if (modifiedCells) {
            setAiModifiedCellsCache(prev => ({...prev, [mapId]: modifiedCells}));
        }

        setIsModified(true);
    }, [activeMapId]);

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
        setOriginalMapCache({});
        setModifiedStatusCache({});
        setManualConfig(initialManualConfig);
        addLog('Seleção de mapa e cache limpos.', 'info');
    }, [addLog]);

    const handleClearLogData = useCallback(() => {
        setLogFile(null);
        setLogData([]);
        setLogHeaders([]);
        setSelectedLogLoadColumn('');
        setSelectedLoadValues([]);
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
        setLogHeaders([]);
        setSelectedLogLoadColumn('');
        setSelectedLoadValues([]);
        setSelectedMapIds([]);
        setActiveMapId(null);
        setProcessedMap(null);
        setIsModified(false);
        setAiModifiedCells(new Set());
        setAiModifiedCellsCache({});
        setProcessedMapCache({});
        setOriginalMapCache({});
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
    
        const reader = new FileReader();
        reader.onload = (event) => {
            let fileContent = event.target?.result as string;
            if (!fileContent) return;
    
            addLog(`A ler o ficheiro de log ${file.name}...`, 'info');
    
            // Pre-process to replace comma decimals with dots BEFORE parsing
            fileContent = fileContent.replace(/(\d+),(\d+)/g, '$1.$2');
    
            Papa.parse(fileContent, {
                header: false,
                skipEmptyLines: true,
                delimiter: ';', // Try semicolon first
                preview: 20, // Preview first 20 lines to find header
                complete: (previewResults) => {
                    let headerRowIndex = -1;
                    let detectedHeaders: string[] = [];
                    
                    const rpmKeywords = ['rpm', 'rotacao', 'rotação'];
                    const lambdaKeywords = ['lambda', 'sonda'];

                    for (let i = 0; i < previewResults.data.length; i++) {
                        const row = previewResults.data[i] as string[];
                        if (!Array.isArray(row)) continue;
                        const potentialHeaders = row.map(h => String(h || '').trim().toLowerCase());
                        
                        const rpmFound = potentialHeaders.some(h => rpmKeywords.some(kw => h.includes(kw)));
                        const lambdaFound = potentialHeaders.some(h => lambdaKeywords.some(kw => h.includes(kw)));
    
                        if (rpmFound && lambdaFound) {
                            headerRowIndex = i;
                            // Use the original cased headers, not the lowercased ones
                            detectedHeaders = (previewResults.data[i] as string[]).map(h => h.trim());
                            break;
                        }
                    }
    
                    if (headerRowIndex === -1) {
                        const msg = 'Não foi possível encontrar a linha de cabeçalho (com RPM e Lambda/Sonda) no ficheiro de log.';
                        addLog(msg, 'error');
                        toast({ title: 'Erro no Log', description: msg, variant: 'destructive' });
                        return;
                    }
    
                    const dataContent = fileContent.split('\n').slice(headerRowIndex + 1).join('\n');
                    const finalCsv = detectedHeaders.join(';') + '\n' + dataContent;
    
                    Papa.parse(finalCsv, {
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true,
                        delimiter: ';',
                        complete: (results) => {
                            if (results.errors.length > 0) {
                                addLog(`Erros de análise no log: ${results.errors.map(e => e.message).join(', ')}`, 'error');
                            }
                            if (results.meta.fields) {
                                const cleanHeaders = results.meta.fields.map(h => h.trim()).filter(Boolean); // Filter out empty headers
                                setLogHeaders(cleanHeaders);
                                const loadHeader = cleanHeaders.find(h => /tps|map|load|carga/i.test(h));
                                if (loadHeader) {
                                    setSelectedLogLoadColumn(loadHeader);
                                    setSelectedLoadValues([]);
                                }
                            }
                            
                            const cleanedData = results.data.map((row: any) => {
                                const newRow: any = {};
                                for (const key in row) {
                                    const trimmedKey = key.trim();
                                    if(trimmedKey) { // Ensure key is not empty
                                        newRow[trimmedKey] = row[key];
                                    }
                                }
                                return newRow;
                            });
    
                            setLogFile({ name: file.name, content: Papa.unparse(cleanedData) });
                            setLogData(cleanedData);
                            const successMessage = `Ficheiro de log "${file.name}" carregado e processado com ${cleanedData.length} linhas.`;
                            addLog(successMessage, 'success');
                            toast({ title: 'Log Carregado', description: successMessage });
                        },
                        error: (error) => {
                             const errorMessage = `Erro ao processar CSV: ${error.message}`;
                             addLog(errorMessage, 'error');
                             toast({ title: 'Erro de CSV', description: errorMessage, variant: 'destructive' });
                        }
                    });
                }
            });
        };
        reader.readAsText(file, 'ISO-8859-1');
        if (logInputRef.current) logInputRef.current.value = '';
    };

    const handleAddDynoLogData = (data: DynoFormValues) => {
        if (!processedMap?.axes || !rpmAxis || !loadAxis) {
            toast({ title: "Mapa não carregado", description: "Carregue um mapa para adicionar dados.", variant: "destructive" });
            return;
        }
        
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
        const newHeaders = [...new Set([...logHeaders, ...Object.keys(newEntries[0])])];
        setLogHeaders(newHeaders);

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
            
            // Only cache in originalMapCache if it doesn't exist yet for this mapId
            if (!originalMapCache[mapId]) {
                setOriginalMapCache(prev => ({...prev, [mapId]: result}));
                addLog(`Estado original do mapa "${def.name}" salvo na cache.`, 'info');
            }

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
    }, [binFile, xdfFile, addLog, toast, originalMapCache]);

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
            // Reset log load value when map changes
            setSelectedLoadValues([]);
            setSelectedLogLoadColumn('');
        } else {
            setProcessedMap(null);
            setIsModified(false);
        }
    
    }, [activeMapId, xdfFile, binFile, isModified, processedMap, processedMapCache, modifiedStatusCache, addLog, templateConfig, processAndCacheMap]);


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
        operation: 'add_percent' | 'sub_percent' | 'set_value' | 'interpolate' | 'revert',
        value: number
    ) => {
        if (!processedMap || !processedMap.calculatedMap || !selection.start || !selection.end || !activeMapId) return;
    
        const newMap = processedMap.calculatedMap.map(row => [...row]);
        const { start, end } = selection;
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        
        const originalMapData = originalMapCache[activeMapId];
        if (operation === 'revert' && (!originalMapData || !originalMapData.calculatedMap)) {
            toast({ title: "Erro", description: "Cache do mapa original não encontrado. Recarregue o mapa.", variant: "destructive" });
            return;
        }
    
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                let newValue: number | null;
                switch (operation) {
                    case 'add_percent':
                        newValue = (newMap[y][x] ?? 0) * (1 + value / 100);
                        break;
                    case 'sub_percent':
                        newValue = (newMap[y][x] ?? 0) * (1 - value / 100);
                        break;
                    case 'set_value':
                        newValue = value;
                        break;
                    case 'interpolate': {
                        if (minY === maxY || minX === maxX) { 
                             newValue = newMap[y][x]; // Skip 1D interpolation
                        } else {
                            const topLeft = newMap[minY][minX]!;
                            const topRight = newMap[minY][maxX]!;
                            const bottomLeft = newMap[maxY][minX]!;
                            const bottomRight = newMap[maxY][maxX]!;
        
                            if (topLeft === null || topRight === null || bottomLeft === null || bottomRight === null) {
                               newValue = newMap[y][x]; // Skip if corners are not valid
                            } else {
                                const xRatio = (x - minX) / (maxX - minX);
                                const yRatio = (y - minY) / (maxY - minY);
                                const topInterpolation = topLeft * (1 - xRatio) + topRight * xRatio;
                                const bottomInterpolation = bottomLeft * (1 - xRatio) + bottomRight * xRatio;
                                newValue = topInterpolation * (1 - yRatio) + bottomInterpolation * yRatio;
                            }
                        }
                        break;
                    }
                    case 'revert':
                        newValue = originalMapData!.calculatedMap![y][x];
                        break;
                    default:
                        newValue = newMap[y][x];
                }
                newMap[y][x] = newValue;
            }
        }
        
        const newProcessedMap = { ...processedMap, calculatedMap: newMap };
        setProcessedMap(newProcessedMap);
        
        setIsModified(true);
        if(operation !== 'revert') clearAiModifications();
        setProcessedMapCache(prev => ({ ...prev, [activeMapId as string]: newProcessedMap }));
        setModifiedStatusCache(prev => ({...prev, [activeMapId as string]: true}));
        addLog(`Operação em massa "${operation}" aplicada a ${ (maxY - minY + 1) * (maxX - minX + 1)} células.`, 'success');
    };
    
const handleSave = async () => {
    if (!binFile || !xdfFile || !anyMapModified) {
        const msg = "Faltam dados para salvar. Carregue os ficheiros e modifique um mapa primeiro.";
        addLog(msg, 'error');
        toast({ title: 'Erro ao Salvar', description: msg, variant: 'destructive' });
        return;
    }

    addLog("A gerar o ficheiro .bin modificado...", 'info');
    setIsProcessing(true);

    try {
        const mapsToSave = Object.entries(processedMapCache)
            .filter(([mapId, _]) => modifiedStatusCache[mapId])
            .map(([mapId, mapData]) => ({
                definition: xdfFile.definitions.find(def => def.uniqueId === mapId)!,
                processedMap: mapData,
            }));
        
        if (mapsToSave.length === 0) {
            addLog("Nenhuma modificação para salvar.", "info");
            toast({ title: "Nenhuma Alteração", description: "Não há modificações para salvar."});
            setIsProcessing(false);
            return;
        }

        const newBinBuffer = writeMultipleMapsToBin(binFile.buffer, mapsToSave as any);
        const modifiedFileName = binFile.name.replace(/\.[^/.]+$/, "") + `_mod_${mapsToSave.length}map.bin`;

        // Trigger direct download
        const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = modifiedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        addLog(`Ficheiro "${modifiedFileName}" descarregado com sucesso.`, "success");
        toast({ title: 'Download Iniciado', description: `O seu ficheiro ${modifiedFileName} está a ser descarregado.` });

    } catch (error) {
        const errorMsg = `Falha ao salvar: ${(error as Error).message}`;
        addLog(errorMsg, 'error');
        toast({ title: 'Erro Crítico', description: errorMsg, variant: 'destructive' });
    } finally {
        setIsProcessing(false);
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

    const handleAutoTune = async () => {
        const logSource = logFile || logData.length > 0;
        const loadConditionSet = selectedLogLoadColumn || selectedLoadValues.length > 0;
        
        if (selectedMapIds.length === 0 || !logSource || !targetLambda || !xdfFile || !binFile || !loadConditionSet) {
            let msg = "Dados insuficientes para o ajuste. ";
            if (selectedMapIds.length === 0) msg += "Selecione pelo menos um mapa. ";
            if (!logSource) msg += "Carregue um ficheiro de log ou insira dados manualmente. ";
            if (!loadConditionSet) msg += "Selecione a condição de carga do log. ";
            if (!targetLambda) msg += "Defina um Lambda alvo. ";
        
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
                const { correctedMap, modifiedIndices } = calculateCorrections(
                    mapToProcess, 
                    logData, 
                    numericTargetLambda, 
                    aggressiveness,
                    selectedLogLoadColumn, // For logs with load column
                    selectedLoadValues.map(v => parseFloat(v)) // For logs at specific load points
                );
                
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
    const newSelectedIds = selectedMapIds.includes(id)
        ? selectedMapIds.filter(mapId => mapId !== id)
        : [...selectedMapIds, id];

    setSelectedMapIds(newSelectedIds);
    const def = xdfFile?.definitions.find(d => d.uniqueId === id);
    addLog(`Mapa "${def?.name ?? id}" ${newSelectedIds.includes(id) ? 'selecionado' : 'desselecionado'}.`, 'info');

    if ((activeMapId === id && !newSelectedIds.includes(id)) || (!activeMapId && newSelectedIds.length > 0)) {
        const nextActiveId = newSelectedIds.find(mapId => mapId !== id) || newSelectedIds[0] || null;
        setActiveMap(nextActiveId);
    } else if (newSelectedIds.length === 0) {
        setActiveMap(null);
    }
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

    const handleSaveBackup = async () => {
        if (!binFile || !anyMapModified) {
            toast({ title: 'Nada para Salvar', description: 'Modifique um mapa antes de guardar um backup.', variant: 'default' });
            return;
        }
        if (!user || !firestore) {
            toast({ title: 'Autenticação Necessária', description: 'Faça login para guardar backups na nuvem.', variant: 'destructive' });
            return;
        }
    
        setIsProcessing(true);
        addLog('A preparar para salvar backup na nuvem...', 'info');
    
        try {
            const mapsToSave = Object.entries(processedMapCache)
                .filter(([mapId, _]) => modifiedStatusCache[mapId])
                .map(([mapId, mapData]) => ({
                    definition: xdfFile.definitions.find(def => def.uniqueId === mapId)!,
                    processedMap: mapData,
                }));
    
            if (mapsToSave.length === 0) {
                toast({ title: 'Nenhuma Alteração', description: 'Não há modificações para salvar no backup.' });
                setIsProcessing(false);
                return;
            }
    
            const newBinBuffer = writeMultipleMapsToBin(binFile.buffer, mapsToSave as any);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const modifiedFileName = binFile.name.replace(/\.[^/.]+$/, "") + `_backup_${timestamp}.bin`;
            
            const storage = getStorage();
            const storagePath = `users/${user.uid}/backups/${modifiedFileName}`;
            const storageRef = ref(storage, storagePath);
    
            addLog(`A enviar ficheiro para ${storagePath}...`, 'info');
            await uploadBytes(storageRef, newBinBuffer);
    
            addLog('A guardar metadados do backup...', 'info');
            await addDoc(collection(firestore, `users/${user.uid}/backups`), {
                name: modifiedFileName,
                storagePath: storagePath,
                createdAt: serverTimestamp(),
                size: newBinBuffer.byteLength,
                userId: user.uid,
            });
    
            toast({ title: 'Backup Salvo!', description: 'O seu ficheiro modificado foi guardado na nuvem com sucesso.' });
            addLog('Backup guardado na nuvem com sucesso!', 'success');
    
        } catch (error) {
            const errorMessage = `Falha ao salvar backup: ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            toast({ title: 'Erro no Backup', description: errorMessage, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleLoadBackup = async (backup: BackupFile) => {
        if (!user) return;
        setIsProcessing(true);
        addLog(`A carregar backup "${backup.name}"...`, 'info');
        try {
            const storage = getStorage();
            const storageRef = ref(storage, backup.storagePath);
            const url = await getDownloadURL(storageRef);
    
            const response = await fetch(url);
            if (!response.ok) throw new Error('Falha ao descarregar o ficheiro do backup.');
    
            const buffer = await response.arrayBuffer();
            setBinFile({ name: backup.name, buffer });
            
            // Clear all caches and modifications as we are loading a new base file
            clearMapState();
            addLog(`Ficheiro de backup "${backup.name}" carregado. Pode agora processar os mapas.`, 'success');
            toast({ title: 'Backup Carregado', description: `Ficheiro "${backup.name}" está pronto a ser usado.` });
    
        } catch (error) {
            const msg = `Falha ao carregar backup: ${(error as Error).message}`;
            addLog(msg, 'error');
            toast({ title: 'Erro ao Carregar', description: msg, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleDeleteBackup = async (backup: BackupFile) => {
        if (!user || !firestore) return;
        
        const confirmation = window.confirm(`Tem a certeza que quer apagar o backup "${backup.name}"? Esta ação é irreversível.`);
        if (!confirmation) return;

        setIsProcessing(true);
        addLog(`A apagar backup "${backup.name}"...`, 'info');
        try {
            const storage = getStorage();
            const storageRef = ref(storage, backup.storagePath);
            
            // Delete from Firestore
            await deleteDoc(doc(firestore, `users/${user.uid}/backups`, backup.id));
            addLog('Metadados do backup apagados.', 'info');
            
            // Delete from Storage
            await deleteObject(storageRef);
            addLog('Ficheiro do backup apagado do armazenamento.', 'info');
    
            toast({ title: 'Backup Apagado', description: `"${backup.name}" foi removido com sucesso.` });
            addLog('Backup apagado com sucesso.', 'success');
        } catch (error) {
             const msg = `Falha ao apagar backup: ${(error as Error).message}`;
             addLog(msg, 'error');
             toast({ title: 'Erro ao Apagar', description: msg, variant: 'destructive' });
        } finally {
             setIsProcessing(false);
        }
    };


    const renderContent = () => {
        if (isProcessing && !processedMap) {
            return (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                    <p>A processar o mapa...</p>
                </div>
            );
        }

        if (!processedMap && activeMapId) {
            return (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                    <div>
                        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
                        <p className="mt-2 font-semibold">
                        Falha ao Processar o Mapa
                        </p>
                        <p className="text-sm">
                        Verifique a configuração de substituição e os logs de erro.
                        </p>
                    </div>
                </div>
            );
        }

        if (!activeMapId ) {
            return (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
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
            );
        }

        return (
            <>
                <TabsContent value="view-table" className="h-[70vh]">
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
                <TabsContent value="view-3d" className="h-[70vh]">
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
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                <p>
                                A aguardar dados completos do mapa para o gráfico
                                3D.
                                </p>
                            </div>
                            )}
                    </div>
                </TabsContent>
                <TabsContent value="view-2d" className="h-[70vh]">
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
                <TabsContent value="fuel-analysis">
                   <div className="space-y-4 p-1">
                        <Card>
                            <CardHeader>
                                <CardTitle>Ajuste Automático por Log</CardTitle>
                                <CardDescription>Carregue um ficheiro de log (.csv) ou insira os dados manualmente para que o sistema calcule as correções automaticamente com base no Lambda Alvo.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                                    <Button variant="outline" size="icon" onClick={handleClearLogData} disabled={!logFile && logData.length === 0}>
                                        <Eraser className="h-4 w-4" />
                                        <span className="sr-only">Limpar Dados de Ensaio</span>
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="log-load-condition">Condição de Carga do Log</Label>
                                    <Popover open={isLoadPopoverOpen} onOpenChange={setIsLoadPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-between"
                                                disabled={logData.length === 0 || !loadAxis}
                                            >
                                                <span className="truncate">
                                                    {selectedLogLoadColumn
                                                        ? `Coluna: ${selectedLogLoadColumn}`
                                                        : selectedLoadValues.length > 0
                                                        ? `${selectedLoadValues.length} cargas selecionadas`
                                                        : "Selecione a condição de carga..."
                                                    }
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width)] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Procurar condição..." />
                                                <CommandList>
                                                    <CommandEmpty>Nenhum resultado.</CommandEmpty>
                                                    {logHeaders.length > 0 && logFile && (
                                                        <CommandGroup heading="Coluna de Carga do Log">
                                                            {logHeaders.filter(h => h && /tps|map|load|carga/i.test(h)).map((header) => (
                                                                <CommandItem
                                                                    key={header}
                                                                    onSelect={() => {
                                                                        setSelectedLogLoadColumn(header);
                                                                        setSelectedLoadValues([]);
                                                                        setIsLoadPopoverOpen(false);
                                                                    }}
                                                                >
                                                                    <Check className={cn("mr-2 h-4 w-4", selectedLogLoadColumn === header ? "opacity-100" : "opacity-0")} />
                                                                    {header}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    )}
                                                    {loadAxis && <Separator />}
                                                    <CommandGroup heading="Valores de Carga do Mapa">
                                                        {loadAxis?.calculated.map((val, index) => {
                                                            const valueStr = String(val);
                                                            const isSelected = selectedLoadValues.includes(valueStr);
                                                            return (
                                                                <CommandItem
                                                                    key={index}
                                                                    onSelect={() => {
                                                                        setSelectedLogLoadColumn('');
                                                                        setSelectedLoadValues(prev => 
                                                                            isSelected 
                                                                                ? prev.filter(v => v !== valueStr)
                                                                                : [...prev, valueStr]
                                                                        );
                                                                    }}
                                                                    className="flex items-center"
                                                                >
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        className="mr-2"
                                                                    />
                                                                    <span>{typeof val === 'number' ? val.toFixed(2) : val}</span>
                                                                </CommandItem>
                                                            );
                                                        })}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <p className="text-xs text-muted-foreground">
                                        Se o seu log tiver uma coluna de carga (TPS/MAP), selecione-a. Caso contrário, selecione o(s) valor(es) de carga do mapa que corresponde(m) ao seu ensaio.
                                    </p>
                                </div>
                                <div className="space-y-2">
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
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="aggressiveness">Agressividade ({aggressiveness}%)</Label>
                                         <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                    <p>Controla a intensidade da correção. 100% aplica a correção total calculada (valorAtual * (sondaLida/sondaAlvo)). 50% aplica metade da diferença entre o valor atual e o valor totalmente corrigido. Valores mais baixos são mais seguros.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <Slider
                                        id="aggressiveness"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={[aggressiveness]}
                                        onValueChange={(value) => setAggressiveness(value[0])}
                                    />
                                </div>
                                <Button className="w-full" onClick={handleAutoTune} disabled={selectedMapIds.length === 0 || logData.length === 0 || isProcessing || (!selectedLogLoadColumn && selectedLoadValues.length === 0)}>
                                    <Wand2 className="mr-2" /> {isProcessing ? "Ajustando..." : `Ajustar ${selectedMapIds.length} Mapa(s)`}
                                </Button>

                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle>Entrada Manual de Tabela (Lambda)</CardTitle>
                                <CardDescription>Adicione pontos de log manualmente se não tiver um ficheiro CSV ou se o seu log não tiver uma coluna de carga.</CardDescription>
                            </CardHeader>
                            <CardContent>
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
                            <CardHeader><CardTitle>Dados de Ensaio Atuais</CardTitle></CardHeader>
                            <CardContent>
                                {logData.length > 0 ? (
                                    <LogDataTable data={logData} />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-muted-foreground">
                                        <p>Aguardando dados do ensaio...</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
                <TabsContent value="ignition-analysis">
                        <IgnitionTimingAnalyzer 
                            runs={ignitionRuns} 
                            onRunsChange={setIgnitionRuns}
                            binFile={binFile}
                            processedMap={processedMap}
                            selectedMapDefinition={selectedMapDefinition}
                            addLog={addLog}
                            onMapUpdate={handleMapUpdate}
                        />
                </TabsContent>
            </>
        );
    };

    const ControlPanelAccordion = (
        <Accordion type="single" collapsible className="w-full mb-6" defaultValue="item-1">
            <AccordionItem value="item-1">
                <AccordionTrigger>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Cpu size={20} /> Painel de Controlo
                    </h2>
                </AccordionTrigger>
                <AccordionContent>
                   <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <UploadCloud size={18} /> Ficheiros
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
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
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Table2 size={18} /> Seleção de Mapa
                                </CardTitle>
                            </CardHeader>
                             <CardContent>
                                <Popover open={isMapSelectPopoverOpen} onOpenChange={setIsMapSelectPopoverOpen}>
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
                             <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <BrainCircuit size={18} /> Ações e Logs
                                </CardTitle>
                            </CardHeader>
                             <CardContent className="flex flex-col gap-3">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                    variant="default"
                                    className="flex-1"
                                    disabled={!anyMapModified || isProcessing}
                                    onClick={handleSave}
                                    >
                                        <Save className="mr-2 h-4 w-4" /> Salvar .BIN Modificado
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={handleResetAll}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Resetar Tudo</span>
                                    </Button>
                                </div>
                                <div className="space-y-1 pt-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">Log de Processamento</h3>
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
                                    <ScrollArea className="h-24 w-full rounded-md border p-2 font-mono text-xs">
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
                            </CardContent>
                       </Card>
                   </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );

    return (
      <EcuTuningStateContext.Provider value={{ processedMap, loadAxis }}>
         <div className="flex h-full w-full flex-col bg-background">
            <Header />
            <main className="flex-1 overflow-auto p-4 md:p-6">

                {ControlPanelAccordion}
                
                <Accordion type="single" collapsible className="w-full mb-6">
                     <AccordionItem value="item-1">
                        <AccordionTrigger>
                             <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Settings2 size={18} /> Substituir Manualmente
                                <span className="text-sm text-muted-foreground font-normal ml-2">(Use para substituir a configuração do XDF. Útil para depuração)</span>
                            </h2>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                                 <div className="space-y-2">
                                    <Label htmlFor="y-equation" className="font-semibold text-sm">Equação Y</Label>
                                    <Input id="y-equation" placeholder="x" value={manualConfig.y.equation} onChange={(e) => handleManualConfigChange('y', e.target.value, 'equation')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="y-stride" className="font-semibold text-sm">Passo Y (bytes)</Label>
                                    <Input id="y-stride" type="number" placeholder="-" value={manualConfig.y.stride ?? ''} onChange={(e) => handleManualConfigChange('y', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="x-equation" className="font-semibold text-sm">Equação X</Label>
                                    <Input id="x-equation" placeholder="x" value={manualConfig.x.equation} onChange={(e) => handleManualConfigChange('x', e.target.value, 'equation')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="x-stride" className="font-semibold text-sm">Passo X (bytes)</Label>
                                    <Input id="x-stride" type="number" placeholder="-" value={manualConfig.x.stride ?? ''} onChange={(e) => handleManualConfigChange('x', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="z-equation" className="font-semibold text-sm">Equação Z (Mapa)</Label>
                                    <Input id="z-equation" placeholder="x" value={manualConfig.z.equation} onChange={(e) => handleManualConfigChange('z', e.target.value, 'equation')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="z-stride" className="font-semibold text-sm">Passo Z (bytes)</Label>
                                    <Input id="z-stride" type="number" placeholder="-" value={manualConfig.z.stride ?? ''} onChange={(e) => handleManualConfigChange('z', e.target.value === '' ? undefined : parseInt(e.target.value), 'stride')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="z-row-stride" className="font-semibold text-sm">Passo da Linha (bytes)</Label>
                                    <Input id="z-row-stride" type="number" placeholder="Automático (Cols * Passo Z)" value={manualConfig.z.rowStride ?? ''} onChange={(e) => handleManualConfigChange('z', e.target.value === '' ? undefined : parseInt(e.target.value), 'rowStride')} />
                                </div>
                                <div className="flex items-end gap-2">
                                     <div className="flex flex-wrap items-center space-x-4 pt-4">
                                        <div className="flex items-center space-x-2">
                                            <Switch id="sort-x" checked={manualConfig.sortX ?? false} onCheckedChange={(checked) => handleManualConfigChange('sortX', checked)} />
                                            <Label htmlFor="sort-x">Ordenar Eixo X</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Switch id="sort-y" checked={manualConfig.sortY ?? false} onCheckedChange={(checked) => handleManualConfigChange('sortY', checked)} />
                                            <Label htmlFor="sort-y">Ordenar Eixo Y</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Switch id="big-endian" checked={manualConfig.isBigEndian ?? false} onCheckedChange={(checked) => handleManualConfigChange('isBigEndian', checked)} />
                                            <Label htmlFor="big-endian">Big Endian</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Button size="sm" onClick={handleApplyAndRecalculate} disabled={!activeMapId || isProcessing}>
                                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" /> }
                                    Aplicar e Recalcular
                                </Button>
                                <Button size="sm" variant="secondary" onClick={handleSetTemplate} disabled={!activeMapId}>
                                    <Star className="mr-2 h-4 w-4" />
                                    Usar como Padrão
                                </Button>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>


                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                <CardTitle>{selectedMapDefinition?.name || (!xdfFile ? 'Carregue um .XDF' : 'Nenhum Mapa Selecionado')}</CardTitle>
                                {isModified && (
                                    <span className="text-xs font-semibold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                                        Modificado
                                    </span>
                                )}
                                </div>
                                <TabsList className="h-auto flex-wrap justify-start sm:justify-center">
                                <TabsTrigger value="view-table" disabled={!activeMapId}>
                                    <Table2 className="mr-2" />
                                    Tabela de Dados
                                </TabsTrigger>
                                <TabsTrigger value="view-3d" disabled={!activeMapId}>
                                    <BarChart3 className="mr-2" />
                                    Gráfico 3D
                                </TabsTrigger>
                                <TabsTrigger value="view-2d" disabled={!activeMapId}>
                                    <LineChartIcon className="mr-2" />
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
                                </TabsList>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="min-h-0">
                                {renderContent()}
                            </div>
                        </CardContent>
                    </Card>
                </Tabs>
            </main>
        </div>
      </EcuTuningStateContext.Provider>
    );
}
