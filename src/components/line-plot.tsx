
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MapData, AxisData, PlotOrientation, ChartPoint } from '@/lib/types';
import { AlertCircle, Plus, Minus, ArrowRightLeft, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface LinePlot2DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData | null;
  xAxis: AxisData | null;
  yAxis: AxisData | null;
  mapName?: string;
  selectedLineIndex: number | null;
  onLineSelect: (index: number) => void;
  onPointChange: (rowIndex: number, colIndex: number, newValue: number) => void;
  orientation: PlotOrientation;
  togglePlotOrientation: () => void;
}

// State for the editing modal
type EditingPoint = {
  rowIndex: number;
  colIndex: number;
  currentValue: number;
  xValue: number;
} | null;


const tickFormatter = (value: any) => {
    if (typeof value === 'string') return value;
    return typeof value === 'number' ? value.toFixed(1) : value;
};


const AxisSelector = ({ axis, selectedLineIndex, onLineSelect, className }: { 
    axis: AxisData,
    selectedLineIndex: number | null,
    onLineSelect: (index: number) => void,
    className?: string,
}) => {
    return (
        <ScrollArea className={cn("h-full w-48 flex-shrink-0 border-r pr-2", className)}>
            <div className="flex flex-col gap-1 py-1">
                <h3 className="font-semibold text-sm px-3 py-1 text-muted-foreground">{axis.label}</h3>
                {axis.calculated.map((val, index) => (
                    <Button
                        key={`axis-select-${index}`}
                        variant={selectedLineIndex === index ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onLineSelect(index)}
                    >
                        {tickFormatter(val)}
                    </Button>
                ))}
            </div>
        </ScrollArea>
    );
};

export default function LinePlot2D({
  mapData,
  xAxis,
  yAxis,
  mapName = 'Valores',
  className,
  selectedLineIndex,
  onLineSelect,
  onPointChange,
  orientation,
  togglePlotOrientation,
  ...props
}: LinePlot2DProps) {

  const [currentChartData, setCurrentChartData] = useState<ChartPoint[] | null>(null);
  const [editingPoint, setEditingPoint] = useState<EditingPoint | null>(null);

  const { chartData, lineDataKey, error, chartXAxis, chartXAxisLabel } = useMemo(() => {
    if (
      !mapData || !xAxis?.calculated || !yAxis?.calculated ||
      selectedLineIndex === null
    ) {
      return { chartData: null, lineDataKey: null, error: 'Dados em falta.', chartXAxis: null, chartXAxisLabel: '' };
    }

    const isYvsX = orientation === 'y-vs-x';
    const selectorAxis = isYvsX ? yAxis : xAxis;
    const graphAxis = isYvsX ? xAxis : yAxis;
    
    if(selectedLineIndex >= selectorAxis.calculated.length) {
        // onLineSelect(0); // Reset selection if out of bounds
        return { chartData: null, lineDataKey: null, error: 'Índice da linha selecionada fora dos limites.', chartXAxis: null, chartXAxisLabel: '' };
    }

    const lineData = isYvsX
      ? mapData[selectedLineIndex]
      : mapData.map(row => row[selectedLineIndex]);

    if (!lineData) {
      return { chartData: null, lineDataKey: null, error: 'Linha de dados selecionada é inválida.', chartXAxis: null, chartXAxisLabel: '' };
    }

    const preparedData: ChartPoint[] = graphAxis.calculated
        .map((xVal, i) => {
            const yVal = lineData[i];
            const numX = Number(xVal);
            const numY = Number(yVal);
            if (isFinite(numX) && yVal !== null && yVal !== undefined && isFinite(numY)) {
                return { x: numX, y: numY, originalIndex: i };
            }
            return { x: numX, y: null, originalIndex: i };
        })
        .filter(d => d && isFinite(d.x)) as ChartPoint[];


    if (preparedData.length === 0) {
        return { chartData: null, lineDataKey: null, error: 'Não há pontos de dados válidos para exibir para a linha selecionada.', chartXAxis: null, chartXAxisLabel: '' };
    }
    
    const selectedValue = selectorAxis.calculated[selectedLineIndex];
    const lineDataKey = `${selectorAxis.label} ${tickFormatter(selectedValue)}`;

    return { 
        chartData: preparedData, 
        lineDataKey, 
        error: null,
        chartXAxis: graphAxis,
        chartXAxisLabel: graphAxis.label,
    };
  }, [mapData, xAxis, yAxis, selectedLineIndex, orientation]);
  
  useEffect(() => {
    setCurrentChartData(chartData);
  }, [chartData]);


  const handlePointClick = (dotProps: any) => {
    if (selectedLineIndex === null || !xAxis || !yAxis || !dotProps.payload.y) return;
    const { payload } = dotProps;

    const isYvsX = orientation === 'y-vs-x';
    
    // The clicked point's originalIndex refers to its position in the *graph's* axis data.
    // The selectedLineIndex refers to its position in the *selector's* axis data.
    // We need to find the original, unsorted row and column index in the map data.
    const graphAxis = isYvsX ? xAxis : yAxis;
    const selectorAxis = isYvsX ? yAxis : xAxis;

    const graphOriginalIndex = graphAxis.originalIndices[payload.originalIndex];
    const selectorOriginalIndex = selectorAxis.originalIndices[selectedLineIndex];
    
    const rowIndex = isYvsX ? selectorOriginalIndex : graphOriginalIndex;
    const colIndex = isYvsX ? graphOriginalIndex : selectorOriginalIndex;
    
    // Now we need the row/col index in the *sorted* mapData for the onPointChange callback
    const sortedRowIndex = isYvsX ? selectedLineIndex : payload.originalIndex;
    const sortedColIndex = isYvsX ? payload.originalIndex : selectedLineIndex;

    setEditingPoint({
      rowIndex: sortedRowIndex,
      colIndex: sortedColIndex,
      currentValue: payload.y,
      xValue: payload.x
    });
  };

  const handleSavePointChange = (newValue: number) => {
    if (editingPoint) {
      onPointChange(editingPoint.rowIndex, editingPoint.colIndex, newValue);
      setEditingPoint(null);
    }
  };

  const CustomDot = (props: any) => {
      const { cx, cy, payload } = props;
      if (payload.y === null || payload.y === undefined) return null;
      return (
          <g onClick={() => handlePointClick(props)} className="cursor-pointer">
              <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
              />
              <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
              />
          </g>
      );
  };


  if (!mapData || !xAxis || !yAxis) {
     return (
        <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
            <div>
            <AlertCircle className="mx-auto h-12 w-12" />
            <p className="mt-4 font-semibold">Dados Insuficientes para o Gráfico</p>
            <p className="text-sm">Carregue um mapa para começar.</p>
            </div>
        </div>
    );
  }

  const selectorAxis = orientation === 'y-vs-x' ? yAxis : xAxis;

  return (
    <div className={cn('h-full w-full bg-card rounded-lg border p-4 flex flex-col', className)} {...props}>
        <div className="flex items-center justify-between self-start mb-2 w-full">
            <div className="flex items-center gap-2">
                <TooltipProvider>
                    <UiTooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={togglePlotOrientation}>
                                <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Inverter Eixos do Gráfico</p>
                        </TooltipContent>
                    </UiTooltip>
                </TooltipProvider>
            </div>
        </div>
        <div className="flex flex-1 min-h-0">
            <AxisSelector axis={selectorAxis} selectedLineIndex={selectedLineIndex} onLineSelect={onLineSelect} />
            <div className="flex-1 min-w-0">
                {selectedLineIndex === null ? (
                    <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
                        <div>
                            <AlertCircle className="mx-auto h-12 w-12" />
                            <p className="mt-4 font-semibold">Nenhuma Linha Selecionada</p>
                            <p className="text-sm">Clique num valor de {selectorAxis.label} à esquerda para visualizar os seus dados.</p>
                        </div>
                    </div>
                ) : error || !currentChartData || !lineDataKey ? (
                    <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
                        <div>
                            <AlertCircle className="mx-auto h-12 w-12" />
                            <p className="mt-4 font-semibold">Não é Possível Apresentar o Gráfico</p>
                            <p className="text-sm">{error || 'Ocorreu um erro inesperado.'}</p>
                        </div>
                    </div>
                ) : (
                    <ChartContainer config={{}} className="h-full w-full">
                        <ResponsiveContainer>
                          <LineChart 
                              data={currentChartData} 
                              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                          >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                              type="number"
                              dataKey="x"
                              domain={['dataMin', 'dataMax']}
                              tickFormatter={tickFormatter}
                              label={{ value: chartXAxisLabel, position: 'insideBottom', offset: -15 }}
                              allowDuplicatedCategory={false}
                          />
                          <YAxis
                              type="number"
                              domain={['auto', 'auto']}
                              tickFormatter={tickFormatter}
                              label={{ value: mapName, angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                          <Legend verticalAlign="top" />
                          <Line
                              dataKey="y"
                              name={lineDataKey}
                              type="monotone"
                              stroke="hsl(var(--primary))"
                              strokeWidth={15}
                              dot={<CustomDot />}
                              activeDot={false}
                              isAnimationActive={true}
                              connectNulls
                          />
                          </LineChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                )}
            </div>
        </div>
        {editingPoint && (
            <EditPointModal 
                point={editingPoint}
                onSave={handleSavePointChange}
                onClose={() => setEditingPoint(null)}
                yAxisLabel={mapName}
                xAxisLabel={chartXAxisLabel ?? "Ponto"}
            />
        )}
    </div>
  );
}

function EditPointModal({ point, onSave, onClose, yAxisLabel, xAxisLabel }: {
    point: EditingPoint;
    onSave: (newValue: number) => void;
    onClose: () => void;
    yAxisLabel: string;
    xAxisLabel: string;
}) {
    const [percentage, setPercentage] = useState('');

    const handleConfirm = (isSubtraction: boolean = false) => {
        const numPercentage = parseFloat(percentage);
        if (point && !isNaN(numPercentage)) {
            const multiplier = isSubtraction ? -1 : 1;
            const finalPercentage = numPercentage * multiplier;
            const newValue = point.currentValue * (1 + finalPercentage / 100);
            onSave(newValue);
        } else {
            console.error("Valor percentual inválido");
        }
    };
    
    if (!point) return null;

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Ponto do Gráfico</DialogTitle>
                    <DialogDescription>
                        Modifique o valor de {yAxisLabel} para o ponto em {xAxisLabel} = {tickFormatter(point.xValue)} (Valor Atual: {point.currentValue.toFixed(2)}).
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="pointValue">Alteração Percentual (%)</Label>
                    <Input 
                        id="pointValue"
                        type="number"
                        placeholder="Ex: 10 ou -5"
                        value={percentage}
                        onChange={(e) => setPercentage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" onClick={() => handleConfirm(true)}><Minus className="mr-2 h-4 w-4" /> Subtrair %</Button>
                    <Button onClick={() => handleConfirm(false)}><Plus className="mr-2 h-4 w-4" /> Adicionar %</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
