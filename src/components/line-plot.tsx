
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
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MapData, AxisData } from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


interface LinePlot2DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData | null;
  xAxis: AxisData | null;
  yAxis: AxisData | null;
  xAxisLabel?: string;
  yAxisLabel?: string;
  selectedLineIndex: number | null;
  onLineSelect: (index: number) => void;
  onPointChange: (rowIndex: number, colIndex: number, newValue: number) => void;
}

// State for the editing modal
type EditingPoint = {
  rowIndex: number;
  colIndex: number;
  currentValue: number;
  xValue: number;
} | null;


const yAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? value.toFixed(1) : value;
};
  
const xAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? Math.round(value) : value;
};


const RPMSelector = ({ yAxis, selectedLineIndex, onLineSelect }: { 
    yAxis: AxisData,
    selectedLineIndex: number | null,
    onLineSelect: (index: number) => void 
}) => {
    return (
        <ScrollArea className="h-full w-48 flex-shrink-0 border-r pr-2">
            <div className="flex flex-col gap-1 py-1">
                <h3 className="font-semibold text-sm px-3 py-1 text-muted-foreground">{yAxis.label}</h3>
                {yAxis.calculated.map((rpm, index) => (
                    <Button
                        key={`rpm-select-${index}`}
                        variant={selectedLineIndex === index ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onLineSelect(index)}
                    >
                        {yAxisTickFormatter(rpm)}
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
  xAxisLabel = 'Eixo X',
  yAxisLabel = 'Valores',
  className,
  selectedLineIndex,
  onLineSelect,
  onPointChange,
  ...props
}: LinePlot2DProps) {

  const [currentChartData, setCurrentChartData] = useState<any[] | null>(null);
  const [editingPoint, setEditingPoint] = useState<EditingPoint>(null);

  const { chartData, lineDataKey, error } = useMemo(() => {
    if (
      !mapData || !xAxis?.calculated || !yAxis?.calculated ||
      selectedLineIndex === null ||
      selectedLineIndex >= mapData.length
    ) {
      return { chartData: null, lineDataKey: null, error: null };
    }

    const lineData = mapData[selectedLineIndex];
    if (!lineData) {
      return { chartData: null, lineDataKey: null, error: 'Linha de dados selecionada é inválida.' };
    }

    const preparedData = xAxis.calculated
        .map((xVal, i) => {
            const yVal = lineData[i];
            const numX = Number(xVal);
            const numY = Number(yVal);
            if (isFinite(numX) && isFinite(numY)) {
                return { x: numX, y: numY, originalIndex: i };
            }
            return null;
        })
        .filter(Boolean) as { x: number; y: number, originalIndex: number }[];

    if (preparedData.length === 0) {
        return { chartData: null, lineDataKey: null, error: 'Não há pontos de dados válidos para exibir para a linha selecionada.' };
    }

    // Data is already sorted by the backend
    // preparedData.sort((a, b) => a.x - b.x);

    const lineDataKey = `${yAxis.label} ${yAxisTickFormatter(yAxis.calculated[selectedLineIndex])}`;

    return { chartData: preparedData, lineDataKey, error: null };
  }, [mapData, xAxis, yAxis, selectedLineIndex]);
  
  useEffect(() => {
    setCurrentChartData(chartData);
  }, [chartData]);


  const handlePointClick = (dotProps: any) => {
    if (selectedLineIndex === null) return;
    const { payload } = dotProps;
    setEditingPoint({
      rowIndex: selectedLineIndex,
      colIndex: payload.originalIndex,
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
      const { cx, cy } = props;
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

  return (
    <div className={cn('h-full w-full flex bg-card rounded-lg border p-4', className)} {...props}>
        <RPMSelector yAxis={yAxis} selectedLineIndex={selectedLineIndex} onLineSelect={onLineSelect} />
        <div className="flex-1 min-w-0">
            {selectedLineIndex === null ? (
                <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
                    <div>
                        <AlertCircle className="mx-auto h-12 w-12" />
                        <p className="mt-4 font-semibold">Nenhuma Linha Selecionada</p>
                        <p className="text-sm">Clique num valor de {yAxis.label} à esquerda para visualizar os seus dados.</p>
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
                    <LineChart 
                        data={currentChartData} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        type="number"
                        dataKey="x"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={xAxisTickFormatter}
                        label={{ value: xAxisLabel, position: 'insideBottom', offset: -15 }}
                        allowDuplicatedCategory={false}
                    />
                    <YAxis
                        type="number"
                        domain={['auto', 'auto']}
                        tickFormatter={yAxisTickFormatter}
                        label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Legend verticalAlign="top" />
                    <Line
                        dataKey="y"
                        name={lineDataKey}
                        type="monotone"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={<CustomDot />}
                        activeDot={false}
                        isAnimationActive={true}
                        connectNulls
                    />
                    </LineChart>
                </ChartContainer>
            )}
        </div>
        {editingPoint && (
            <EditPointModal 
                point={editingPoint}
                onSave={handleSavePointChange}
                onClose={() => setEditingPoint(null)}
                yAxisLabel={yAxisLabel ?? "Valor"}
                xAxisLabel={xAxisLabel ?? "Ponto"}
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
    const [newValue, setNewValue] = useState(String(point?.currentValue ?? ''));

    const handleConfirm = () => {
        const numValue = parseFloat(newValue);
        if (!isNaN(numValue)) {
            onSave(numValue);
        } else {
            console.error("Valor inválido");
        }
    };
    
    if (!point) return null;

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Ponto do Gráfico</DialogTitle>
                    <DialogDescription>
                        Modifique o valor para o ponto em {xAxisLabel} = {xAxisTickFormatter(point.xValue)}.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="pointValue">{yAxisLabel}</Label>
                    <Input 
                        id="pointValue"
                        type="number"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Guardar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
