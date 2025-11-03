
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
import type { AxisData } from '@/lib/types';

interface FuelAnalysisPlotProps {
  logData: any[];
  logHeaders: string[];
  loadAxis: AxisData | null;
  selectedLoadColumn: string;
  selectedLoadValues: string[];
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


export default function FuelAnalysisPlot({ logData, logHeaders, loadAxis, selectedLoadColumn, selectedLoadValues }: FuelAnalysisPlotProps) {
  const { chartData, rpmKey, lambdaKey, timeKey, otherKeys } = useMemo(() => {
    if (!logData || logData.length === 0) {
      return { chartData: [], rpmKey: null, lambdaKey: null, timeKey: null, otherKeys: [] };
    }

    const rpmKey = findKeyInHeader(logHeaders, ['rpm', 'rotacao']);
    const lambdaKey = findKeyInHeader(logHeaders, ['lambda', 'sonda']);
    const timeKey = findKeyInHeader(logHeaders, ['time', 'tempo', 'momento']);

    if (!rpmKey || !lambdaKey) {
        return { chartData: [], rpmKey: null, lambdaKey: null, timeKey: null, otherKeys: [] };
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
    if (selectedLoadColumn && loadAxis) {
        const loadKey = findKeyInHeader(logHeaders, [selectedLoadColumn]);
        if (loadKey) {
            filteredLogData = logData.filter(row => {
                const logLoadValue = Number(row[loadKey]);
                if (isNaN(logLoadValue)) return false;
                const closestMapLoadIndex = findClosestIndex(loadAxis.calculated, logLoadValue);
                return closestMapLoadIndex !== -1;
            });
        }
    } else if (selectedLoadValues.length > 0 && loadAxis) {
        const targetLoadNumbers = selectedLoadValues.map(v => Number(v));
        filteredLogData = logData.filter(row => {
            const logRpm = Number(row[rpmKey]);
             // Placeholder for load value if not in log - assume it matches the selected values
            if (isNaN(logRpm)) return false;
            return true;
        });
    }

    const processedData = filteredLogData
      .map(row => {
          const newRow: any = {};
          newRow[rpmKey] = Number(row[rpmKey]);
          newRow[lambdaKey] = Number(row[lambdaKey]);
          if (timeKey) newRow[timeKey] = Number(row[timeKey]);

          otherNumericKeys.forEach(k => {
              newRow[k] = Number(row[k]);
          });
          return newRow;
      })
      .filter(row => !isNaN(row[rpmKey]))
      .sort((a, b) => a[rpmKey] - b[rpmKey]);


    return {
      chartData: processedData,
      rpmKey,
      lambdaKey,
      timeKey,
      otherKeys: otherNumericKeys,
    };
  }, [logData, logHeaders, loadAxis, selectedLoadColumn, selectedLoadValues]);

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

  const yAxisColors = ['hsl(var(--primary))', '#82ca9d', '#ffc658', '#ff8042', '#8884d8'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visualização do Ensaio</CardTitle>
        <CardDescription>Gráfico dinâmico dos dados carregados do ficheiro de log.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="min-h-[300px] w-full">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
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

              <Tooltip content={<ChartTooltipContent indicator="dot" />} />
              <Legend verticalAlign="top" />

              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey={lambdaKey}
                name={lambdaKey}
                stroke={yAxisColors[0]}
                strokeWidth={2}
                dot={false} 
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
                />
              ))}

            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
