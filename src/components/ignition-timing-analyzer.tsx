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
}

interface TimingSegment {
    range: string;
    baseTime: number | null;
    modifiedTime: number | null;
    baseTorque: number | null;
    modifiedTorque: number | null;
    delta: number | null;
    gainPercent: number | null;
    suggestion: string;
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
                                    <TableHead>Diferença (s)</TableHead>
                                </>
                            ) : (
                                <>
                                    <TableHead>Torque Base</TableHead>
                                    <TableHead>Torque Modificado</TableHead>
                                    <TableHead>Diferença</TableHead>
                                </>
                            )}
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


export default function IgnitionTimingAnalyzer({ runs, onRunsChange, binFile, processedMap, selectedMapDefinition, addLog }: IgnitionTimingAnalyzerProps) {

    const { toast } = useToast();
    const baseLogInputRef = useRef<HTMLInputElement>(null);
    const modifiedLogInputRef = useRef<HTMLInputElement>(null);
    const [logFiles, setLogFiles] = useState<{base: {name: string} | null, modified: {name: string} | null}>({base: null, modified: null});
    const [isLoadingMap, setIsLoadingMap] = useState(false);

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
                .filter(p => !isNaN(p.rpm) && p.rpm > 0 && !isNaN(p.advance) && (mode === 'time' ? !isNaN(p.time) && p.time >= 0 : !isNaN(p.torque) && p.torque > 0))
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
            let delta: number | null = null;
            let gainPercent: number | null = null;
            let suggestion: string = '-';

            const findPoint = (points: ValidPoint[], rpm: number) => points.find(p => p.rpm === rpm);
            
            const baseStartPoint = findPoint(basePoints, startRpm);
            const baseEndPoint = findPoint(basePoints, endRpm);
            const modifiedStartPoint = findPoint(modifiedPoints, startRpm);
            const modifiedEndPoint = findPoint(modifiedPoints, endRpm);

            if (mode === 'time') {
                baseTime = (baseStartPoint && baseEndPoint) ? baseEndPoint.time - baseStartPoint.time : null;
                modifiedTime = (modifiedStartPoint && modifiedEndPoint) ? modifiedEndPoint.time - modifiedStartPoint.time : null;
                
                delta = (baseTime !== null && modifiedTime !== null) ? modifiedTime - baseTime : null;
                gainPercent = (baseTime !== null && delta !== null && baseTime > 0) ? (-delta / baseTime) * 100 : null;

            } else { // Torque mode
                const findAvgTorque = (points: ValidPoint[], start: number, end: number) => {
                    const relevantPoints = points.filter(p => p.rpm >= start && p.rpm <= end);
                    if (relevantPoints.length === 0) return null;
                    const sum = relevantPoints.reduce((acc, p) => acc + p.torque, 0);
                    return sum / relevantPoints.length;
                };

                baseTorque = findAvgTorque(basePoints, startRpm, endRpm);
                modifiedTorque = findAvgTorque(modifiedPoints, startRpm, endRpm);
                
                delta = (baseTorque !== null && modifiedTorque !== null) ? modifiedTorque - baseTorque : null;
                gainPercent = (baseTorque !== null && delta !== null && baseTorque > 0) ? (delta / baseTorque) * 100 : null;
            }

            if (gainPercent !== null) {
                if (Math.abs(gainPercent) < 0.1) { // Threshold for no significant change
                    suggestion = "Manter (MBT Provável)";
                } else if (gainPercent > 0) {
                     const baseAdvance = baseEndPoint?.advance;
                     const modifiedAdvance = modifiedEndPoint?.advance;
                     if (typeof baseAdvance === 'number' && typeof modifiedAdvance === 'number' && modifiedAdvance > baseAdvance) {
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
                const rpmIndex = processedMap.axes[rpmIsYAxis ? 'y' : 'x'].calculated.findIndex(val => Number(val) === rpmValue);
    
                if (rpmIndex === -1) {
                     // Try finding closest if exact match fails
                    const closestRpmIndex = rpmAxis.calculated.reduce((closest, current, idx) => {
                        const currentDiff = Math.abs(Number(current) - rpmValue);
                        const closestDiff = Math.abs(Number(rpmAxis.calculated[closest]) - rpmValue);
                        return currentDiff < closestDiff ? idx : closest;
                    }, 0);

                     if (closestRpmIndex !== -1) {
                         const yIndex = rpmIsYAxis ? closestRpmIndex : loadIndex;
                         const xIndex = rpmIsYAxis ? loadIndex : closestRpmIndex;
                         const advance = processedMap.calculatedMap?.[yIndex]?.[xIndex];
                          return { ...point, advance: advance !== null && advance !== undefined ? String(advance) : point.advance };
                     }
                    return point;
                }
    
                const yIndex = rpmIsYAxis ? rpmIndex : loadIndex;
                const xIndex = rpmIsYAxis ? loadIndex : rpmIndex;
    
                const advance = processedMap.calculatedMap?.[yIndex]?.[xIndex];
    
                return { ...point, advance: advance !== null && advance !== undefined ? String(advance) : point.advance };
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
        
        const reader = new FileReader();
        reader.onload = (event) => {
            let fileContent = event.target?.result as string;
            if (!fileContent) return;

            // Pre-process to handle comma decimals
            fileContent = fileContent.replace(/(\d+),(\d+)/g, '$1.$2');

             // Find header row intelligently
             Papa.parse(fileContent, {
                header: false,
                skipEmptyLines: true,
                delimiter: ';',
                preview: 20, // Preview first 20 lines to find header
                complete: (previewResults) => {
                    let headerRowIndex = -1;
                    let detectedHeaders: string[] = [];

                    const rpmKeywords = ['rpm', 'rotacao', 'rotação'];
                    const timeKeywords = ['time', 'tempo', 'momento'];
                    const torqueKeywords = ['torque'];
                    
                    for (let i = 0; i < previewResults.data.length; i++) {
                        const row = previewResults.data[i] as string[];
                        if (!Array.isArray(row)) continue;
                        const potentialHeaders = row.map(h => String(h || '').trim().toLowerCase());
                        
                        const rpmFound = potentialHeaders.some(h => rpmKeywords.some(kw => h.includes(kw)));
                        const timeOrTorqueFound = potentialHeaders.some(h => [...timeKeywords, ...torqueKeywords].some(kw => h.includes(kw)));

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

                            const headers = results.meta.fields.map(h => h.trim().toLowerCase());
                            const rpmKey = headers.find(h => rpmKeywords.some(kw => h.includes(kw)));
                            const timeKey = headers.find(h => timeKeywords.some(kw => h.includes(kw)));
                            const torqueKey = headers.find(h => torqueKeywords.some(kw => h.includes(kw)));
                            const advanceKey = headers.find(h => ['ign', 'avanco', 'avanço', 'advance'].some(kw => h.includes(kw)));

                            if (!rpmKey || (!timeKey && !torqueKey)) {
                                toast({ title: "Colunas em Falta", description: "O log deve conter RPM e Tempo ou Torque.", variant: "destructive"});
                                addLog(`Log de ignição inválido: falta RPM e/ou Tempo/Torque. Cabeçalhos: ${headers.join(', ')}`, 'error');
                                return;
                            }

                            // Find original-cased keys for data access
                            const originalFields = results.meta.fields || [];
                            const originalRpmKey = originalFields.find(f => f.trim().toLowerCase() === rpmKey) || rpmKey;
                            const originalTimeKey = timeKey ? originalFields.find(f => f.trim().toLowerCase() === timeKey) : undefined;
                            const originalTorqueKey = torqueKey ? originalFields.find(f => f.trim().toLowerCase() === torqueKey) : undefined;
                            const originalAdvanceKey = advanceKey ? originalFields.find(f => f.trim().toLowerCase() === advanceKey) : undefined;

                            const runPoints: IgnitionTimingPoint[] = results.data.map((row: any, index: number) => ({
                                id: `${runType}_${index}`,
                                rpm: row[originalRpmKey] ? String(row[originalRpmKey]) : '',
                                time: originalTimeKey && row[originalTimeKey] !== null ? String(row[originalTimeKey]) : '',
                                torque: originalTorqueKey && row[originalTorqueKey] !== null ? String(row[originalTorqueKey]) : '',
                                advance: originalAdvanceKey && row[originalAdvanceKey] !== null ? String(row[originalAdvanceKey]) : '',
                            }));

                            onRunsChange({ ...runs, [runType]: runPoints });
                            setLogFiles(prev => ({...prev, [runType]: {name: file.name}}))
                            addLog(`${runPoints.length} pontos carregados do log de ${runType}.`, 'success');
                            toast({ title: `Log de ${runType} Carregado`, description: `${runPoints.length} pontos foram extraídos.`});
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
                                <Button variant="outline" className="flex-1" onClick={() => baseLogInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {logFiles.base ? logFiles.base.name : 'Carregar Log do Ensaio de Base'}
                                </Button>
                                 <input
                                    ref={baseLogInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleLogFileChange(e, 'base')}
                                />
                                 <Button variant="ghost" size="icon" onClick={() => handleClearRun('base')} disabled={!logFiles.base && runs.base.length === 0}>
                                    <Eraser className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                         <div className="space-y-4 rounded-lg border p-4">
                            <h4 className="font-semibold">Passo 2: Carregar Ensaio Modificado</h4>
                             <p className="text-sm text-muted-foreground">
                               Após ajustar o avanço no mapa e fazer um novo ensaio, carregue o ficheiro de log (.csv) correspondente.
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => modifiedLogInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {logFiles.modified ? logFiles.modified.name : 'Carregar Log do Ensaio Modificado'}
                                </Button>
                                 <input
                                    ref={modifiedLogInputRef}
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleLogFileChange(e, 'modified')}
                                />
                                 <Button variant="ghost" size="icon" onClick={() => handleClearRun('modified')} disabled={!logFiles.modified && runs.modified.length === 0}>
                                    <Eraser className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Alternativa: Pré-carregar Avanço do Mapa</CardTitle>
                            <CardDescription>Se não tiver uma coluna de avanço no seu log, pode pré-carregar os valores do mapa de ignição atual para o ensaio de base.</CardDescription>
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
                            <Button onClick={handleLoadFromMap} disabled={!selectedLoadValue || isLoadingMap} className="w-full sm:w-auto">
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
                <AnalysisResultsTable results={analysisResults} />
             )}
        </div>
    );
}
