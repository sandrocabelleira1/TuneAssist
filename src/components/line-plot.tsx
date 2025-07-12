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
    // 1. Rigorous validation
    if (
      !mapData || !xAxis || !yAxis ||
      typeof sliceIndex !== 'number' ||
      sliceIndex < 0 || sliceIndex >= mapData.length || sliceIndex >= yAxis.length
    ) {
      return null;
    }
    
    // 2. Safely get the specific row of Z-axis data for the selected Y-axis slice (e.g., for a specific RPM)
    const zValuesForSlice = mapData[sliceIndex];

    // 3. Ensure the data row and the X-axis have the same number of points
    if (!zValuesForSlice || zValuesForSlice.length !== xAxis.length) {
      return null;
    }
    
    // 4. Combine the X-axis values with the corresponding Z-axis values safely
    const combinedData = xAxis.map((xVal, index) => {
      const zVal = zValuesForSlice[index];
      
      return {
        x: xVal, // The value for the X-axis (e.g., TPS), can be number or string
        z: typeof zVal === 'number' && isFinite(zVal) ? zVal : null, // The value for the Z-axis (the map value)
      };
    });

    return combinedData;

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

  const selectedYValue = yAxis[sliceIndex];
  const formattedYValue = typeof selectedYValue === 'number' ? selectedYValue.toFixed(0) : selectedYValue;


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
            allowDuplicatedCategory={true}
        />
        <YAxis 
            stroke="hsl(var(--foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            domain={['auto', 'auto']}
            allowDataOverflow
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
          }}
          labelFormatter={(label) => `${xAxisLabel}: ${label}`}
        />
        <Legend wrapperStyle={{paddingTop: '20px'}}/>
        <Line
          type="monotone"
          dataKey="z"
          name={`Valor (${yAxisLabel}: ${formattedYValue})`}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          activeDot={{ r: 8 }}
          dot={{ r: 4 }}
          connectNulls={true}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
