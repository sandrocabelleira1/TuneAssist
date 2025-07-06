'use client';

import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { PlotlyProps } from 'react-plotly.js';
import { AlertCircle } from 'lucide-react';
import type { MapData } from '@/lib/types';

interface SurfacePlot3DProps {
  mapData: MapData; 
  xAxis: (string | number)[]; 
  yAxis: (string | number)[]; 
  xAxisLabel: string; 
  yAxisLabel: string;
}

export default function SurfacePlot3D({ mapData, xAxis, yAxis, xAxisLabel, yAxisLabel }: SurfacePlot3DProps) {
  const plotData = useMemo(() => {
    // A 3D surface plot requires numeric axes.
    const isXNumeric = yAxis.every(v => typeof v === 'number' && isFinite(v));
    const isYNumeric = xAxis.every(v => typeof v === 'number' && isFinite(v));

    if (!isXNumeric || !isYNumeric) {
      return null;
    }

    // Replace any nulls in the z data with NaN so Plotly can handle them as gaps.
    const sanitizedZ = mapData.map(row => 
      row.map(cell => (cell === null || !isFinite(cell) ? NaN : cell))
    );

    return {
      x: yAxis, // yAxis is the horizontal axis in the table, so it's the x for the plot
      y: xAxis, // xAxis is the vertical axis in the table, so it's the y for the plot
      z: sanitizedZ,
    };
  }, [mapData, xAxis, yAxis]);

  if (!plotData) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
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
    connectgaps: false, // Important for handling NaN
    colorscale: [
      [0, 'rgb(0,0,255)'],      // Blue for low values
      [0.5, 'rgb(0,255,0)'],    // Green for mid values
      [1, 'rgb(255,0,0)']       // Red for high values
    ],
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
      xaxis: { title: yAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      yaxis: { title: xAxisLabel, color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      zaxis: { title: 'Valor', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
      camera: { eye: {x: 1.8, y: -1.8, z: 1.2} }
    },
    margin: { l: 0, r: 0, b: 0, t: 0 },
  };

  return (
    <div className="h-full w-full">
      <Plot
        data={data}
        layout={layout}
        useResizeHandler
        className="h-full w-full"
        config={{ responsive: true }}
      />
    </div>
  );
}
