'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
import { AlertCircle, Loader2 } from 'lucide-react';

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
}: LinePlot2DProps) {

  const plotData = useMemo(() => {
    if (
      !mapData || !xAxis || !yAxis ||
      sliceIndex < 0 || sliceIndex >= mapData.length ||
      !mapData[sliceIndex] ||
      xAxis.length !== mapData[sliceIndex].length
    ) {
      return null;
    }
    
    const zValuesForSlice = mapData[sliceIndex];
    
    return xAxis.map((xVal, index) => {
      const zVal = zValuesForSlice[index];
      return {
        x: xVal,
        z: (typeof zVal === 'number' && isFinite(zVal)) ? zVal : null,
      };
    });

  }, [mapData, xAxis, yAxis, sliceIndex]);

  const selectedYValue = yAxis[sliceIndex];
  const formattedYValue = typeof selectedYValue === 'number' ? selectedYValue.toFixed(0) : selectedYValue;

  return (
    <div className="h-full w-full">
      {!plotData ? (
        <div className="flex h-full w-full items-center justify-center text-center text-muted-foreground">
          <div>
            <AlertCircle className="mx-auto h-12 w-12" />
            <p className="mt-4 font-semibold">Dados de Gráfico Indisponíveis</p>
            <p className="text-sm">Selecione uma linha válida para visualizar no gráfico.</p>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
