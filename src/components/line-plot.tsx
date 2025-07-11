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
  mapData: MapData; // This is now expected to be transposed: [X-axis cols x Y-axis rows]
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
    // mapData is transposed: [X-axis cols x Y-axis rows]
    // The selector `sliceIndex` corresponds to an index of the `yAxis` array (a row in the original table).
    // We want to plot the Z values for that Y against all X values.
    // In the transposed map, the data for a specific Y (row) is now a column.
    
    // However, the `sliceIndex` corresponds to the Y-axis, which has `yAxis.length` items.
    // The number of columns in the transposed map is `yAxis.length`.
    // So, `mapData[some_x_index][sliceIndex]` gives the Z value for a given X and the selected Y.

    if (!mapData || mapData.length === 0 || mapData[0].length <= sliceIndex) {
        return null;
    }
    
    // Get the specific row from the original map, which is now a column in the transposed map.
    // We can iterate through the xAxis and pick the z-value for the selected sliceIndex.
    const slice = mapData.map(col => col[sliceIndex]);
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
