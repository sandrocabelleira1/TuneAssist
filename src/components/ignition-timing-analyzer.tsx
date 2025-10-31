'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Wand2, Download, AlertTriangle, Upload, Eraser, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IgnitionTimingRun, IgnitionTimingPoint, ProcessedMap, AxisData, XDFinition, LogMessage } from '@/lib/types';
import IgnitionTimingPlot from '@/components/ignition-timing-plot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

type RunType = 'base' | 'modified';

interface IgnitionTimingAnalyzerProps {
    runs: IgnitionTimingRun;
    onRunsChange: (runs: IgnitionTimingRun) => void;
    binFile: { name: string; buffer: ArrayBuffer } | null;
    processedMap: ProcessedMap | null;
    selectedMapDefinition: XDFinition | undefined;
    addLog: (message: string, type?: LogMessage['type']) => void;
    onMapUpdate: (mapId: string, newMap: ProcessedMap, modifiedCells: Set<string>) => void;
}

interface TimingSegment {
    range: string;
    baseTime: number | null;
    modifiedTime: number | null;
    baseTorque: number | null;
    modifiedTorque: number | null;
    baseAdvance: number | null;
    modifiedAdvance: number | null;
    delta: number | null;
    gainPercent: number | null;
    suggestion: string;
}

interface ColumnMapping {
    rpm: string;
    time: string;
    torque: string;
    advance: string;
}

const AnalysisResultsTable = ({ results }: { results: TimingSegment[] }) => {
    const isTimeMode = results.some(r => r.baseTime !== null || r.modifiedTime !== null);
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Resultados da Análise</CardTitle>
                <CardDescription>
                    {isTimeMode
                        ? "Comparação do tempo gasto em cada faixa de RPM. Tempos mais baixos indicam ganho de torque."
                        : "Comparação do torque médio em cada faixa de RPM. Valores mais altos indicam ganhos."
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Faixa de RPM</TableHead>
                             {isTimeMode ? (
                                <>
                                    <TableHead>Tempo Base (s)</TableHead>
                                    <TableHead>Tempo Modificado (s)</TableHead>
                                </>
                            ) : (
                                <>
                                    <TableHead>Torque Base</TableHead>
                                    <TableHead>Torque Modificado</TableHead>
                                </>
                            )}
                            <TableHead>Avanço Base (°)</TableHead>
                            <TableHead>Avanço Modificado (°)</TableHead>
                            <TableHead>Diferença</TableHead>
                            <TableHead>Ganho/Perda (%)</TableHead>
                            <TableHead>Sugestão de IA</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map(res => (
                            <TableRow key={res.range}>
                                <TableCell className="font-medium">{res.range}</TableCell>
                                {isTimeMode ? (
                                    <>
                                        <TableCell>{res.baseTime?.toFixed(3) ?? '-'}</TableCell>
                                        <TableCell>{res.modifiedTime?.toFixed(3) ?? '-'}</TableCell>
                                    </>
                                ) : (
                                     <>
                                        <TableCell>{res.baseTorque?.toFixed(1) ?? '-'}</TableCell>
                                        <TableCell>{res.modifiedTorque?.toFixed(1) ?? '-'}</TableCell>
                                    </>
                                )}
                                <TableCell>{res.baseAdvance?.toFixed(1) ?? '-'}</TableCell>
                                <TableCell>{res.modifiedAdvance?.toFixed(1) ?? '-'}</TableCell>
                                <TableCell className={cn({
                                    'text-green-500 font-semibold': res.delta && (isTimeMode ? res.delta < 0 : res.delta > 0),
                                    'text-destructive font-semibold': res.delta && (isTimeMode ? res.delta > 0 : res.delta < 0),
                                })}>
                                    {isTimeMode ? res.delta?.toFixed(3) ?? '-' : res.delta?.toFixed(1) ?? '-'}
                                </TableCell>
                                 <TableCell className={cn({
                                    'text-green-500 font-semibold': res.gainPercent && res.gainPercent > 0,
                                    'text-destructive font-semibold': res.gainPercent && res.gainPercent < 0,
                                })}>
                                    {res.gainPercent ? `${res.gainPercent > 0 ? '+' : ''}${res.gainPercent.toFixed(2)}%` : '-'}
                                 </TableCell>
                                 <TableCell className={cn('text-sm', {
                                     'text-green-500': res.suggestion.includes('Continuar a avançar'),
                                     'text-destructive': res.suggestion.includes('Atrasar'),
                                     'text-blue-500': res.suggestion.includes('Manter'),
                                 })}>
                                    <div className="flex items-center gap-2">
                                        <Wand2 className="h-4 w-4" />
                                        {res.suggestion}
                                    </div>
                                 </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

const ColumnMapper = ({ logHeaders, onMappingConfirm, runType, rawData }: {
    logHeaders: string[],
    onMappingConfirm: (mapping: ColumnMapping, parsedData: IgnitionTimingPoint[]) => void,
    runType: RunType,
    rawData: any[],
}) => {
    const { toast } = useToast();
    const [mapping, setMapping] = useState<ColumnMapping>({
        rpm: '',
        time: '',
        torque: '',
        advance: '',
    });
    
    const uniqueLogHeaders = useMemo(() => [...new Set(logHeaders)].filter(h => h), [logHeaders]);

    useEffect(() => {
        // Automatically suggest mapping based on common keywords
        const getColumn = (keywords: string[]) => uniqueLogHeaders.find(h => keywords.some(kw => h.toLowerCase().includes(kw))) || '';
        setMapping({
            rpm: getColumn(['rotacao', 'rpm']),
            time: getColumn(['momento', 'tempo', 'time']),
            torque: getColumn(['torque']),
            advance: getColumn(['avanco', 'avanço', 'advance', 'ign']),
        });
    }, [uniqueLogHeaders]);

    const handleConfirm = () => {
        if (!mapping.rpm || (!mapping.time && !mapping.torque)) {
            toast({
                title: "Mapeamento Incompleto",
                description: "Por favor, mapeie pelo menos a coluna de RPM e uma de Tempo ou Torque.",
                variant: "destructive"
            });
            return;
        }

        const parsedData: IgnitionTimingPoint[] = rawData.map((row: any, index: number) => ({
            id: `${runType}_${index}`,
            rpm: row[mapping.rpm] ? String(row[mapping.rpm]) : '',
            time: mapping.time && row[mapping.time] !== undefined ? String(row[mapping.time]) : '',
            torque: mapping.torque && row[mapping.torque] !== undefined ? String(row[mapping.torque]) : '',
            advance: mapping.advance && row[mapping.advance] !== undefined ? String(row[mapping.advance]) : '',
        }));

        onMappingConfirm(mapping, parsedData);
    };

    return (
        <div className="mt-4 space-y-4 rounded-md border p-4">
            <h5 className="font-semibold">Mapear Colunas do Log ({runType === 'base' ? 'Base' : 'Modificado'})</h5>
            <p className="text-sm text-muted-foreground">
                Selecione as colunas do seu ficheiro de log que correspondem a cada métrica necessária.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.keys(mapping).map(key => (
                    <div key={key} className="space-y-1.5">
                        <Label>Coluna de {key.charAt(0).toUpperCase() + key.slice(1)}</Label>
                        <Select
                            value={mapping[key as keyof ColumnMapping]}
                            onValueChange={(value) => setMapping(prev => ({...prev, [key]: value === 'none' ? '' : value}))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={`Selecione a coluna de ${key}...`} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {uniqueLogHeaders.map(header => (
                                    <SelectItem key={header} value={header}>{header}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
            </div>
            <Button onClick={handleConfirm}>Confirmar Mapeamento e Carregar Dados</Button>
        </div>
    );
};

export default function IgnitionTimingAnalyzer({ runs, onRunsChange, binFile, processedMap, selectedMapDefinition, addLog, onMapUpdate }: IgnitionTimingAnalyzerProps) {

    const { toast } = useToast();
    const baseLogInputRef = useRef<HTMLInputElement>(null);
    const modifiedLogInputRef = useRef<HTMLInputElement>(null);
    
    const [logFiles, setLogFiles] = useState<{base: {name: string, headers: string[], rawData: any[]} | null, modified: {name: string, headers: string[], rawData: any[]} | null}>({base: null, modified: null});
    const [loadedFileNames, setLoadedFileNames] = useState<{base: string | null, modified: string | null}>({base: null, modified: null});
    
    const [isLoadingMap, setIsLoadingMap] = useState(false);
    const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);

    const isCurrentMapIgnition = useMemo(() => {
        if (!selectedMapDefinition) return false;
        const keywords = ['ignition', 'spark', 'advance', 'timing', 'ignição', 'avanço', 'ign'];
        return keywords.some(kw => selectedMapDefinition.name.toLowerCase().includes(kw));
    }, [selectedMapDefinition]);

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

    const [selectedLoadValue, setSelectedLoadValue] = useState('');


    const analysisResults = useMemo(() => {
        const results: TimingSegment[] = [];
        
        const hasTorqueData = runs.base.some(p => p.torque !== '') || runs.modified.some(p => p.torque !== '');
        
        const mode: 'time' | 'torque' = hasTorqueData ? 'torque' : 'time';

        type ValidPoint = { rpm: number, time: number, torque: number, advance: number };

        const processRun = (points: IgnitionTimingPoint[]): ValidPoint[] => {
            return points
                .map(p => ({
                    rpm: parseFloat(p.rpm),
                    time: parseFloat(p.time),
                    torque: parseFloat(p.torque),
                    advance: parseFloat(p.advance)
                }))
                .filter(p => !isNaN(p.rpm) && p.rpm > 0 && (mode === 'time' ? !isNaN(p.time) && p.time >= 0 : !isNaN(p.torque) && p.torque > 0))
                .sort((a,b) => a.rpm - b.rpm);
        };

        const basePoints = processRun(runs.base);
        const modifiedPoints = processRun(runs.modified);

        if (basePoints.length < 2 && modifiedPoints.length < 2) {
             return [];
        }

        const allRpms = new Set([...basePoints.map(p => p.rpm), ...modifiedPoints.map(p => p.rpm)]);
        const sortedRpms = Array.from(allRpms).sort((a,b) => a - b);
        
        for (let i = 0; i < sortedRpms.length - 1; i++) {
            const startRpm = sortedRpms[i];
            const endRpm = sortedRpms[i+1];
            
            let baseTime: number | null = null;
            let modifiedTime: number | null = null;
            let baseTorque: number | null = null;
            let modifiedTorque: number | null = null;
            let baseAdvance: number | null = null;
            let modifiedAdvance: number | null = null;
            let delta: number | null = null;
            let gainPercent: number | null = null;
            let suggestion: string = '-';

            const findPoint = (points: ValidPoint[], rpm: number) => points.find(p => p.rpm === rpm);
            
            const baseStartPoint = findPoint(basePoints, startRpm);
            const baseEndPoint = findPoint(basePoints, endRpm);
            const modifiedStartPoint = findPoint(modifiedPoints, startRpm);
            const modifiedEndPoint = findPoint(modifiedPoints, endRpm);
            
            const findAvg = (points: ValidPoint[], start: number, end: number, key: 'torque' | 'advance'): number | null => {
                const relevantPoints = points.filter(p => p.rpm >= start && p.rpm <= end);
                if (relevantPoints.length === 0) return null;
                const sum = relevantPoints.reduce((acc, p) => {
                    const value = p[key];
                    return !isNaN(value) ? acc + value : acc;
                }, 0);
                 const count = relevantPoints.filter(p => !isNaN(p[key])).length;
                return count > 0 ? sum / count : null;
            };

            baseAdvance = findAvg(basePoints, startRpm, endRpm, 'advance');
            modifiedAdvance = findAvg(modifiedPoints, startRpm, endRpm, 'advance');


            if (mode === 'time') {
                baseTime = (baseStartPoint && baseEndPoint) ? baseEndPoint.time - baseStartPoint.time : null;
                modifiedTime = (modifiedStartPoint && modifiedEndPoint) ? modifiedEndPoint.time - modifiedStartPoint.time : null;
                
                delta = (baseTime !== null && modifiedTime !== null) ? modifiedTime - baseTime : null;
                gainPercent = (baseTime !== null && delta !== null && baseTime > 0) ? (-delta / baseTime) * 100 : null;

            } else { // Torque mode
                baseTorque = findAvg(basePoints, startRpm, endRpm, 'torque');
                modifiedTorque = findAvg(modifiedPoints, startRpm, endRpm, 'torque');
                
                delta = (baseTorque !== null && modifiedTorque !== null) ? modifiedTorque - baseTorque : null;
                gainPercent = (baseTorque !== null && delta !== null && baseTorque > 0) ? (delta / baseTorque) * 100 : null;
            }

            if (gainPercent !== null) {
                if (Math.abs(gainPercent) < 0.1) { // Threshold for no significant change
                    suggestion = "Manter (MBT Provável)";
                } else if (gainPercent > 0) {
                     const baseAvgAdvance = baseAdvance;
                     const modifiedAvgAdvance = modifiedAdvance;
                     if (typeof baseAvgAdvance === 'number' && typeof modifiedAvgAdvance === 'number' && modifiedAvgAdvance > baseAvgAdvance) {
                         suggestion = "Continuar a avançar";
                     } else {
                         suggestion = "Ganho positivo, manter";
                     }
                } else { // gainPercent < 0
                    suggestion = "Atrasar (passou do MBT)";
                }
            }


            results.push({
                range: `${startRpm} -> ${endRpm}`,
                baseTime,
                modifiedTime,
                baseTorque,
                modifiedTorque,
                baseAdvance,
                modifiedAdvance,
                delta,
                gainPercent,
                suggestion,
            });
        }

        return results;

    }, [runs]);
    
    const handlePointUpdate = useCallback((runType: RunType, point: IgnitionTimingPoint) => {
         onRunsChange({
            ...runs,
            [runType]: [
                ...runs[runType].filter(p => p.rpm !== point.rpm),
                point
            ].sort((a, b) => parseFloat(a.rpm) - parseFloat(b.rpm))
         });
    }, [runs, onRunsChange]);
    
    const handleClearRun = useCallback((runType: RunType) => {
        onRunsChange({ ...runs, [runType]: [] });
        setLogFiles(prev => ({...prev, [runType]: null}));
        setLoadedFileNames(prev => ({...prev, [runType]: null}));
        if(runType === 'base' && baseLogInputRef.current) baseLogInputRef.current.value = '';
        if(runType === 'modified' && modifiedLogInputRef.current) modifiedLogInputRef.current.value = '';
        toast({ title: `Ensaio ${runType === 'base' ? 'de Base' : 'Modificado'} Limpo`, description: "Os dados foram removidos."});

    }, [runs, onRunsChange, toast]);

    const handleLoadFromMap = () => {
        if (!processedMap || !rpmAxis || !loadAxis || !selectedLoadValue) {
            toast({ title: "Dados insuficientes", description: "Mapa de ignição e linha de carga devem ser selecionados.", variant: "destructive" });
            return;
        }
        if (runs.base.length === 0) {
            toast({ title: "Log de Base Vazio", description: "Carregue primeiro o log do ensaio de base. O avanço do mapa será fundido com os dados do log.", variant: "destructive"});
            return;
        }
    
        setIsLoadingMap(true);
        addLog('A fundir avanço do mapa com o ensaio de base...', 'info');
    
        try {
            const loadIsYAxis = loadAxis === processedMap.axes.y;
            
            const loadIndex = processedMap.axes[loadIsYAxis ? 'y' : 'x'].calculated.findIndex(val => String(val) === selectedLoadValue);
            
            if (loadIndex === -1) {
                throw new Error("Valor de carga selecionado não encontrado no eixo.");
            }
    
            const newBaseRun = runs.base.map(point => {
                const rpmValue = parseFloat(point.rpm);
                if (isNaN(rpmValue)) return point;
    
                const rpmIsYAxis = rpmAxis === processedMap.axes.y;
                
                // Find closest RPM index in the map's axis
                const rpmAxisData = processedMap.axes[rpmIsYAxis ? 'y' : 'x'];
                const closestRpmIndex = rpmAxisData.calculated.reduce((closest, current, idx) => {
                    const currentDiff = Math.abs(Number(current) - rpmValue);
                    const closestDiff = Math.abs(Number(rpmAxisData.calculated[closest]) - rpmValue);
                    return currentDiff < closestDiff ? idx : closest;
                }, 0);

                 if (closestRpmIndex !== -1) {
                     const yIndex = rpmIsYAxis ? closestRpmIndex : loadIndex;
                     const xIndex = rpmIsYAxis ? loadIndex : closestRpmIndex;
                     const advance = processedMap.calculatedMap?.[yIndex]?.[xIndex];
                      return { ...point, advance: advance !== null && advance !== undefined ? String(advance) : point.advance };
                 }
                return point;
            });
    
            onRunsChange({ ...runs, base: newBaseRun });
            toast({ title: "Avanço do Mapa Fundido", description: "Valores de avanço do mapa foram adicionados aos pontos do ensaio de base." });
            addLog('Avanço do mapa fundido com sucesso com os dados do log.', 'success');
    
        } catch (error) {
            const msg = `Falha ao carregar do mapa: ${(error as Error).message}`;
            toast({ title: "Erro", description: msg, variant: "destructive" });
            addLog(msg, 'error');
        } finally {
            setIsLoadingMap(false);
        }
    };
    
    const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>, runType: RunType) => {
        const file = e.target.files?.[0];
        if (!file) return;

        addLog(`A ler o ficheiro de log de ignição (${runType}) ${file.name}...`, 'info');
        setLoadedFileNames(prev => ({...prev, [runType]: file.name}));
        
        const reader = new FileReader();
        reader.onload = (event) => {
            let fileContent = event.target?.result as string;
            if (!fileContent) return;

            fileContent = fileContent.replace(/(\d+),(\d+)/g, '$1.$2');

             Papa.parse(fileContent, {
                header: false,
                skipEmptyLines: true,
                delimiter: ';',
                preview: 20, // Preview first 20 lines to find header
                complete: (previewResults) => {
                    let headerRowIndex = -1;
                    let detectedHeaders: string[] = [];
                    
                    for (let i = 0; i < previewResults.data.length; i++) {
                        const row = previewResults.data[i] as string[];
                        if (!Array.isArray(row) || row.length < 2) continue;
                        const potentialHeaders = row.map(h => String(h || '').trim().toLowerCase());
                        
                        const rpmFound = potentialHeaders.some(h => h.includes('rpm') || h.includes('rotacao'));
                        const timeOrTorqueFound = potentialHeaders.some(h => h.includes('momento') || h.includes('tempo') || h.includes('torque'));

                        if (rpmFound && timeOrTorqueFound) {
                            headerRowIndex = i;
                            detectedHeaders = (previewResults.data[i] as string[]).map(h => h.trim());
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        const msg = "Não foi possível encontrar a linha de cabeçalho (com RPM e Tempo/Torque) no ficheiro de log.";
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
                                addLog(`Erros de análise no log de ignição: ${results.errors.map(e => e.message).join(', ')}`, 'error');
                            }
                            if (!results.meta.fields) {
                                toast({ title: "Erro no Log", description: "Não foi possível detetar cabeçalhos.", variant: "destructive"});
                                return;
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

                            const finalHeaders = Object.keys(cleanedData[0] || {});

                            setLogFiles(prev => ({...prev, [runType]: {
                                name: file.name,
                                headers: finalHeaders,
                                rawData: cleanedData,
                            }}));
                            
                        },
                        error: (error) => {
                            toast({ title: 'Erro de Leitura de Log', description: error.message, variant: "destructive" });
                            addLog(`Erro ao ler log de ignição: ${error.message}`, 'error');
                        }
                    });
                }
            });
        };
        reader.readAsText(file, 'ISO-8859-1');
    };

    const handleMappingConfirm = (runType: RunType, mapping: ColumnMapping, parsedData: IgnitionTimingPoint[]) => {
        onRunsChange({ ...runs, [runType]: parsedData });
        setLogFiles(prev => ({ ...prev, [runType]: null })); // Clear the raw data to remove the mapper UI
        addLog(`${parsedData.length} pontos carregados para o ensaio de ${runType}.`, 'success');
        toast({ title: `Log de ${runType} Carregado`, description: `${parsedData.length} pontos foram extraídos e mapeados.` });
    };

    const handleApplyIgnitionSuggestion = () => {
        setIsApplyingSuggestion(true);
        addLog("A iniciar a otimização automática do mapa de ignição...", "info");
    
        if (!processedMap || !processedMap.calculatedMap || !rpmAxis || !loadAxis || !selectedLoadValue || !selectedMapDefinition) {
            toast({ title: "Dados Incompletos", description: "Otimização falhou. Mapa ativo, eixos e linha de carga são necessários.", variant: "destructive" });
            setIsApplyingSuggestion(false);
            return;
        }
    
        const newCalculatedMap = processedMap.calculatedMap.map(row => [...row]);
        const modifiedCells = new Set<string>();
        const loadIsYAxis = loadAxis === processedMap.axes.y;
        const loadIndex = processedMap.axes[loadIsYAxis ? 'y' : 'x'].calculated.findIndex(val => String(val) === selectedLoadValue);
    
        let changesMade = 0;
    
        analysisResults.forEach(result => {
            if (result.gainPercent === null || result.gainPercent === undefined) return;
    
            const [startRpmStr, endRpmStr] = result.range.split(' -> ');
            const startRpm = parseFloat(startRpmStr);
            const endRpm = parseFloat(endRpmStr);
    
            let advanceChange = 0;
            // More sensitive threshold for making changes
            if (result.gainPercent > 0.2) {
                advanceChange = 0.5; // Continue advancing on noticeable gains
            } else if (result.gainPercent < -0.1) {
                advanceChange = -0.5; // Pull back timing on any noticeable loss
            }
            
            if (advanceChange === 0) return;
    
            const rpmIndicesToChange: number[] = [];
            rpmAxis.calculated.forEach((rpmVal, index) => {
                const numericRpm = Number(rpmVal);
                if (!isNaN(numericRpm) && numericRpm >= startRpm && numericRpm < endRpm) {
                    rpmIndicesToChange.push(index);
                }
            });
    
            rpmIndicesToChange.forEach(rpmIndex => {
                const y = loadIsYAxis ? loadIndex : rpmIndex;
                const x = loadIsYAxis ? rpmIndex : loadIndex;
    
                if (newCalculatedMap[y]?.[x] !== undefined && newCalculatedMap[y]?.[x] !== null) {
                    const currentValue = newCalculatedMap[y][x]!;
                    newCalculatedMap[y][x] = currentValue + advanceChange;
                    modifiedCells.add(`${y}-${x}`);
                    changesMade++;
                }
            });
        });
        
        if (changesMade === 0) {
            toast({ title: "Nenhuma Otimização Necessária", description: "Nenhuma alteração foi aplicada com base nos resultados atuais." });
            addLog("Otimizador de ignição executado, mas nenhuma alteração foi necessária.", "info");
            setIsApplyingSuggestion(false);
            return;
        }

        const newMapState: ProcessedMap = {
            ...processedMap,
            calculatedMap: newCalculatedMap
        };

        onMapUpdate(selectedMapDefinition.uniqueId, newMapState, modifiedCells);

        const successMsg = `Otimização do mapa de ignição concluída. ${changesMade} células foram ajustadas.`;
        toast({ title: "Otimização Aplicada", description: successMsg });
        addLog(successMsg, "success");
        setIsApplyingSuggestion(false);
    };

    if (!binFile) {
         return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Ficheiros Necessários</h3>
                <p className="max-w-md">Para utilizar a análise de ignição, por favor carregue primeiro um ficheiro .BIN e, se disponível, um ficheiro .XDF no painel de controlo.</p>
            </div>
        );
    }
    
    if (!isCurrentMapIgnition) {
         return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Mapa de Ignição Necessário</h3>
                <p className="max-w-md">Esta funcionalidade requer que um mapa de ignição esteja selecionado. Por favor, selecione um mapa contendo 'ignição', 'avanço', 'spark' ou 'timing' no nome.</p>
            </div>
        );
    }

    const baseButtonText = loadedFileNames.base 
        ? `Carregado: ${loadedFileNames.base} (${runs.base.length} pontos)` 
        : 'Carregar Log do Ensaio de Base';

    const modifiedButtonText = loadedFileNames.modified
        ? `Carregado: ${loadedFileNames.modified} (${runs.modified.length} pontos)`
        : 'Carregar Log do Ensaio Modificado';

    return (
        <div className="space-y-4 p-1">
            <Card>
                <CardHeader>
                    <CardTitle>Análise e Otimização de Ignição</CardTitle>
                     <CardDescription>
                        Compare dois ensaios de dinamómetro (um de base e um modificado) para encontrar o ponto de ignição ideal (MBT - Maximum Brake Torque).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4 rounded-lg border p-4">
                            <h4 className="font-semibold">Passo 1: Carregar Ensaio de Base</h4>
                            <p className="text-sm text-muted-foreground">
                               Carregue o ficheiro de log (.csv) do seu ensaio de dinamómetro inicial, antes de fazer alterações ao avanço de ignição.
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" className="flex-1 truncate" onClick={() => baseLogInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4 flex-shrink-0" />
                                    <span className="truncate" title={baseButtonText}>{baseButtonText}</span>
                                </Button>
                                 <input
                                    ref={baseLogInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleLogFileChange(e, 'base')}
                                />
                                 <Button variant="ghost" size="icon" onClick={() => handleClearRun('base')} disabled={runs.base.length === 0}>
                                    <Eraser className="h-4 w-4" />
                                </Button>
                            </div>
                            {logFiles.base && (
                                <ColumnMapper 
                                    logHeaders={logFiles.base.headers}
                                    onMappingConfirm={(mapping, parsedData) => handleMappingConfirm('base', mapping, parsedData)}
                                    runType="base"
                                    rawData={logFiles.base.rawData}
                                />
                            )}
                        </div>

                         <div className="space-y-4 rounded-lg border p-4">
                            <h4 className="font-semibold">Passo 2: Carregar Ensaio Modificado</h4>
                             <p className="text-sm text-muted-foreground">
                               Após ajustar o avanço no mapa e fazer um novo ensaio, carregue o ficheiro de log (.csv) correspondente.
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" className="flex-1 truncate" onClick={() => modifiedLogInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4 flex-shrink-0" />
                                    <span className="truncate" title={modifiedButtonText}>{modifiedButtonText}</span>
                                </Button>
                                 <input
                                    ref={modifiedLogInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleLogFileChange(e, 'modified')}
                                />
                                 <Button variant="ghost" size="icon" onClick={() => handleClearRun('modified')} disabled={runs.modified.length === 0}>
                                    <Eraser className="h-4 w-4" />
                                </Button>
                            </div>
                            {logFiles.modified && (
                                <ColumnMapper 
                                    logHeaders={logFiles.modified.headers}
                                    onMappingConfirm={(mapping, parsedData) => handleMappingConfirm('modified', mapping, parsedData)}
                                    runType="modified"
                                    rawData={logFiles.modified.rawData}
                                />
                            )}
                        </div>
                    </div>
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Alternativa: Pré-carregar Avanço do Mapa</CardTitle>
                            <CardDescription>Se o seu log não tiver uma coluna de avanço, pode pré-carregar os valores do mapa de ignição atual para o ensaio de base. Isto irá fundir os valores de avanço com os dados de tempo/torque do seu log.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1 w-full space-y-2">
                                <Label>Selecione a Linha de Carga do Mapa</Label>
                                <Select value={selectedLoadValue} onValueChange={setSelectedLoadValue} disabled={!loadAxis}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um valor de carga..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {loadAxis?.calculated.map((val, idx) => (
                                            <SelectItem key={idx} value={String(val)}>{val}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleLoadFromMap} disabled={!selectedLoadValue || isLoadingMap || runs.base.length === 0} className="w-full sm:w-auto">
                                {isLoadingMap && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Carregar Dados do Mapa
                            </Button>
                        </CardContent>
                    </Card>
                </CardContent>
            </Card>
            
            <IgnitionTimingPlot 
                runs={runs} 
                onPointUpdate={handlePointUpdate} 
                onClearRun={handleClearRun}
            />

             {analysisResults.length > 0 && (
                <div className="space-y-4">
                    <AnalysisResultsTable results={analysisResults} />
                     <Card>
                        <CardHeader>
                            <CardTitle>Otimizador de Avanço de Ignição</CardTitle>
                            <CardDescription>
                                Com base na análise de ganhos, a IA pode aplicar pequenas correções incrementais ao seu mapa de ignição para o ajudar a encontrar o MBT de forma segura e iterativa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Button 
                                className="w-full"
                                onClick={handleApplyIgnitionSuggestion}
                                disabled={isApplyingSuggestion || !selectedLoadValue}
                            >
                                {isApplyingSuggestion ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Wand2 className="mr-2 h-4 w-4" />
                                )}
                                Otimizar Mapa com Base no Ensaio
                            </Button>
                            {!selectedLoadValue && (
                                <p className="text-xs text-destructive text-center mt-2">
                                    Por favor, selecione a linha de carga do mapa que corresponde ao ensaio antes de otimizar.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
             )}
        </div>
    );
}
