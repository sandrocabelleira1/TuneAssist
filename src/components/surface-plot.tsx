
'use client';

import React, { useMemo, useEffect, useRef, useState } from 'react';
import type { MapData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getPlotlyHeatmapScale } from '@/lib/colors';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { PlotlyHTMLElement, Config, Data, Layout } from 'plotly.js';

interface SurfacePlot3DProps extends React.HTMLAttributes<HTMLDivElement> {
  mapData: MapData | null; 
  xAxis: (string | number)[] | null; 
  yAxis: (string | number)[] | null; 
  xAxisLabel?: string; 
  yAxisLabel?: string;
  zAxisLabel?: string;
}

export default function SurfacePlot3D({ mapData, xAxis, yAxis, xAxisLabel, yAxisLabel, zAxisLabel = 'Valor', className, ...props }: SurfacePlot3DProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const PlotlyRef = useRef<typeof import('plotly.js') | null>(null);
  const [isPlotlyLoaded, setIsPlotlyLoaded] = useState(false);

  useEffect(() => {
    import('plotly.js-dist-min')
      .then((Plotly) => {
        PlotlyRef.current = Plotly;
        setIsPlotlyLoaded(true);
      })
      .catch((err) => console.error("Falha ao carregar Plotly", err));
  }, []);

  const { plotData, layout } = useMemo(() => {
    if (!mapData || !xAxis || !yAxis) {
         return { plotData: null, layout: null };
    }

    const isXNumeric = xAxis.every(v => typeof v === 'number' && isFinite(v));
    const isYNumeric = yAxis.every(v => typeof v === 'number' && isFinite(v));

    if (!isXNumeric || !isYNumeric) {
      return { plotData: null, layout: null };
    }
    
    const numericMapData = mapData.map(row => 
        row.map(cell => {
            const num = Number(cell);
            return isNaN(num) ? null : num;
        })
    );

    const { minVal, maxVal } = mapData.flat().reduce((acc, val) => {
        if (val === null || val === undefined) return acc;
        return {
            minVal: Math.min(acc.minVal, val),
            maxVal: Math.max(acc.maxVal, val),
        };
    }, { minVal: Infinity, maxVal: -Infinity });

    const data: Data[] = [{
        x: xAxis,
        y: yAxis,
        z: numericMapData as any[][],
        type: 'surface',
        connectgaps: false,
        colorscale: getPlotlyHeatmapScale(),
        cmin: minVal,
        cmax: maxVal,
        reversescale: false,
        colorbar: {
          title: zAxisLabel,
          tickfont: { color: 'hsl(var(--foreground))' },
          titlefont: { color: 'hsl(var(--foreground))' }
        }
    }];

    const layout: Partial<Layout> = {
        title: '',
        autosize: true,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: 'hsl(var(--foreground))' },
        scene: {
          xaxis: { title: xAxisLabel ?? 'Eixo X', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
          yaxis: { title: yAxisLabel ?? 'Eixo Y', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
          zaxis: { title: zAxisLabel ?? 'Valor', color: 'hsl(var(--foreground))', gridcolor: 'hsl(var(--border))', backgroundcolor: 'hsl(var(--card))' },
          camera: { eye: {x: 1.8, y: -1.8, z: 1.2} }
        },
        margin: { l: 0, r: 0, b: 0, t: 0 },
    };

    return { plotData: data, layout };
  }, [mapData, xAxis, yAxis, xAxisLabel, yAxisLabel, zAxisLabel]);

  useEffect(() => {
    if (isPlotlyLoaded && PlotlyRef.current && plotRef.current && plotData && layout) {
      const Plotly = PlotlyRef.current;
      Plotly.newPlot(plotRef.current, plotData, layout, { responsive: true, displaylogo: false });
      
      const resizeObserver = new ResizeObserver(() => {
          Plotly.Plots.resize(plotRef.current as PlotlyHTMLElement);
      });
      resizeObserver.observe(plotRef.current);
      
      return () => {
          resizeObserver.disconnect();
          if (plotRef.current) {
            Plotly.purge(plotRef.current);
          }
      };
    }
  }, [isPlotlyLoaded, plotData, layout]);

  if (!isPlotlyLoaded) {
    return (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-card rounded-lg border p-4">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

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

  return (
    <div className={cn("h-full w-full bg-card rounded-lg border", className)} {...props}>
      <div ref={plotRef} className="h-full w-full" />
    </div>
  );
}
