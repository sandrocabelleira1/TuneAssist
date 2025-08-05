
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IgnitionTimingRun, IgnitionTimingPoint } from '@/lib/types';


type RunType = 'base' | 'modified';

interface IgnitionTimingAnalyzerProps {
    runs: IgnitionTimingRun;
    onRunsChange: (runs: IgnitionTimingRun) => void;
}

const createNewPoint = (): IgnitionTimingPoint => ({
    id: `point_${Date.now()}_${Math.random()}`,
    rpm: '',
    time: '',
    torque: '',
    advance: '',
});

const RunInputTable = ({ title, description, points, setPoints }: {
    title: string;
    description: string;
    points: IgnitionTimingPoint[];
    setPoints: (points: IgnitionTimingPoint[]) => void;
}) => {

    const handlePointChange = (id: string, field: 'rpm' | 'time' | 'torque' | 'advance', value: string) => {
        const newPoints = points.map(p => {
            if (p.id === id) {
                const numValue = value === '' ? '' : parseFloat(value);
                return { ...p, [field]: numValue };
            }
            return p;
        });
        setPoints(newPoints);
    };

    const addPoint = () => {
        setPoints([...points, createNewPoint()]);
    };

    const removePoint = (id: string) => {
        setPoints(points.filter(p => p.id !== id));
    };

    return (
         <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">RPM</TableHead>
                            <TableHead className="w-[120px]">Avanço Ignição (°)</TableHead>
                            <TableHead className="w-[120px]">Tempo (s)</TableHead>
                            <TableHead className="w-[150px]">Torque (Opcional)</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {points.map(point => (
                            <TableRow key={point.id}>
                                <TableCell>
                                    <Input
                                        type="number"
                                        placeholder="Ex: 3000"
                                        value={point.rpm}
                                        onChange={(e) => handlePointChange(point.id, 'rpm', e.target.value)}
                                    />
                                </TableCell>
                                 <TableCell>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        placeholder="Ex: 25.5"
                                        value={point.advance}
                                        onChange={(e) => handlePointChange(point.id, 'advance', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                     <Input
                                        type="number"
                                        step="0.001"
                                        placeholder="Ex: 1.589"
                                        value={point.time}
                                        onChange={(e) => handlePointChange(point.id, 'time', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                     <Input
                                        type="number"
                                        step="0.1"
                                        placeholder="Ex: 250.5"
                                        value={point.torque}
                                        onChange={(e) => handlePointChange(point.id, 'torque', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removePoint(point.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-4" onClick={addPoint}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Ponto
                </Button>
            </CardContent>
        </Card>
    );
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
                                     'text-green-500': res.suggestion.includes('Avançar'),
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


export default function IgnitionTimingAnalyzer({ runs, onRunsChange }: IgnitionTimingAnalyzerProps) {

    const setRunPoints = (runType: RunType, points: IgnitionTimingPoint[]) => {
        const sortedPoints = [...points].sort((a,b) => (a.rpm || 0) - (b.rpm || 0));
        onRunsChange({
            ...runs,
            [runType]: sortedPoints
        });
    };

    const { analysisResults, analysisMode } = useMemo(() => {
        const results: TimingSegment[] = [];
        
        const hasTorqueData = runs.base.some(p => typeof p.torque === 'number' && p.torque > 0) || 
                              runs.modified.some(p => typeof p.torque === 'number' && p.torque > 0);
        
        const mode: 'time' | 'torque' = hasTorqueData ? 'torque' : 'time';

        const processRun = (points: IgnitionTimingPoint[]) => {
            if (mode === 'time') {
                 return points.filter(p => typeof p.rpm === 'number' && typeof p.time === 'number' && typeof p.advance === 'number' && p.rpm > 0 && p.time >= 0);
            }
            return points.filter(p => typeof p.rpm === 'number' && typeof p.torque === 'number' && typeof p.advance === 'number' && p.rpm > 0 && p.torque > 0);
        };

        const basePoints = processRun(runs.base);
        const modifiedPoints = processRun(runs.modified);

        if (basePoints.length < 2 && modifiedPoints.length < 2) {
             return { analysisResults: [], analysisMode: mode };
        }

        const allRpms = new Set([...basePoints.map(p => p.rpm as number), ...modifiedPoints.map(p => p.rpm as number)]);
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

            const findPoint = (points: IgnitionTimingPoint[], rpm: number) => points.find(p => p.rpm === rpm);
            
            const baseStartPoint = findPoint(basePoints, startRpm);
            const baseEndPoint = findPoint(basePoints, endRpm);
            const modifiedStartPoint = findPoint(modifiedPoints, startRpm);
            const modifiedEndPoint = findPoint(modifiedPoints, endRpm);

            if (mode === 'time') {
                baseTime = (baseStartPoint?.time !== undefined && baseEndPoint?.time !== undefined) ? (baseEndPoint.time as number) - (baseStartPoint.time as number) : null;
                modifiedTime = (modifiedStartPoint?.time !== undefined && modifiedEndPoint?.time !== undefined) ? (modifiedEndPoint.time as number) - (modifiedStartPoint.time as number) : null;
                
                delta = (baseTime !== null && modifiedTime !== null) ? modifiedTime - baseTime : null;
                gainPercent = (baseTime !== null && delta !== null && baseTime > 0) ? (-delta / baseTime) * 100 : null;

            } else { // Torque mode
                const findAvgTorque = (points: IgnitionTimingPoint[], start: number, end: number) => {
                    const relevantPoints = points.filter(p => p.rpm >= start && p.rpm <= end);
                    if (relevantPoints.length === 0) return null;
                    const sum = relevantPoints.reduce((acc, p) => acc + (p.torque as number), 0);
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
                         suggestion = "Ganho positivo";
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

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-background">
                <strong className="text-foreground">Como usar:</strong> <br/>
                1. Faça um ensaio com o mapa de ignição atual (base), registando o avanço, RPM e tempo/torque.<br/>
                2. Modifique o seu mapa de ignição (ex: avance 1 grau na zona do ensaio). <br/>
                3. Repita exatamente o mesmo ensaio com o mapa modificado. <br/>
                4. A tabela de resultados irá comparar a performance e sugerir os próximos passos. Um <span className="text-green-500 font-semibold">ganho positivo</span> indica uma melhoria. <br/>
                <strong className="text-destructive">Aviso:</strong> Esta ferramenta ajuda a encontrar o binário máximo (MBT), mas não deteta detonação (knock). Afine com cuidado, use combustível de alta octanagem e ouça o motor.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RunInputTable 
                    title="Ensaio de Base"
                    description="Insira os dados (RPM vs. Avanço vs. Tempo/Torque) do seu mapa de ignição atual."
                    points={runs.base}
                    setPoints={(points) => setRunPoints('base', points)}
                />
                 <RunInputTable 
                    title="Ensaio Modificado"
                    description="Insira os dados do seu mapa de ignição modificado."
                    points={runs.modified}
                    setPoints={(points) => setRunPoints('modified', points)}
                />
            </div>
             {analysisResults.length > 0 && (
                <AnalysisResultsTable results={analysisResults} analysisMode={analysisMode} />
             )}
        </div>
    );
}
