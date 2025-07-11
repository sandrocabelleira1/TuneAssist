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
  mapData: MapData;
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
  xAxisLabel,
  sliceIndex,
  onDataChange,
}: LinePlot2DProps) {
    
  const plotData = useMemo(() => {
    // The table shows Y-axis (RPM) as rows and X-axis (TPS) as columns.
    // sliceIndex corresponds to the selected row index from the displayMap.
    if (!mapData || sliceIndex < 0 || sliceIndex >= mapData.length) {
        return null;
    }
    
    // Get the correct row of data for the selected Y-axis slice.
    const slice = mapData[sliceIndex];
    if (!slice) return null;

    return xAxis.map((xVal, index) => ({
      x: typeof xVal === 'number' ? xVal : String(xVal),
      z: slice[index],
    }));

  }, [mapData, xAxis, sliceIndex]);


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
