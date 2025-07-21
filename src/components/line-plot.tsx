
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
  const [isDragging, setIsDragging] = useState(false);
  const [activeDot, setActiveDot] = useState<any>(null);
  const [currentChartData, setCurrentChartData] = useState<any[] | null>(null);

  const { initialChartData, lineDataKey, error } = useMemo(() => {
    if (
      !mapData || !xAxis?.calculated || !yAxis?.calculated ||
      selectedLineIndex === null ||
      selectedLineIndex >= mapData.length
    ) {
      return { initialChartData: null, lineDataKey: null, error: null };
    }

    const lineData = mapData[selectedLineIndex];
    if (!lineData) {
      return { initialChartData: null, lineDataKey: null, error: 'Linha de dados selecionada é inválida.' };
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
        return { initialChartData: null, lineDataKey: null, error: 'Não há pontos de dados válidos para exibir para a linha selecionada.' };
    }

    preparedData.sort((a, b) => a.x - b.x);

    const lineDataKey = `RPM ${yAxisTickFormatter(yAxis.calculated[selectedLineIndex])}`;

    return { initialChartData: preparedData, lineDataKey, error: null };
  }, [mapData, xAxis, yAxis, selectedLineIndex]);
  
  useEffect(() => {
    setCurrentChartData(initialChartData);
  }, [initialChartData]);


  const handleMouseDown = useCallback((event: React.MouseEvent, dotProps: any) => {
    event.preventDefault();
    setIsDragging(true);
    setActiveDot(dotProps);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging && activeDot && selectedLineIndex !== null && currentChartData) {
        // Find the dot in the temporary data to get its final value
        const finalDot = currentChartData.find(d => d.originalIndex === activeDot.payload.originalIndex);
        if (finalDot) {
            onPointChange(selectedLineIndex, finalDot.originalIndex, finalDot.y);
        }
    }
    setIsDragging(false);
    setActiveDot(null);
  }, [isDragging, activeDot, onPointChange, selectedLineIndex, currentChartData]);

  const handleMouseMove = useCallback((e: any) => {
      if (isDragging && activeDot && chartRef.current) {
        // e.chartY is provided by recharts onMouseMove event on the chart
        if (e.chartY === undefined) return;

        // Access the internal chart instance to get the scale function
        const chart = chartRef.current.chart;
        if (!chart || !chart.props.margin) return;
        const mainYAxis = chart.yAxisMap?.[0];

        if (!mainYAxis?.scale?.invert) return;
        
        // Convert the mouse y-coordinate to a value on the Y-axis
        const newYValue = mainYAxis.scale.invert(e.chartY);
        
        setCurrentChartData(prevData => {
            if (!prevData) return null;
            return prevData.map(d => {
                if (d.originalIndex === activeDot.payload.originalIndex) {
                    return { ...d, y: newYValue };
                }
                return d;
            });
        });
      }
  }, [isDragging, activeDot]);
  
    const CustomDot = (props: any) => {
        const { cx, cy } = props;

        // The onMouseDown here is the native DOM event handler for the <g> element
        return (
            <g onMouseDown={(e) => handleMouseDown(e, props)}>
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
                        ref={chartRef} 
                        data={currentChartData} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        type="category"
                        dataKey="x"
                        tickFormatter={xAxisTickFormatter}
                        label={{ value: xAxisLabel, position: 'insideBottom', offset: -15 }}
                        allowDuplicatedCategory={true}
                        interval="preserveStartEnd"
                        ticks={xAxis.calculated.map(v => Number(v)).filter(isFinite).sort((a,b) => a-b)}
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
                        isAnimationActive={false}
                        connectNulls
                    />
                    </LineChart>
                </ChartContainer>
            )}
        </div>
    </div>
  );
}
