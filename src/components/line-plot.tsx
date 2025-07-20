
'use client';

import React, { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { MapData } from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinePlot2DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData;
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  yAxisLabel: string;
  sliceIndex: number;
}

export default function LinePlot2D({
  mapData,
  xAxis,
  yAxis,
  yAxisLabel,
  xAxisLabel,
  sliceIndex,
  className,
  ...props
}: LinePlot2DProps) {

  const chartData = useMemo(() => {
    // 1. Validate inputs: ensure all required data exists.
    if (
      !mapData || !xAxis ||
      sliceIndex < 0 || sliceIndex >= mapData.length ||
      !mapData[sliceIndex]
    ) {
      return null;
    }

    const yDataSlice = mapData[sliceIndex];

    // 2. Create combined data points and filter for valid numbers.
    const data = xAxis
      .map((x, index) => {
        const y = yDataSlice[index];
        // Only include data points where both x and y are valid numbers.
        if (typeof x === 'number' && isFinite(x) && typeof y === 'number' && isFinite(y)) {
          return {
            xValue: x,
            yValue: y,
          };
        }
        return null;
      })
      .filter((point): point is { xValue: number; yValue: number } => point !== null); // Type guard to ensure we have an array of valid points.

    // 3. Recharts requires the data to be sorted by the x-axis value for lines to connect properly.
    if (data.length > 0) {
        data.sort((a, b) => a.xValue - b.xValue);
    }

    // 4. Return null if no valid data points are left after filtering.
    return data.length > 0 ? data : null;
  }, [mapData, xAxis, sliceIndex]);


  if (!chartData) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
        <div>
          <AlertCircle className="mx-auto h-12 w-12" />
          <p className="mt-4 font-semibold">Dados de Gráfico Indisponíveis</p>
          <p className="text-sm">A linha selecionada não contém dados numéricos válidos para exibir.</p>
        </div>
      </div>
    );
  }
  
  const selectedYValue = yAxis[sliceIndex];
  const formattedYValue = typeof selectedYValue === 'number' ? selectedYValue.toFixed(1) : selectedYValue;
  const legendName = `${yAxisLabel}: ${formattedYValue}`;
  
  const yAxisTickFormatter = (value: any) => {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return value;
  };

  return (
    <div className={cn("h-full w-full", className)} {...props}>
      <ChartContainer config={{}} className="h-full w-full">
        <LineChart
          accessibilityLayer
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="xValue"
            type="number"
            tickLine={true}
            axisLine={true}
            tickMargin={8}
            domain={['dataMin', 'dataMax']}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -15 }}
          />
          <YAxis
            dataKey="yValue"
            tickLine={true}
            axisLine={true}
            tickMargin={8}
            domain={['auto', 'auto']}
            tickFormatter={yAxisTickFormatter}
            label={{ value: 'Valor (Z)', angle: -90, position: 'insideLeft', offset: -5 }}
          />
          <Tooltip
            cursor
            content={<ChartTooltipContent indicator="dot" />}
          />
          <Legend verticalAlign="top" align="right" height={36} />
          <Line
            dataKey="yValue"
            type="monotone"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={true}
            name={legendName}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
