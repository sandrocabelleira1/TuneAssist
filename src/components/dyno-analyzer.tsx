
'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PlusCircle, Trash2, Palette } from 'lucide-react';
import { type DynoRun, type DynoRunDataPoint } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(210, 40%, 96.1%)", "hsl(142.1 76.2% 36.3%)", "hsl(346.8 77.2% 49.8%)"];

interface DynoAnalyzerProps {
  runs: DynoRun[];
  onRunsChange: (runs: DynoRun[]) => void;
}

export default function DynoAnalyzer({ runs, onRunsChange }: DynoAnalyzerProps) {
  const { toast } = useToast();
  const [currentRunName, setCurrentRunName] = useState('');
  const [currentData, setCurrentData] = useState<Omit<DynoRunDataPoint, 'id'>[]>([]);
  const [newPoint, setNewPoint] = useState({ rpm: '', torque: '', power: '' });
  
  const handleAddPoint = () => {
    const rpm = parseFloat(newPoint.rpm);
    const torque = parseFloat(newPoint.torque);
    const power = parseFloat(newPoint.power);

    if (isNaN(rpm) || isNaN(torque) || isNaN(power)) {
      toast({ title: "Valores Inválidos", description: "RPM, Binário e Potência devem ser números.", variant: "destructive" });
      return;
    }
    
    if (currentData.some(p => p.rpm === rpm)) {
        toast({ title: "RPM Duplicado", description: "Já existe um ponto de dados para esta RPM.", variant: "destructive" });
        return;
    }

    setCurrentData(prev => [...prev, { rpm, torque, power }].sort((a,b) => a.rpm - b.rpm));
    setNewPoint({ rpm: '', torque: '', power: '' });
  };
  
  const handleRemovePoint = (rpm: number) => {
    setCurrentData(prev => prev.filter(p => p.rpm !== rpm));
  }

  const handleAddRun = () => {
    const name = currentRunName;
    const data = currentData;

    if (!name) {
      toast({ title: "Nome da Corrida em Falta", description: "Por favor, dê um nome à sua corrida.", variant: "destructive" });
      return;
    }
    if (data.length < 2) {
      toast({ title: "Dados Insuficientes", description: "Adicione pelo menos dois pontos de dados para a corrida.", variant: "destructive" });
      return;
    }
    
    const newRun: DynoRun = {
      id: `run_${Date.now()}`,
      name: name,
      data: data.map(p => ({...p, id: `point_${p.rpm}`})),
      color: COLORS[runs.length % COLORS.length],
    };

    onRunsChange([...runs, newRun]);
    
    setCurrentRunName('');
    setCurrentData([]);

    toast({ title: "Corrida Adicionada", description: `"${newRun.name}" foi adicionada para comparação.` });
  };
  
  const handleRemoveRun = (runId: string) => {
    onRunsChange(runs.filter(r => r.id !== runId));
  }

  const chartData = React.useMemo(() => {
    const allRpms = new Set<number>();
    runs.forEach(run => run.data.forEach(p => allRpms.add(p.rpm)));
    const sortedRpms = Array.from(allRpms).sort((a,b) => a-b);
    
    return sortedRpms.map(rpm => {
        const dataPoint: any = { rpm };
        runs.forEach(run => {
            const point = run.data.find(p => p.rpm === rpm);
            dataPoint[`${run.id}_torque`] = point?.torque ?? null;
            dataPoint[`${run.id}_power`] = point?.power ?? null;
        });
        return dataPoint;
    });

  }, [runs]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Adicionar Corrida de Dinamómetro</CardTitle>
            <CardDescription>Insira os dados manualmente para cada corrida.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Nome da Corrida (ex: Base, Avanço +2°)"
              value={currentRunName}
              onChange={(e) => setCurrentRunName(e.target.value)}
            />
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-semibold">Novo Ponto</h4>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="RPM" value={newPoint.rpm} onChange={e => setNewPoint(p => ({...p, rpm: e.target.value}))} />
                <Input placeholder="Binário" value={newPoint.torque} onChange={e => setNewPoint(p => ({...p, torque: e.target.value}))} />
                <Input placeholder="Potência" value={newPoint.power} onChange={e => setNewPoint(p => ({...p, power: e.target.value}))} />
              </div>
              <Button onClick={handleAddPoint} size="sm" className="w-full">
                <PlusCircle className="mr-2" /> Adicionar Ponto
              </Button>
            </div>
            
            {currentData.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Pontos da Corrida Atual</h4>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHead>RPM</TableHead>
                                <TableHead>Binário</TableHead>
                                <TableHead>Potência</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {currentData.map(p => (
                                <TableRow key={p.rpm}>
                                    <TableCell>{p.rpm}</TableCell>
                                    <TableCell>{p.torque}</TableCell>
                                    <TableCell>{p.power}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemovePoint(p.rpm)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
              </div>
            )}
             <Button onClick={handleAddRun} className="w-full" disabled={!currentRunName || currentData.length < 2}>Adicionar Corrida para Comparação</Button>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Gráfico de Comparação</CardTitle>
            <CardDescription>Curvas de Binário e Potência das corridas adicionadas.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
             {runs.length > 0 ? (
                <ChartContainer config={{}} className="h-full w-full">
                    <ResponsiveContainer>
                        <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="rpm" type="number" domain={['dataMin', 'dataMax']} name="RPM" />
                        <YAxis yAxisId="left" name="Binário" stroke="hsl(var(--primary))" />
                        <YAxis yAxisId="right" orientation="right" name="Potência" stroke="hsl(var(--destructive))"/>
                        <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Legend />
                        {runs.map(run => (
                            <React.Fragment key={run.id}>
                                <Line yAxisId="left" type="monotone" dataKey={`${run.id}_torque`} name={`Binário - ${run.name}`} stroke={run.color} strokeDasharray="5 5" />
                                <Line yAxisId="right" type="monotone" dataKey={`${run.id}_power`} name={`Potência - ${run.name}`} stroke={run.color} />
                            </React.Fragment>
                        ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Adicione uma corrida para ver o gráfico.</p>
                </div>
            )}
          </CardContent>
        </Card>
        
        {runs.length > 0 && (
            <Card>
                <CardHeader><CardTitle>Corridas Adicionadas</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {runs.map(run => (
                            <div key={run.id} className="flex items-center justify-between p-2 border rounded-md">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 rounded-full" style={{backgroundColor: run.color}}/>
                                    <span>{run.name}</span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveRun(run.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
