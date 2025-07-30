
'use client';

import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { PlotlyProps } from 'react-plotly.js';
import { AlertCircle } from 'lucide-react';
import type { MapData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SurfacePlot3DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData; 
  xAxis: (string | number)[]; 
  yAxis: (string | number)[]; 
  xAxisLabel: string; 
  yAxisLabel: string;
}

export default function SurfacePlot3D({ mapData, xAxis, yAxis, xAxisLabel, yAxisLabel, className, ...props }: SurfacePlot3DProps) {
  const plotData = useMemo(() => {
    // Data is now pre-sorted and remapped by the readAndCalculateMapFromBin function.
    // We can use it directly.
    const isXNumeric = xAxis.every(v => typeof v === 'number' && isFinite(v));
    const isYNumeric = yAxis.every(v => typeof v === 'number' && isFinite(v));

    if (!isXNumeric || !isYNumeric) {
      return null;
    }

    return {
      x: xAxis,
      y: yAxis,
      z: mapData,
    };
  }, [mapData, xAxis, yAxis]);

  if (!plotData) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-card rounded-lg border p-4">
        <div className="text-center p-4">
            <AlertCircle className="mx-auto h-12 w-12" />
            <p className="mt-4 font-semibold">Não é possível apresentar o gráfico 3D</p>
            <p className="text-sm">Os gráficos 3D necessitam de eixos com valores puramente numéricos.</p>
        </div>
      </div>
    );
  }

  const data: PlotlyProps['data'] = [{
    x: plotData.x as any[],
    y: plotData.y as any[],
    z: plotData.z as any[][],
    type: 'surface',
    connectgaps: false,
    colorscale: 'Viridis',
    colorbar: {
      title: 'Valor',
      tickfont: { color: 'hsl(var(--foreground))' },
      titlefont: { color: 'hsl(var(--foreground))' }
    }
  }];

  const layout: PlotlyProps['layout'] = {
    title: '',
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: 'hsl(var(--foreground))' },
    scene: {
      xaxis: { title: xAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      yaxis: { title: yAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      zaxis: { title: 'Valor', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      camera: { eye: {x: 1.8, y: -1.8, z: 1.2} }
    },
    margin: { l: 0, r: 0, b: 0, t: 0 },
  };

  return (
    <div className={cn("h-full w-full bg-card rounded-lg border p-4", className)} {...props}>
      <Plot
        data={data}
        layout={layout}
        useResizeHandler
        className="h-full w-full"
        config={{ responsive: true, displaylogo: false }}
      />
    </div>
  );
}
