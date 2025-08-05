
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
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
    time: ''
});

const RunInputTable = ({ title, description, points, setPoints }: {
    title: string;
    description: string;
    points: IgnitionTimingPoint[];
    setPoints: (points: IgnitionTimingPoint[]) => void;
}) => {

    const handlePointChange = (id: string, field: 'rpm' | 'time', value: string) => {
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
                            <TableHead className="w-[150px]">RPM</TableHead>
                            <TableHead className="w-[150px]">Tempo (s)</TableHead>
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
                                        step="0.001"
                                        placeholder="Ex: 1.589"
                                        value={point.time}
                                        onChange={(e) => handlePointChange(point.id, 'time', e.target.value)}
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
    delta: number | null;
    gainPercent: number | null;
}

const AnalysisResultsTable = ({ results }: { results: TimingSegment[] }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Resultados da Análise</CardTitle>
                <CardDescription>Comparação do tempo gasto em cada faixa de RPM. Tempos mais baixos indicam ganho de binário.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Faixa de RPM</TableHead>
                            <TableHead>Tempo Base (s)</TableHead>
                            <TableHead>Tempo Modificado (s)</TableHead>
                            <TableHead>Diferença (s)</TableHead>
                            <TableHead>Ganho/Perda (%)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map(res => (
                            <TableRow key={res.range}>
                                <TableCell className="font-medium">{res.range}</TableCell>
                                <TableCell>{res.baseTime?.toFixed(3) ?? '-'}</TableCell>
                                <TableCell>{res.modifiedTime?.toFixed(3) ?? '-'}</TableCell>
                                <TableCell className={cn({
                                    'text-green-500 font-semibold': res.delta && res.delta < 0,
                                    'text-destructive font-semibold': res.delta && res.delta > 0,
                                })}>
                                    {res.delta?.toFixed(3) ?? '-'}
                                </TableCell>
                                 <TableCell className={cn({
                                    'text-green-500 font-semibold': res.gainPercent && res.gainPercent > 0,
                                    'text-destructive font-semibold': res.gainPercent && res.gainPercent < 0,
                                })}>
                                    {res.gainPercent ? `${res.gainPercent > 0 ? '+' : ''}${res.gainPercent.toFixed(2)}%` : '-'}
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

    const analysisResults = useMemo((): TimingSegment[] => {
        const results: TimingSegment[] = [];
        const processRun = (points: IgnitionTimingPoint[]) => {
            const validPoints = points.filter(p => typeof p.rpm === 'number' && typeof p.time === 'number' && p.rpm > 0 && p.time >= 0);
            return validPoints;
        };

        const basePoints = processRun(runs.base);
        const modifiedPoints = processRun(runs.modified);

        const allRpms = new Set([...basePoints.map(p => p.rpm), ...modifiedPoints.map(p => p.rpm)]);
        const sortedRpms = Array.from(allRpms).sort((a,b) => a - b);
        
        for (let i = 0; i < sortedRpms.length - 1; i++) {
            const startRpm = sortedRpms[i];
            const endRpm = sortedRpms[i+1];
            
            const findTime = (points: IgnitionTimingPoint[], rpm: number) => points.find(p => p.rpm === rpm)?.time;

            const baseStartTime = findTime(basePoints, startRpm);
            const baseEndTime = findTime(basePoints, endRpm);
            const baseTime = (baseStartTime !== undefined && baseEndTime !== undefined) ? baseEndTime - baseStartTime : null;

            const modifiedStartTime = findTime(modifiedPoints, startRpm);
            const modifiedEndTime = findTime(modifiedPoints, endRpm);
            const modifiedTime = (modifiedStartTime !== undefined && modifiedEndTime !== undefined) ? modifiedEndTime - modifiedStartTime : null;

            const delta = (baseTime !== null && modifiedTime !== null) ? modifiedTime - baseTime : null;
            const gainPercent = (baseTime !== null && delta !== null && baseTime > 0) ? (-delta / baseTime) * 100 : null;

            results.push({
                range: `${startRpm} -> ${endRpm}`,
                baseTime,
                modifiedTime,
                delta,
                gainPercent,
            });
        }

        return results;

    }, [runs]);

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-background">
                <strong className="text-foreground">Como usar:</strong> <br/>
                1. Faça um ensaio com o mapa de ignição atual (base), registando o tempo que leva para atingir cada RPM. <br/>
                2. Modifique o seu mapa de ignição (ex: avance 1 grau na zona do ensaio). <br/>
                3. Repita exatamente o mesmo ensaio com o mapa modificado. <br/>
                4. Compare os resultados. Um <span className="text-green-500 font-semibold">tempo menor</span> no ensaio modificado indica um ganho de binário. <br/>
                <strong className="text-destructive">Aviso:</strong> Esta ferramenta não deteta detonação (knock). Ajuste com cuidado e use combustível de alta octanagem.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RunInputTable 
                    title="Ensaio de Base"
                    description="Insira os dados (RPM vs. Tempo) do seu mapa de ignição atual."
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
                <AnalysisResultsTable results={analysisResults} />
             )}
        </div>
    );
}

