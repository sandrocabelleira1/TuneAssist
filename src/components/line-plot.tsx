
'use client';

import React, { useMemo } from 'react';
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
import type { MapData } from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinePlot2DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData | null;
  xAxis: (string | number)[] | null;
  yAxis: (string | number)[] | null;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#00C49F', 
  '#FFBB28', '#FF8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'
];

export default function LinePlot2D({
  mapData,
  xAxis,
  yAxis,
  xAxisLabel = 'Eixo X',
  yAxisLabel = 'Eixo Y',
  className,
  ...props
}: LinePlot2DProps) {

  const { chartData, series, error } = useMemo(() => {
    if (
      !mapData || !xAxis || !yAxis ||
      mapData.length !== yAxis.length ||
      mapData.some(row => row.length !== xAxis.length)
    ) {
      return { error: 'Os dados do mapa são inconsistentes ou estão em falta.' };
    }

    const numericXAxis = xAxis.map(Number).filter(v => isFinite(v));
    if (numericXAxis.length !== xAxis.length) {
        return { error: 'O eixo X contém valores não numéricos.'}
    }

    const preparedData = xAxis.map((x, i) => {
        const dataPoint: { [key: string]: number | string } = { x: Number(x) };
        if (!isFinite(dataPoint.x as number)) return null;

        yAxis.forEach((y, j) => {
            const yValue = mapData[j][i];
            if (yValue !== null && isFinite(yValue)) {
                dataPoint[`y-${j}`] = yValue;
            }
        });
        return dataPoint;
    }).filter(Boolean) as { [key: string]: number }[];

    if (preparedData.length === 0) {
        return { error: 'Não há pontos de dados válidos para exibir.'}
    }

    preparedData.sort((a, b) => a.x - b.x);

    const series = yAxis.map((y, index) => ({
      name: `${yAxisLabel}: ${typeof y === 'number' ? y.toFixed(1) : y}`,
      dataKey: `y-${index}`,
      stroke: COLORS[index % COLORS.length],
    }));

    return { chartData: preparedData, series, error: null };
  }, [mapData, xAxis, yAxis, yAxisLabel]);

  if (error || !chartData || !series) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
        <div>
          <AlertCircle className="mx-auto h-12 w-12" />
          <p className="mt-4 font-semibold">Não é Possível Apresentar o Gráfico</p>
          <p className="text-sm">{error || 'Ocorreu um erro inesperado.'}</p>
        </div>
      </div>
    );
  }
  
  const yAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? value.toFixed(1) : value;
  };

  const xAxisTickFormatter = (value: any) => {
    return typeof value === 'number' ? Math.round(value) : value;
  };

  return (
    <div className={cn('h-full w-full', className)} {...props}>
      <ChartContainer config={{}} className="h-full w-full">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
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
            domain={['auto', 'auto']}
            tickFormatter={yAxisTickFormatter}
            label={{ value: 'Valor (Z)', angle: -90, position: 'insideLeft', offset: -5 }}
          />
          <Tooltip
            content={<ChartTooltipContent indicator="dot" />}
          />
          <Legend verticalAlign="top" align="center" wrapperStyle={{paddingBottom: '20px'}} />
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.stroke}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
