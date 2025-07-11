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
  mapData: MapData; // Expects original orientation: Y-axis rows, X-axis cols
  xAxis: (string | number)[];
  yAxis: (string | number)[];
  xAxisLabel: string;
  yAxisLabel: string;
  sliceIndex: number;
  onDataChange: (colIndex: number, newValue: number) => void;
}

export default function LinePlot2D({
  mapData,
  xAxis,
  yAxis,
  yAxisLabel,
  sliceIndex,
  xAxisLabel,
  onDataChange,
}: LinePlot2DProps) {
    
  const plotData = useMemo(() => {
    // mapData is Y x X. sliceIndex corresponds to the row (Y-axis value) we want to plot.
    if (!mapData || sliceIndex < 0 || sliceIndex >= mapData.length) {
      return null;
    }
    
    // Get the specific row of Z-values for the selected Y-axis slice
    const dataForYSlice = mapData[sliceIndex];

    if (!dataForYSlice || dataForYSlice.length !== xAxis.length) {
      return null;
    }
    
    // Combine the X-axis values with the corresponding Z-values from the selected slice
    return xAxis.map((xVal, index) => ({
      x: typeof xVal === 'number' ? xVal.toFixed(1) : String(xVal),
      z: dataForYSlice[index],
    }));

  }, [mapData, xAxis, sliceIndex]);


  if (!plotData || plotData.some(p => p.z === undefined)) {
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
          name={`Valor (${yAxisLabel} ${yAxis[sliceIndex]})`}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          activeDot={{ r: 8 }}
          dot={{ r: 4 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
