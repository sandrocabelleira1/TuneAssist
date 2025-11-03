
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
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AxisData, XDFinition } from '@/lib/types';

interface FuelAnalysisPlotProps {
  logData: any[];
  logHeaders: string[];
  loadAxis: AxisData | null;
  selectedLoadColumn: string;
  selectedLoadValues: string[];
  mapLineData: { rpm: number, mapValue: number | null }[] | null;
  mapDefinition: XDFinition | undefined;
}

function findKeyInHeader(header: string[], targetLabels: string[]): string | undefined {
    for (const targetLabel of targetLabels) {
        const cleanTargetLabel = targetLabel.trim().toLowerCase();
        for (const key of header) {
            const cleanKey = key.trim().toLowerCase();
            if (cleanKey.includes(cleanTargetLabel)) {
                return key;
            }
        }
    }
    return undefined;
}

function findClosestIndex(arr: (number | string)[], target: number): number {
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < arr.length; i++) {
        const val = Number(arr[i]);
        if (isNaN(val)) continue;
        const diff = Math.abs(val - target);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    return closestIndex;
}


export default function FuelAnalysisPlot({ logData, logHeaders, loadAxis, selectedLoadColumn, selectedLoadValues, mapLineData, mapDefinition }: FuelAnalysisPlotProps) {
  const { chartData, rpmKey, lambdaKey, timeKey, otherKeys, mergedData } = useMemo(() => {
    if (!logData || logData.length === 0) {
      return { chartData: [], rpmKey: null, lambdaKey: null, timeKey: null, otherKeys: [], mergedData: [] };
    }

    const rpmKey = findKeyInHeader(logHeaders, ['rpm', 'rotacao']);
    const lambdaKey = findKeyInHeader(logHeaders, ['lambda', 'sonda']);
    const timeKey = findKeyInHeader(logHeaders, ['time', 'tempo', 'momento']);

    if (!rpmKey || !lambdaKey) {
        return { chartData: [], rpmKey: null, lambdaKey: null, timeKey: null, otherKeys: [], mergedData: [] };
    }

    const desiredKeys = ['potencia', 'potência', 'power', 'torque', 'torq'];
    const otherNumericKeys = logHeaders.filter(
      key => {
          const cleanKey = key.trim().toLowerCase();
          return desiredKeys.some(dk => cleanKey.includes(dk)) &&
                 logData.every(row => typeof row[key] === 'number' || !isNaN(parseFloat(row[key])));
      }
    );
    
    let filteredLogData = logData;

    // Apply filtering based on selected load conditions
    if (selectedLoadColumn && loadAxis) {
        const loadKey = findKeyInHeader(logHeaders, [selectedLoadColumn]);
        if (loadKey) {
            filteredLogData = logData.filter(row => {
                const logLoadValue = Number(row[loadKey]);
                if (isNaN(logLoadValue)) return false;
                const closestMapLoadIndex = findClosestIndex(loadAxis.calculated, logLoadValue);
                if (closestMapLoadIndex === -1) return false;
                const mapLoadValue = Number(loadAxis.calculated[closestMapLoadIndex]);
                const tolerance = (Number(loadAxis.calculated[1]) - Number(loadAxis.calculated[0])) / 2;
                return Math.abs(logLoadValue - mapLoadValue) <= tolerance;
            });
        }
    } else if (selectedLoadValues.length > 0 && loadAxis) {
        filteredLogData = logData;
    }

    const processedData = filteredLogData
      .map(row => {
          const newRow: any = {
            [rpmKey]: Number(row[rpmKey]),
            [lambdaKey]: Number(row[lambdaKey]),
          };
          if (timeKey) newRow[timeKey] = Number(row[timeKey]);
          otherNumericKeys.forEach(k => {
              newRow[k] = Number(row[k]);
          });
          return newRow;
      })
      .filter(row => !isNaN(row[rpmKey]))
      .sort((a, b) => a[rpmKey] - b[rpmKey]);

    const finalMergedData: any[] = [...processedData];

    if (mapLineData) {
        mapLineData.forEach(mapPoint => {
            const existingEntry = finalMergedData.find(d => d[rpmKey] === mapPoint.rpm);
            if (existingEntry) {
                existingEntry.mapValue = mapPoint.mapValue;
            } else {
                finalMergedData.push({
                    [rpmKey]: mapPoint.rpm,
                    mapValue: mapPoint.mapValue
                });
            }
        });
        finalMergedData.sort((a,b) => a[rpmKey] - b[rpmKey]);
    }

    return {
      chartData: processedData,
      rpmKey,
      lambdaKey,
      timeKey,
      otherKeys: otherNumericKeys,
      mergedData: finalMergedData,
    };
  }, [logData, logHeaders, loadAxis, selectedLoadColumn, selectedLoadValues, mapLineData]);

  if (!rpmKey || !lambdaKey) {
    return (
        <Card className="mt-4">
            <CardHeader>
                <CardTitle>Visualização do Ensaio</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Não foi possível gerar o gráfico. Certifique-se de que o seu ficheiro de log contém colunas para RPM e Lambda/Sonda.</p>
            </CardContent>
        </Card>
    );
  }

  const yAxisColors = ['hsl(var(--primary))', '#82ca9d', '#ffc658', '#ff8042', '#8884d8', '#ffbb28'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visualização do Ensaio</CardTitle>
        <CardDescription>Gráfico dinâmico dos dados carregados do ficheiro de log, comparado com o valor do mapa.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="min-h-[300px] w-full">
          <ResponsiveContainer>
            <LineChart data={mergedData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey={rpmKey} 
                type="number"
                domain={['dataMin', 'dataMax']}
                label={{ value: "RPM", position: 'insideBottom', offset: -10 }}
              />
              
              {timeKey && (
                  <XAxis 
                    xAxisId="top"
                    dataKey={timeKey}
                    orientation="top"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    label={{ value: "Tempo do Ensaio (s)", position: 'insideTop', offset: -15, dy: -5 }}
                    stroke="transparent"
                    tickLine={false}
                    tickFormatter={(value) => value.toFixed(1)}
                  />
              )}

              <YAxis 
                yAxisId="left" 
                stroke={yAxisColors[0]}
                label={{ value: lambdaKey, angle: -90, position: 'insideLeft', fill: yAxisColors[0] }}
                tickFormatter={(value) => value.toFixed(2)}
              />

              {otherKeys.map((key, index) => (
                <YAxis 
                  key={key}
                  yAxisId={`right-${index}`} 
                  orientation="right" 
                  stroke={yAxisColors[index + 1]}
                  label={{ value: key, angle: 90, position: 'insideRight', fill: yAxisColors[index + 1] }}
                />
              ))}

              {mapLineData && (
                <YAxis
                    yAxisId="mapValue"
                    orientation="right"
                    stroke={yAxisColors[yAxisColors.length-1]}
                    label={{ value: mapDefinition?.name || "Valor do Mapa", angle: 90, position: 'insideRight', fill: yAxisColors[yAxisColors.length-1], dx: 15 }}
                />
              )}

              <Tooltip content={<ChartTooltipContent indicator="dot" />} />
              <Legend verticalAlign="top" wrapperStyle={{paddingBottom: '10px'}}/>

              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey={lambdaKey}
                name={lambdaKey}
                stroke={yAxisColors[0]}
                strokeWidth={2}
                dot={false} 
                connectNulls
              />
              
              {otherKeys.map((key, index) => (
                 <Line 
                    key={key}
                    yAxisId={`right-${index}`} 
                    type="monotone" 
                    dataKey={key}
                    name={key}
                    stroke={yAxisColors[index + 1]}
                    dot={false}
                    connectNulls
                />
              ))}
              
              {mapLineData && (
                <Line
                    yAxisId="mapValue"
                    type="monotone"
                    dataKey="mapValue"
                    name={mapDefinition?.name || "Valor do Mapa"}
                    stroke={yAxisColors[yAxisColors.length-1]}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                />
              )}

            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
