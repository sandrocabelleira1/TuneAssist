
'use client';

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MapData, AxisDataState } from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinePlot2DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData | null;
  xAxis: AxisDataState | null;
  yAxis: AxisDataState | null;
  xAxisLabel?: string;
  yAxisLabel?: string;
  selectedLineIndex: number | null;
  onLineSelect: (index: number) => void;
  onPointChange: (rowIndex: number, colIndex: number, newValue: number) => void;
}

const yAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? value.toFixed(1) : value;
};
  
const xAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? Math.round(value) : value;
};


const RPMSelector = ({ yAxis, selectedLineIndex, onLineSelect }: { 
    yAxis: AxisDataState,
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

const CustomDot = (props: any) => {
    const { cx, cy, payload, onMouseDown, onMouseUp } = props;
    
    if (!payload.isEditable) {
        return <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />;
    }

    return (
        <g>
            <circle
                cx={cx}
                cy={cy}
                r={8}
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                className="cursor-ns-resize"
            />
            <circle
                cx={cx}
                cy={cy}
                r={4}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
                className="cursor-ns-resize"
                onMouseDown={(e) => onMouseDown(e, props)}
                onMouseUp={(e) => onMouseUp(e, props)}
            />
        </g>
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

  const chartRef = useRef<any>(null);
  const [draggingDot, setDraggingDot] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((event: React.MouseEvent, dotProps: any) => {
    event.preventDefault();
    setIsDragging(true);
    setDraggingDot(dotProps);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging && draggingDot) {
        const { index: colIndex } = draggingDot;
        const rowIndex = selectedLineIndex;
        
        if (rowIndex !== null) {
          const finalValue = draggingDot.payload.y;
          onPointChange(rowIndex, colIndex, finalValue);
        }
    }
    setIsDragging(false);
    setDraggingDot(null);
  }, [isDragging, draggingDot, onPointChange, selectedLineIndex]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (isDragging && draggingDot && chartRef.current) {
        const chart = chartRef.current;
        const chartElement = chart.container;
        const chartCoords = chartElement.getBoundingClientRect();

        // Get SVG coordinates relative to the chart container
        const svgX = event.clientX - chartCoords.left - chart.props.margin.left;
        const svgY = event.clientY - chartCoords.top - chart.props.margin.top;
        
        // This is a simplified way to get the new value. Recharts internal scales are not easily accessible.
        // We find the y-value based on the mouse position.
        const yAxisMap = chart.yAxisMap[0];
        if (yAxisMap && yAxisMap.scale) {
            const newValue = yAxisMap.scale.invert(svgY);

            // Update the temporary dot position for visual feedback
            setDraggingDot((prev: any) => ({
                ...prev,
                cy: svgY + chart.props.margin.top,
                payload: { ...prev.payload, y: newValue }
            }));
        }
    }
  }, [isDragging, draggingDot]);
  
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);


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
                return { x: numX, y: numY };
            }
            return null;
        })
        .filter(Boolean) as { x: number; y: number }[];

    if (preparedData.length === 0) {
        return { chartData: null, lineDataKey: null, error: 'Não há pontos de dados válidos para exibir para a linha selecionada.' };
    }

    preparedData.sort((a, b) => a.x - b.x);

    const lineDataKey = `RPM ${yAxis.calculated[selectedLineIndex]}`;

    return { chartData: preparedData, lineDataKey, error: null };
  }, [mapData, xAxis, yAxis, selectedLineIndex]);

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
    <div className={cn('h-full w-full flex', className)} {...props}>
        <RPMSelector yAxis={yAxis} selectedLineIndex={selectedLineIndex} onLineSelect={onLineSelect} />
        <div className="flex-1 min-w-0">
            {selectedLineIndex === null ? (
                <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
                    <div>
                        <AlertCircle className="mx-auto h-12 w-12" />
                        <p className="mt-4 font-semibold">Nenhuma Linha Selecionada</p>
                        <p className="text-sm">Clique num valor de RPM à esquerda para visualizar os seus dados.</p>
                    </div>
                </div>
            ) : error || !chartData || !lineDataKey ? (
                <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
                    <div>
                        <AlertCircle className="mx-auto h-12 w-12" />
                        <p className="mt-4 font-semibold">Não é Possível Apresentar o Gráfico</p>
                        <p className="text-sm">{error || 'Ocorreu um erro inesperado.'}</p>
                    </div>
                </div>
            ) : (
                <ChartContainer config={{}} className="h-full w-full">
                    <LineChart ref={chartRef} data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        type="category"
                        dataKey="x"
                        ticks={xAxis.calculated.map(v => Number(v)).sort((a, b) => a - b)}
                        tickFormatter={xAxisTickFormatter}
                        label={{ value: xAxisLabel, position: 'insideBottom', offset: -15 }}
                        allowDuplicatedCategory={true}
                        interval="preserveStartEnd"
                    />
                    <YAxis
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
                        dot={<CustomDot onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} />}
                        activeDot={<CustomDot onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} />}
                        connectNulls
                    />
                    </LineChart>
                </ChartContainer>
            )}
        </div>
    </div>
  );
}

    