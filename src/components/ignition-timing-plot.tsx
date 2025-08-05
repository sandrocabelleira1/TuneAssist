
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
  ReferenceLine
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eraser } from 'lucide-react';
import type { IgnitionTimingPoint, IgnitionTimingRun } from '@/lib/types';

type RunType = 'base' | 'modified';
type AnalysisMode = 'time' | 'torque';

const RPM_AXIS = Array.from({ length: 16 }, (_, i) => (i + 1) * 1000); // 1000 to 16000 in 1000rpm steps

const createNewPoint = (rpm: number): IgnitionTimingPoint => ({
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
                            type="number"
                            step="0.1"
                            value={currentPoint.advance}
                            onChange={(e) => handleChange('advance', e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="time">Tempo Acumulado (s)</Label>
                        <Input
                            id="time"
                            type="number"
                            step="0.001"
                            placeholder="Usado se não houver torque"
                            value={currentPoint.time}
                            onChange={(e) => handleChange('time', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="torque">Torque (Nm)</Label>
                        <Input
                            id="torque"
                            type="number"
                            step="0.1"
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

interface IgnitionTimingPlotProps {
    runs: IgnitionTimingRun;
    onPointUpdate: (runType: RunType, point: IgnitionTimingPoint) => void;
    onClearRun: (runType: RunType) => void;
    analysisMode: AnalysisMode;
}

export default function IgnitionTimingPlot({ runs, onPointUpdate, onClearRun, analysisMode }: IgnitionTimingPlotProps) {
    const [editingPoint, setEditingPoint] = useState<{ runType: RunType; point: IgnitionTimingPoint } | null>(null);

    const chartData = useMemo(() => {
        const dataMap = new Map<number, any>();
        RPM_AXIS.forEach(rpm => dataMap.set(rpm, { rpm }));

        runs.base.forEach(p => {
            if(dataMap.has(p.rpm)) {
                dataMap.get(p.rpm).base_advance = p.advance ? parseFloat(p.advance) : null;
                dataMap.get(p.rpm).base_torque = p.torque ? parseFloat(p.torque) : null;
                dataMap.get(p.rpm).base_time = p.time ? parseFloat(p.time) : null;
            }
        });
        runs.modified.forEach(p => {
            if(dataMap.has(p.rpm)) {
                dataMap.get(p.rpm).modified_advance = p.advance ? parseFloat(p.advance) : null;
                dataMap.get(p.rpm).modified_torque = p.torque ? parseFloat(p.torque) : null;
                dataMap.get(p.rpm).modified_time = p.time ? parseFloat(p.time) : null;
            }
        });

        return Array.from(dataMap.values());
    }, [runs]);

    const handlePointClick = (dotProps: any, runType: RunType) => {
        const rpm = dotProps.payload.rpm;
        const existingPoint = runs[runType].find(p => p.rpm === rpm) || createNewPoint(rpm);
        setEditingPoint({ runType, point: existingPoint });
    };

    const handleSavePoint = (point: IgnitionTimingPoint) => {
        if (editingPoint) {
            onPointUpdate(editingPoint.runType, point);
        }
    };

    const CustomDot = ({ cx, cy, payload, dataKey, runType }: any) => {
        const hasData = payload[dataKey] !== undefined && payload[dataKey] !== null;
        return (
            <g 
                onClick={() => handlePointClick({ payload }, runType)} 
                className="cursor-pointer group"
            >
                <circle cx={cx} cy={cy} r={8} fill={hasData ? "currentColor" : "transparent"} className="opacity-30 group-hover:opacity-50 transition-opacity" />
                <circle cx={cx} cy={cy} r={4} fill={hasData ? "currentColor" : "hsl(var(--muted-foreground))"} stroke="hsl(var(--background))" strokeWidth={1.5} />
            </g>
        );
    };

    const renderChart = (title: string, dataKey: string, yAxisLabel: string, runType: RunType) => (
        <ChartContainer config={{}} className="min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rpm" />
                    <YAxis label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey={`${runType}_${dataKey}`}
                        name={runType === 'base' ? 'Base' : 'Modificado'}
                        stroke={runType === 'base' ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                        strokeWidth={2}
                        dot={<CustomDot runType={runType} dataKey={`${runType}_${dataKey}`} />}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gráfico de Análise de Ignição</CardTitle>
                <CardDescription>
                    Clique nos pontos do gráfico para adicionar ou editar os dados de cada ensaio.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="advance">
                    <div className="flex justify-between items-center mb-4">
                        <TabsList>
                            <TabsTrigger value="advance">Avanço</TabsTrigger>
                            <TabsTrigger value="time">Tempo</TabsTrigger>
                            <TabsTrigger value="torque">Torque</TabsTrigger>
                        </TabsList>
                         <div className="flex gap-2">
                             <Button variant="outline" size="sm" onClick={() => onClearRun('base')}>
                                <Eraser className="mr-2 h-4 w-4" /> Limpar Base
                             </Button>
                             <Button variant="outline" size="sm" onClick={() => onClearRun('modified')}>
                                <Eraser className="mr-2 h-4 w-4" /> Limpar Modificado
                             </Button>
                         </div>
                    </div>
                    
                    <TabsContent value="advance" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {renderChart('Avanço Ignição Base', 'advance', 'Avanço (°)', 'base')}
                        {renderChart('Avanço Ignição Modificado', 'advance', 'Avanço (°)', 'modified')}
                    </TabsContent>
                    <TabsContent value='time'>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {renderChart('Tempo Acumulado Base', 'time', 'Tempo (s)', 'base')}
                            {renderChart('Tempo Acumulado Modificado', 'time', 'Tempo (s)', 'modified')}
                        </div>
                    </TabsContent>
                    <TabsContent value='torque'>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {renderChart('Torque Base', 'torque', 'Torque (Nm)', 'base')}
                            {renderChart('Torque Modificado', 'torque', 'Torque (Nm)', 'modified')}
                        </div>
                    </TabsContent>
                </Tabs>
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
