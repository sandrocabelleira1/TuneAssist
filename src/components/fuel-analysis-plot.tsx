
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

interface FuelAnalysisPlotProps {
  logData: any[];
  logHeaders: string[];
}

// Helper to find a key in the log data headers that matches a target label
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


export default function FuelAnalysisPlot({ logData, logHeaders }: FuelAnalysisPlotProps) {
  const { chartData, rpmKey, lambdaKey, otherKeys } = useMemo(() => {
    if (!logData || logData.length === 0) {
      return { chartData: [], rpmKey: null, lambdaKey: null, otherKeys: [] };
    }

    const rpmKey = findKeyInHeader(logHeaders, ['rpm', 'rotacao']);
    const lambdaKey = findKeyInHeader(logHeaders, ['lambda', 'sonda']);

    if (!rpmKey || !lambdaKey) {
        return { chartData: [], rpmKey: null, lambdaKey: null, otherKeys: [] };
    }

    const otherNumericKeys = logHeaders.filter(
      key =>
        key !== rpmKey &&
        key !== lambdaKey &&
        logData.every(row => typeof row[key] === 'number' || !isNaN(parseFloat(row[key])))
    );
    
    const processedData = logData
      .map(row => {
          const newRow: any = {};
          newRow[rpmKey] = Number(row[rpmKey]);
          newRow[lambdaKey] = Number(row[lambdaKey]);
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
      otherKeys: otherNumericKeys,
    };
  }, [logData, logHeaders]);

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
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey={rpmKey} 
                type="number"
                domain={['dataMin', 'dataMax']}
                label={{ value: "RPM", position: 'insideBottom', offset: -10 }}
              />
              
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
