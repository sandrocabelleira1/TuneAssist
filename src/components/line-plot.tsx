
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

const formatNumber = (num: number | null) => {
    if (num === null || isNaN(num)) return '-';
    // Format with 1 decimal place if it has a decimal part, otherwise as an integer.
    return num % 1 !== 0 ? num.toFixed(1) : String(num);
};

function DataPointTable({ data }: { data: { xValue: number; yValue: number }[] }) {
    if (!data || data.length === 0) return null;
    return (
        <div className="overflow-x-auto pb-4">
            <table className="w-full border-collapse text-xs text-center">
                <thead>
                    <tr>
                        <th className="bg-destructive text-white p-2 border border-border font-semibold" colSpan={data.length}>
                            Valores do Ponto de Ignição
                        </th>
                    </tr>
                    <tr>
                        {data.map(({ xValue }, index) => (
                            <th key={`head-${index}`} className="p-1 border border-border font-semibold bg-card">
                                {Math.round(xValue)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {data.map(({ yValue }, index) => (
                            <td 
                              key={`cell-${index}`} 
                              className={cn(
                                "p-1 border border-border",
                                // Example of highlighting a specific cell like in the reference
                                index === 2 ? 'bg-green-300/20' : 'bg-card'
                              )}
                            >
                                {formatNumber(yValue)}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
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
    if (
      !mapData || !xAxis ||
      sliceIndex < 0 || sliceIndex >= mapData.length ||
      !mapData[sliceIndex]
    ) {
      return null;
    }

    const yDataSlice = mapData[sliceIndex];

    const data = xAxis
      .map((x, index) => {
        const y = yDataSlice[index];
        if (typeof x === 'number' && isFinite(x) && typeof y === 'number' && isFinite(y)) {
          return {
            xValue: x,
            yValue: y,
          };
        }
        return null;
      })
      .filter((point): point is { xValue: number; yValue: number } => point !== null);

    if (data.length > 0) {
        data.sort((a, b) => a.xValue - b.xValue);
    }

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
    <div className={cn("h-full w-full flex flex-col", className)} {...props}>
        <DataPointTable data={chartData} />
        <div className="flex-1 min-h-0">
          <ChartContainer config={{}} className="h-full w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 5,
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
    </div>
  );
}
