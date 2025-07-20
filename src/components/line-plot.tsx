
'use client';

import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { PlotlyProps } from 'react-plotly.js';
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

  const plotData = useMemo(() => {
    if (
      !mapData || !xAxis || !yAxis ||
      sliceIndex < 0 || sliceIndex >= mapData.length ||
      !mapData[sliceIndex]
    ) {
      return null;
    }

    const yDataSlice = mapData[sliceIndex];

    // Robust data preparation: Pair X and Y, filter out invalid data, and sort by X.
    const pairedData = xAxis
      .map((x, index) => ({ x: x, y: yDataSlice[index] }))
      // Ensure both x and y are valid numbers for plotting
      .filter(pair => 
          typeof pair.x === 'number' && isFinite(pair.x) &&
          typeof pair.y === 'number' && isFinite(pair.y)
      )
      // Sort by the numeric x-axis value
      .sort((a, b) => (a.x as number) - (b.x as number));

    if (pairedData.length === 0) {
      return null;
    }

    // Unzip the sorted and filtered data
    const finalX = pairedData.map(p => p.x);
    const finalY = pairedData.map(p => p.y);

    return {
      x: finalX,
      y: finalY,
    };
  }, [mapData, xAxis, yAxis, sliceIndex]);


  if (!plotData || plotData.x.length === 0) {
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
  const formattedYValue = typeof selectedYValue === 'number' ? selectedYValue.toFixed(0) : selectedYValue;

  const data: PlotlyProps['data'] = [{
    x: plotData.x,
    y: plotData.y,
    type: 'scatter',
    mode: 'lines+markers',
    name: `Valor (${yAxisLabel}: ${formattedYValue})`,
    marker: { color: 'hsl(var(--primary))' },
    line: { color: 'hsl(var(--primary))', width: 2 },
    connectgaps: true,
  }];

  const layout: PlotlyProps['layout'] = {
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: 'hsl(var(--foreground))' },
    xaxis: {
      title: xAxisLabel,
      color: 'hsl(var(--foreground))',
      gridcolor: 'hsl(var(--border))',
    },
    yaxis: {
      title: 'Valor (Z)',
      color: 'hsl(var(--foreground))',
      gridcolor: 'hsl(var(--border))',
    },
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'right',
      x: 1,
    },
    margin: { l: 50, r: 20, b: 50, t: 20 },
  };

  return (
    <div className={cn("h-full w-full", className)} {...props}>
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
