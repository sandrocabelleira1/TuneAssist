
'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Wand2, Download, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IgnitionTimingRun, IgnitionTimingPoint, ProcessedMap, AxisData, XDFDefinition, ManualAxisConfig } from '@/lib/types';
import IgnitionTimingPlot from '@/components/ignition-timing-plot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type RunType = 'base' | 'modified';

interface IgnitionTimingAnalyzerProps {
    runs: IgnitionTimingRun;
    onRunsChange: (runs: IgnitionTimingRun) => void;
    binFile: { name: string; buffer: ArrayBuffer } | null;
    xdfDefinitions: XDFinition[];
    processedMap: ProcessedMap | null;
    selectedMapDefinition: XDFDefinition | undefined;
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


export default function IgnitionTimingAnalyzer({ runs, onRunsChange, binFile, processedMap, selectedMapDefinition }: IgnitionTimingAnalyzerProps) {

    const { toast } = useToast();
    const [selectedLoadIndex, setSelectedLoadIndex] = useState<string>('');

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
        onRunsChange({
            ...runs,
            [runType]: []
        });
    }, [runs, onRunsChange]);

    const handlePreload = useCallback(() => {
        if (!processedMap || !processedMap.axes || !processedMap.calculatedMap || selectedLoadIndex === '') {
            toast({ title: "Dados Insuficientes", description: "Mapa de ignição ou linha de carga não selecionada.", variant: "destructive" });
            return;
        }

        const loadIndex = parseInt(selectedLoadIndex, 10);
        if (isNaN(loadIndex)) return;
        
        const rpmRegex = /rpm/i;
        const isXrpm = processedMap.axes.x.label ? rpmRegex.test(processedMap.axes.x.label) : false;
        const isYrpm = processedMap.axes.y.label ? rpmRegex.test(processedMap.axes.y.label) : true; // Default to Y is more common

        let rpmAxis: AxisData, isLoadAxisY: boolean;

        if (isXrpm) {
            rpmAxis = processedMap.axes.x;
            isLoadAxisY = true;
        } else { // Default to Y axis as load if X is not RPM
            rpmAxis = isYrpm ? processedMap.axes.y : processedMap.axes.x; // RPM could be X or Y
            isLoadAxisY = !isYrpm; // If RPM is Y, load is X
        }
        
        const loadAxis = isLoadAxisY ? processedMap.axes.y : processedMap.axes.x;

        if (loadIndex >= loadAxis.calculated.length) {
            toast({ title: "Índice Inválido", description: "O índice de carga selecionado está fora dos limites.", variant: "destructive" });
            return;
        }
        
        const baseRunPoints: IgnitionTimingPoint[] = rpmAxis.calculated.map((rpmValue, rpmIndex) => {
            const advanceValue = isLoadAxisY
                ? processedMap.calculatedMap?.[loadIndex]?.[rpmIndex] // Load is Y axis
                : processedMap.calculatedMap?.[rpmIndex]?.[loadIndex]; // Load is X axis

            return {
                id: `base_${rpmValue}`,
                rpm: String(rpmValue),
                advance: advanceValue !== null && advanceValue !== undefined ? String(advanceValue) : '',
                time: '',
                torque: ''
            }
        }).filter(p => {
            const rpm = parseFloat(p.rpm);
            const advance = parseFloat(p.advance);
            return isFinite(rpm) && rpm > 0 && isFinite(advance);
        });

        onRunsChange({ base: baseRunPoints, modified: [] });
        toast({ title: "Dados de Base Carregados", description: `Carregados ${baseRunPoints.length} pontos de avanço do mapa.`, variant: "default"});

    }, [processedMap, selectedLoadIndex, onRunsChange, toast]);
    
    const loadAxis = useMemo<AxisData | null>(() => {
        if (!processedMap || !processedMap.axes) return null;
        const { x, y } = processedMap.axes;
        const rpmRegex = /rpm/i;
        if(x.label && rpmRegex.test(x.label)) return y;
        if(y.label && rpmRegex.test(y.label)) return x;
        // Default assumption: if one axis is not explicitly RPM, it's the load axis.
        // Assume Y is load if no RPM is found.
        return y;
    }, [processedMap]);
    

    if (!binFile) {
         return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Ficheiros Necessários</h3>
                <p className="max-w-md">Para utilizar a análise de ignição, por favor carregue primeiro um ficheiro .BIN e um ficheiro .XDF no painel de controlo à esquerda.</p>
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
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-background">
                <strong className="text-foreground">Como usar:</strong> <br/>
                1. Selecione a linha de carga (TPS/MAP) abaixo para pré-carregar os dados de avanço para o ensaio de base.<br />
                2. Faça um ensaio com o mapa atual, registando RPM e tempo/torque. Clique nos pontos do gráfico para inserir os dados. <br/>
                3. Modifique o seu mapa de ignição (ex: avance 1 grau na zona do ensaio). <br/>
                4. Repita exatamente o mesmo ensaio com o mapa modificado, inserindo os dados no gráfico de ensaio modificado. <br/>
                5. A tabela de resultados irá comparar a performance e sugerir os próximos passos. Um <span className="text-green-500 font-semibold">ganho positivo</span> indica uma melhoria. <br/>
                <strong className="text-destructive">Aviso:</strong> Esta ferramenta ajuda a encontrar o binário máximo (MBT), mas não deteta detonação (knock). Afine com cuidado, use combustível de alta octanagem e ouça o motor.
            </p>
            
             <Card>
                <CardHeader>
                    <CardTitle>Pré-carregar Dados do Mapa</CardTitle>
                    <CardDescription>
                       O mapa ativo é <span className="font-semibold text-primary">{selectedMapDefinition?.name}</span>. Selecione a linha de carga (TPS/MAP) para preencher os dados do ensaio de base.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-center gap-4">
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
                    <Button onClick={handlePreload} disabled={selectedLoadIndex === '' || !processedMap} className="w-full sm:w-auto">
                        <Download className="mr-2 h-4 w-4" />
                        Carregar Dados
                    </Button>
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
