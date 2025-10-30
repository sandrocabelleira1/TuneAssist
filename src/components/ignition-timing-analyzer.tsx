
'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Wand2, Download, AlertTriangle, Upload, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IgnitionTimingRun, IgnitionTimingPoint, ProcessedMap, AxisData, XDFinition, LogMessage } from '@/lib/types';
import IgnitionTimingPlot from '@/components/ignition-timing-plot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type RunType = 'base' | 'modified';

interface IgnitionTimingAnalyzerProps {
    runs: IgnitionTimingRun;
    onRunsChange: (runs: IgnitionTimingRun) => void;
    binFile: { name: string; buffer: ArrayBuffer } | null;
    processedMap: ProcessedMap | null;
    selectedMapDefinition: XDFinition | undefined;
    addLog: (message: string, type?: LogMessage['type']) => void;
    mainLogData: any[];
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

const AnalysisResultsTable = ({ results, analysisMode }: { results: TimingSegment[], analysisMode: 'time' | 'torque' }) => {
    const isTimeMode = analysisMode === 'time';
    
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


export default function IgnitionTimingAnalyzer({ runs, onRunsChange, binFile, processedMap, selectedMapDefinition, addLog, mainLogData }: IgnitionTimingAnalyzerProps) {

    const { toast } = useToast();
    const [selectedLoadIndex, setSelectedLoadIndex] = useState<string>('');
    const modifiedLogInputRef = useRef<HTMLInputElement>(null);
    const [logFiles, setLogFiles] = useState<{base: {name: string} | null, modified: {name: string} | null}>({base: null, modified: null});

    const isCurrentMapIgnition = useMemo(() => {
        if (!selectedMapDefinition) return false;
        const keywords = ['ignition', 'spark', 'advance', 'timing', 'ignição', 'avanço', 'ign'];
        return keywords.some(kw => selectedMapDefinition.name.toLowerCase().includes(kw));
    }, [selectedMapDefinition]);

    useEffect(() => {
        if (!isCurrentMapIgnition) {
            setSelectedLoadIndex('');
        }
    }, [isCurrentMapIgnition, selectedMapDefinition]);


    const { analysisResults, analysisMode } = useMemo(() => {
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
             return { analysisResults: [], analysisMode: mode };
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

        return { analysisResults: results, analysisMode: mode };

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
        if(runType === 'modified' && modifiedLogInputRef.current) modifiedLogInputRef.current.value = '';
        toast({ title: `Ensaio ${runType === 'base' ? 'de Base' : 'Modificado'} Limpo`, description: "Os dados foram removidos."});

    }, [runs, onRunsChange, toast]);

    const handlePreloadFromMapAndLog = useCallback(() => {
        if (!processedMap || !processedMap.axes || !processedMap.calculatedMap || selectedLoadIndex === '') {
            toast({ title: "Dados Insuficientes", description: "Mapa de ignição ou linha de carga não selecionada.", variant: "destructive" });
            return;
        }

        if (!mainLogData || mainLogData.length === 0) {
            toast({ title: "Log em Falta", description: "Carregue primeiro um log de ensaio na aba 'Análise de Combustível'.", variant: "destructive" });
            return;
        }

        const logHeaders = Object.keys(mainLogData[0] || {});
        const rpmLogKey = logHeaders.find(h => h.includes('rpm') || h.includes('rotacao'));
        const timeLogKey = logHeaders.find(h => h.includes('time') || h.includes('tempo'));
        const torqueLogKey = logHeaders.find(h => h.includes('torque'));

        if (!rpmLogKey || (!timeLogKey && !torqueLogKey)) {
            toast({ title: "Colunas em Falta no Log", description: "O log principal deve conter RPM e Tempo ou Torque.", variant: "destructive"});
            return;
        }


        const loadIndex = parseInt(selectedLoadIndex, 10);
        if (isNaN(loadIndex)) return;
        
        const rpmRegex = /rpm/i;
        const isXrpm = processedMap.axes.x.label ? rpmRegex.test(processedMap.axes.x.label) : false;
        const isYrpm = processedMap.axes.y.label ? rpmRegex.test(processedMap.axes.y.label) : true; 

        let rpmAxis: AxisData, isLoadAxisY: boolean;

        if (isXrpm) {
            rpmAxis = processedMap.axes.x;
            isLoadAxisY = true;
        } else {
            rpmAxis = isYrpm ? processedMap.axes.y : processedMap.axes.x;
            isLoadAxisY = !isYrpm;
        }
        
        const loadAxis = isLoadAxisY ? processedMap.axes.y : processedMap.axes.x;

        if (loadIndex >= loadAxis.calculated.length) {
            toast({ title: "Índice Inválido", description: "O índice de carga selecionado está fora dos limites.", variant: "destructive" });
            return;
        }
        
        const baseRunPoints: IgnitionTimingPoint[] = mainLogData.map((logEntry, index) => {
            const rpm = logEntry[rpmLogKey];
            if (!rpm || isNaN(rpm)) return null;

            const mapRpmIndex = rpmAxis.calculated.findIndex(r => r === rpm);
            if (mapRpmIndex === -1) return null;

            const advanceValue = isLoadAxisY
                ? processedMap.calculatedMap?.[loadIndex]?.[mapRpmIndex]
                : processedMap.calculatedMap?.[mapRpmIndex]?.[loadIndex];
            
            return {
                id: `base_${rpm}_${index}`,
                rpm: String(rpm),
                advance: advanceValue !== null && advanceValue !== undefined ? String(advanceValue) : '',
                time: timeLogKey && logEntry[timeLogKey] ? String(logEntry[timeLogKey]) : '',
                torque: torqueLogKey && logEntry[torqueLogKey] ? String(logEntry[torqueLogKey]) : ''
            }
        }).filter((p): p is IgnitionTimingPoint => p !== null && isFinite(parseFloat(p.rpm)) && parseFloat(p.rpm) > 0);


        onRunsChange({ ...runs, base: baseRunPoints });
        addLog(`${baseRunPoints.length} pontos de ensaio de base carregados do mapa e do log principal.`, 'success');
        toast({ title: "Ensaio de Base Carregado", description: `Combinados ${baseRunPoints.length} pontos do mapa e do log.`, variant: "default"});

    }, [processedMap, selectedLoadIndex, onRunsChange, toast, runs, mainLogData, addLog]);
    
    const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>, runType: RunType) => {
        const file = e.target.files?.[0];
        if (!file) return;

        addLog(`A ler o ficheiro de log de ignição (${runType}) ${file.name}...`, 'info');
        
        const reader = new FileReader();
        reader.onload = (event) => {
            let fileContent = event.target?.result as string;
            if (!fileContent) return;

            fileContent = fileContent.replace(/(\\d+),(\\d+)/g, '$1.$2');

            Papa.parse(fileContent, {
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
                    const rpmKey = headers.find(h => h.includes('rpm') || h.includes('rotacao'));
                    const timeKey = headers.find(h => h.includes('time') || h.includes('tempo'));
                    const torqueKey = headers.find(h => h.includes('torque'));
                    const advanceKey = headers.find(h => h.includes('ign') || h.includes('avanco') || h.includes('advance'));

                    if (!rpmKey || (!timeKey && !torqueKey)) {
                         toast({ title: "Colunas em Falta", description: "O log deve conter RPM e Tempo ou Torque.", variant: "destructive"});
                         addLog(`Log de ignição inválido: falta RPM e/ou Tempo/Torque. Cabeçalhos: ${headers.join(', ')}`, 'error');
                         return;
                    }

                    const runPoints: IgnitionTimingPoint[] = results.data.map((row: any, index: number) => ({
                        id: `${runType}_${index}`,
                        rpm: row[rpmKey] ? String(row[rpmKey]) : '',
                        time: timeKey && row[timeKey] ? String(row[timeKey]) : '',
                        torque: torqueKey && row[torqueKey] ? String(row[torqueKey]) : '',
                        advance: advanceKey && row[advanceKey] ? String(row[advanceKey]) : '',
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
        };
        reader.readAsText(file, 'ISO-8859-1');
    };
    
    const loadAxis = useMemo<AxisData | null>(() => {
        if (!processedMap || !processedMap.axes) return null;
        const { x, y } = processedMap.axes;
        const rpmRegex = /rpm/i;
        if(x.label && rpmRegex.test(x.label)) return y;
        if(y.label && rpmRegex.test(y.label)) return x;
        return y;
    }, [processedMap]);
    

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
        <div className="space-y-4 p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Análise e Otimização de Ignição</CardTitle>
                     <CardDescription>
                        Combine os dados do seu mapa de ignição com os resultados do seu log de dinamómetro para encontrar o ponto de ignição ideal (MBT).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div>
                        <h4 className="font-semibold mb-2">Passo 1: Carregar Ensaio de Base</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                           Selecione a linha de carga do mapa que corresponde ao seu ensaio de dinamómetro. O sistema irá carregar os valores de avanço do mapa e combinar com os dados de RPM e tempo/torque do log principal (carregado na aba de Combustível).
                        </p>
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                             <Select
                                value={selectedLoadIndex}
                                onValueChange={setSelectedLoadIndex}
                                disabled={!loadAxis}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={loadAxis ? `Selecione ${loadAxis.label}...` : "Eixo de carga não encontrado"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {loadAxis?.calculated.map((val, index) => (
                                        <SelectItem key={index} value={String(index)}>
                                            {typeof val === 'number' ? val.toFixed(2) : val}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={handlePreloadFromMapAndLog} disabled={selectedLoadIndex === '' || !processedMap || mainLogData.length === 0} className="w-full sm:w-auto">
                                <Download className="mr-2 h-4 w-4" />
                                Carregar Ensaio de Base
                            </Button>
                        </div>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-2">Passo 2: Inserir Ensaio Modificado</h4>
                         <p className="text-sm text-muted-foreground mb-4">
                           Após ajustar o avanço no mapa e fazer um novo ensaio, insira os resultados. Pode carregar um novo log CSV para o ensaio modificado ou inserir os pontos de tempo/torque manualmente no gráfico.
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
                </CardContent>
            </Card>
            
            <IgnitionTimingPlot 
                runs={runs} 
                onPointUpdate={handlePointUpdate} 
                onClearRun={handleClearRun}
                analysisMode={analysisMode}
            />

             {analysisResults.length > 0 && (
                <AnalysisResultsTable results={analysisResults} analysisMode={analysisMode} />
             )}
        </div>
    );
}

    

    