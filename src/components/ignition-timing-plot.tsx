'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';
import type { IgnitionTimingPoint, IgnitionTimingRun } from '@/lib/types';
import { cn } from '@/lib/utils';

type RunType = 'base' | 'modified';
type AnalysisMode = 'time' | 'torque';


const createNewPoint = (rpm: string): IgnitionTimingPoint => ({
    id: `point_${rpm}_${Date.now()}`,
    rpm,
    time: '',
    torque: '',
    advance: '',
});

interface EditPointDialogProps {
    point: IgnitionTimingPoint;
    onSave: (point: IgnitionTimingPoint) => void;
    onClose: () => void;
}

function EditPointDialog({ point, onSave, onClose }: EditPointDialogProps) {
    const [currentPoint, setCurrentPoint] = useState(point);

    const handleSave = () => {
        onSave(currentPoint);
        onClose();
    };

    const handleChange = (field: 'advance' | 'time' | 'torque', value: string) => {
        setCurrentPoint(prev => ({ ...prev, [field]: value }));
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Ponto de Ensaio</DialogTitle>
                    <DialogDescription>
                        Insira os dados recolhidos para {point.rpm} RPM. Deixe em branco os campos não utilizados.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="advance">Avanço Ignição (°)</Label>
                        <Input
                            id="advance"
                            type="text"
                            value={currentPoint.advance}
                            onChange={(e) => handleChange('advance', e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="time">Tempo Acumulado (s)</Label>
                        <Input
                            id="time"
                            type="text"
                            placeholder="Usado se não houver torque"
                            value={currentPoint.time}
                            onChange={(e) => handleChange('time', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="torque">Torque (Nm)</Label>
                        <Input
                            id="torque"
                            type="text"
                            placeholder="Prioritário se preenchido"
                            value={currentPoint.torque}
                            onChange={(e) => handleChange('torque', e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave}>Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    analysisMode: AnalysisMode;
}


const CustomTooltipContent = ({ active, payload, label, analysisMode }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const performanceLabel = analysisMode === 'torque' ? 'Torque' : 'Tempo';

        return (
            <div className="p-2 bg-background border border-border rounded-lg shadow-lg text-xs">
                <p className="font-bold mb-2">RPM: {label}</p>
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th className="pr-2">Métrica</th>
                            <th className="pr-2 text-center">Base</th>
                            <th className="text-center">Modificado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{performanceLabel}</td>
                            <td className="text-center text-primary">{data.base_torque?.toFixed(2) ?? data.base_time?.toFixed(3) ?? '-'}</td>
                            <td className="text-center text-destructive">{data.modified_torque?.toFixed(2) ?? data.modified_time?.toFixed(3) ?? '-'}</td>
                        </tr>
                        <tr>
                            <td>Avanço</td>
                            <td className="text-center text-green-500">{data.base_advance?.toFixed(2) ?? '-'}</td>
                            <td className="text-center text-yellow-500">{data.modified_advance?.toFixed(2) ?? '-'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    return null;
};


interface IgnitionTimingPlotProps {
    runs: IgnitionTimingRun;
    onPointUpdate: (runType: RunType, point: IgnitionTimingPoint) => void;
    onClearRun: (runType: RunType) => void;
    analysisMode: AnalysisMode;
}

export default function IgnitionTimingPlot({ runs, onPointUpdate, onClearRun, analysisMode }: IgnitionTimingPlotProps) {
    const [editingPoint, setEditingPoint] = useState<{ runType: RunType; point: IgnitionTimingPoint } | null>(null);
    const performanceDataKey = analysisMode === 'torque' ? 'torque' : 'time';
    const performanceYAxisLabel = analysisMode === 'torque' ? 'Torque (Nm)' : 'Tempo (s)';


    const { chartData, rpmTicks } = useMemo(() => {
        const allRpms = new Set<number>();
        runs.base.forEach(p => {
             const rpm = parseFloat(p.rpm);
             if(!isNaN(rpm)) allRpms.add(rpm);
        });
        runs.modified.forEach(p => {
            const rpm = parseFloat(p.rpm);
            if(!isNaN(rpm)) allRpms.add(rpm);
        });

        if (allRpms.size === 0) {
            // Add default axis if no data exists, for manual entry
            for (let i = 1; i <= 8; i++) allRpms.add(i * 1000);
        }

        const sortedRpmTicks = Array.from(allRpms).filter(r => !isNaN(r)).sort((a, b) => a - b);
        
        const dataMap = new Map<number, any>();
        sortedRpmTicks.forEach(rpm => dataMap.set(rpm, { rpm }));

        const addRunDataToMap = (run: IgnitionTimingPoint[], prefix: string) => {
            run.forEach(p => {
                const rpmValue = parseFloat(p.rpm);
                if(isNaN(rpmValue)) return;
                
                const pointData = dataMap.get(rpmValue);
                if (pointData) {
                    pointData[`${prefix}_advance`] = p.advance !== '' && !isNaN(parseFloat(p.advance)) ? parseFloat(p.advance) : null;
                    pointData[`${prefix}_torque`] = p.torque !== '' && !isNaN(parseFloat(p.torque)) ? parseFloat(p.torque) : null;
                    pointData[`${prefix}_time`] = p.time !== '' && !isNaN(parseFloat(p.time)) ? parseFloat(p.time) : null;
                }
            });
        };
        
        addRunDataToMap(runs.base, 'base');
        addRunDataToMap(runs.modified, 'modified');

        return { chartData: Array.from(dataMap.values()), rpmTicks: sortedRpmTicks };
    }, [runs]);

    const handlePointClick = (dotProps: any, runType: RunType) => {
        if (!dotProps.payload) return;
        const rpm = dotProps.payload.rpm.toString();
        const existingPoint = runs[runType].find(p => p.rpm === rpm) || createNewPoint(rpm);
        setEditingPoint({ runType, point: existingPoint });
    };

    const handleSavePoint = (point: IgnitionTimingPoint) => {
        if (editingPoint) {
            onPointUpdate(editingPoint.runType, point);
        }
    };

    const CustomDot = ({ cx, cy, payload, dataKey, runType }: any) => {
        const hasData = payload[dataKey] !== undefined && payload[dataKey] !== null && payload[dataKey] !== '';
        return (
            <g 
                onClick={() => handlePointClick({ payload }, runType)} 
                className="cursor-pointer group"
            >
                <circle cx={cx} cy={cy} r={8} fill="currentColor" className="opacity-30 group-hover:opacity-50 transition-opacity" />
                <circle cx={cx} cy={cy} r={4} fill={hasData ? "currentColor" : "hsl(var(--muted-foreground))"} stroke="hsl(var(--background))" strokeWidth={1.5} />
            </g>
        );
    };

    return (
        <Card>
            <CardHeader className="space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Gráfico de Análise de Ignição</CardTitle>
                        <CardDescription>
                            Clique nos pontos do gráfico para adicionar ou editar os dados de cada ensaio.
                        </CardDescription>
                    </div>
                     <div className="flex gap-2">
                         <Button variant="outline" size="sm" onClick={() => onClearRun('base')}>
                            <Eraser className="mr-2 h-4 w-4" /> Limpar Base
                         </Button>
                         <Button variant="outline" size="sm" onClick={() => onClearRun('modified')}>
                            <Eraser className="mr-2 h-4 w-4" /> Limpar Modificado
                         </Button>
                     </div>
                </div>
            </CardHeader>
            <CardContent>
                 <ChartContainer config={{}} className="min-h-[300px] w-full">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="rpm" type="number" ticks={rpmTicks} domain={['dataMin', 'dataMax']} />
                            <YAxis 
                                yAxisId="left" 
                                label={{ value: performanceYAxisLabel, angle: -90, position: 'insideLeft' }} 
                                domain={['auto', 'auto']} 
                                allowDecimals={false} 
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                label={{ value: 'Avanço (°)', angle: 90, position: 'insideRight' }} 
                                domain={['auto', 'auto']} 
                                allowDecimals={false}
                            />
                            <Tooltip content={<CustomTooltipContent analysisMode={analysisMode} />} />
                            <Legend />
                            
                            {/* Performance Lines (Torque/Time) */}
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey={`base_${performanceDataKey}`}
                                name={`Base ${performanceYAxisLabel}`}
                                stroke={'hsl(var(--primary))'}
                                strokeWidth={2}
                                dot={<CustomDot runType={'base'} dataKey={`base_${performanceDataKey}`} />}
                                connectNulls
                            />
                             <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey={`modified_${performanceDataKey}`}
                                name={`Mod. ${performanceYAxisLabel}`}
                                stroke={'hsl(var(--destructive))'}
                                strokeWidth={2}
                                dot={<CustomDot runType={'modified'} dataKey={`modified_${performanceDataKey}`} />}
                                connectNulls
                            />

                             {/* Advance Lines */}
                             <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="base_advance"
                                name="Avanço Base"
                                stroke={'hsl(142.1 70.6% 45.3%)'} // Green
                                strokeDasharray="5 5"
                                strokeOpacity={0.9}
                                strokeWidth={2}
                                dot={<CustomDot runType={'base'} dataKey="base_advance" />}
                                connectNulls
                            />
                             <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="modified_advance"
                                name="Avanço Modificado"
                                stroke={'hsl(38.9 98.4% 50.4%)'} // Yellow/Orange
                                strokeDasharray="5 5"
                                strokeOpacity={0.9}
                                strokeWidth={2}
                                dot={<CustomDot runType={'modified'} dataKey="modified_advance" />}
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartContainer>
                {editingPoint && (
                    <EditPointDialog
                        point={editingPoint.point}
                        onSave={handleSavePoint}
                        onClose={() => setEditingPoint(null)}
                    />
                )}
            </CardContent>
        </Card>
    );
}
