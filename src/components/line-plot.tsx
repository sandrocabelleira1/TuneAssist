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
  ResponsiveContainer,
} from 'recharts';
import type { MapData } from '@/lib/types';
import { AlertCircle } from 'lucide-react';

interface LinePlot2DProps {
  mapData: MapData; // This is now expected to be transposed: [cols x rows] (XxY)
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  sliceIndex: number;
  onDataChange: (colIndex: number, newValue: number) => void;
}

export default function LinePlot2D({
  mapData,
  xAxis,
  yAxis,
  sliceIndex,
  xAxisLabel,
  onDataChange,
}: LinePlot2DProps) {
    
  const plotData = useMemo(() => {
    // mapData is now expected to be transposed: [X-axis cols x Y-axis rows]
    // The data for the line chart is the Z value at each X-axis point.
    // We select a "row" from the transposed map, which corresponds to a "column" in the original map.
    // The `sliceIndex` corresponds to the Y-axis value we want to plot.
    
    // In the main component, the data is (YxX). We transpose it to (XxY) for this component.
    // So, a "row" here (mapData[sliceIndex]) is actually a column from the original data.
    // Wait, the main component now sends transposedMapFor2DView which is [cols x rows].
    // And sliceIndex refers to a Y-axis value (a row in the original table).
    // This means sliceIndex is an index for a ROW in the ORIGINAL data.
    // In the transposed data, a row is a COLUMN. This is confusing.

    // Let's simplify. `mapData` is now `transposedMapFor2DView`, which is `cols x rows`.
    // The selector lets us pick a `yAxis` value, which corresponds to `sliceIndex`.
    // We want to plot the Z values for that Y against all X values.
    // The original map was `rows x cols` (Y x X).
    // The transposed map is `cols x rows` (X x Y).
    // To get the data for the Y-axis value at `sliceIndex`, we need to get the `sliceIndex`-th element from each *column* of the transposed map.
    // This is equivalent to getting the `sliceIndex`-th *row* of the original map.

    // The data received `mapData` is already transposed (cols x rows).
    // The selector `sliceIndex` corresponds to an index of the `yAxis` array.
    // We need to plot `z` vs `x` for a fixed `y`.
    // The original, untransposed data would be `displayMap[sliceIndex]`.
    
    // Let's assume the data is NOT transposed when it arrives here. `mapData` should be the original `displayMap`.
    // This component will then handle what it needs.

    if (!mapData || sliceIndex < 0 || sliceIndex >= mapData.length) {
        return null;
    }
    
    // Get the specific row from the map data (YxX)
    const slice = mapData[sliceIndex];
    if (!slice) return null;

    return xAxis.map((xVal, index) => ({
      x: typeof xVal === 'number' ? xVal : String(xVal),
      z: slice[index],
    }));

  }, [mapData, xAxis, yAxis, sliceIndex]);


  if (!plotData) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
        <div>
          <AlertCircle className="mx-auto h-12 w-12" />
          <p className="mt-4 font-semibold">Dados de Gráfico Indisponíveis</p>
          <p className="text-sm">Selecione uma linha válida para visualizar no gráfico.</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={plotData}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
            dataKey="x" 
            name={xAxisLabel}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -10 }}
            stroke="hsl(var(--foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
        />
        <YAxis 
            stroke="hsl(var(--foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            domain={['dataMin', 'dataMax']}
            allowDataOverflow
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
          }}
        />
        <Legend wrapperStyle={{paddingTop: '20px'}}/>
        <Line
          type="monotone"
          dataKey="z"
          name="Valor"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          activeDot={{ r: 8 }}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
