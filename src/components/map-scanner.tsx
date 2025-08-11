
'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Search, DownloadCloud, Microscope, Gauge, GitCommitHorizontal, Columns3 } from 'lucide-react';
import type { LogMessage, PotentialMap } from '@/lib/types';
import { scanForMapsWithTemplate } from '@/lib/ecu';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

const SparkLinePreview = ({ data }: { data: number[][] | undefined }) => {
    if (!data || data.length === 0 || data[0].length === 0) return null;

    const chartData = data[0].map((value, index) => ({ name: index, value }));
    const min = Math.min(...chartData.map(d => d.value));
    const max = Math.max(...chartData.map(d => d.value));

    return (
        <div className="w-24 h-8">
            <ResponsiveContainer>
                <LineChart data={chartData}>
                     <YAxis hide domain={[min, max]} />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const HexViewer = ({ buffer, highlightAddress }: { buffer: ArrayBuffer | null, highlightAddress: number | null }) => {
  const bytesPerLine = 16;
  const hexValues = useMemo(() => {
    if (!buffer) return [];
    const view = new Uint8Array(buffer);
    const lines = [];
    for (let i = 0; i < view.length; i += bytesPerLine) {
      const slice = view.slice(i, i + bytesPerLine);
      lines.push({
        address: i,
        hex: Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '),
        ascii: Array.from(slice).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('')
      });
    }
    return lines;
  }, [buffer]);

  const highlightRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightAddress !== null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightAddress]);

  if (!buffer) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
        Carregue um ficheiro .BIN para visualizar os seus conteúdos.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full bg-background border rounded-lg">
      <div className="p-2 font-mono text-xs">
        {hexValues.map(line => {
          const isHighlighted = highlightAddress !== null && line.address <= highlightAddress && highlightAddress < line.address + bytesPerLine;
          return (
            <div key={line.address} ref={isHighlighted ? highlightRef : null} className={`flex ${isHighlighted ? 'bg-primary/20 rounded' : ''}`}>
              <span className="text-muted-foreground w-20 shrink-0">0x{line.address.toString(16).padStart(8, '0')}</span>
              <span className="flex-1 text-foreground">{line.hex}</span>
              <span className="text-muted-foreground w-20 shrink-0">{line.ascii}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};


interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: LogMessage['type']) => void;
    potentialMaps: PotentialMap[];
    setPotentialMaps: (maps: PotentialMap[]) => void;
}

export default function MapScanner({ binFile, onLoadMap, addLog, potentialMaps, setPotentialMaps }: MapScannerProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStatus, setScanStatus] = useState('Aguardando...');
    const [highlightAddress, setHighlightAddress] = useState<number | null>(null);

    const [templateConfig, setTemplateConfig] = useState({
        rows: 32,
        cols: 19,
        dataType: '8-bit',
        findAxes: true,
    });

    const handleScan = useCallback(async () => {
        if (!binFile) {
            addLog("Ficheiro BIN não carregado. Não é possível iniciar o scan.", 'error');
            return;
        }

        setIsScanning(true);
        setScanProgress(0);
        setScanStatus('A iniciar...');
        setPotentialMaps([]);
        addLog(`A iniciar análise com template: ${templateConfig.rows}x${templateConfig.cols} ${templateConfig.dataType}`, 'info');
        
        try {
            const config = {
                rows: templateConfig.rows,
                cols: templateConfig.cols,
                dataSize: templateConfig.dataType.includes('16') ? 2 : 1,
                isBigEndian: templateConfig.dataType.includes('BE'),
                findAxes: templateConfig.findAxes,
            };
            
            const results = await scanForMapsWithTemplate(binFile.buffer, config, {
                onProgress: (progress, status) => {
                    setScanProgress(progress);
                    setScanStatus(status);
                },
                confidenceThreshold: 0.4
            });

            const sortedResults = results.sort((a,b) => a.address - b.address);
            
            setPotentialMaps(sortedResults);
            addLog(`Análise concluída. Encontrados ${sortedResults.length} mapas potenciais.`, 'success');
        } catch (error) {
            const msg = `Erro durante a análise: ${(error as Error).message}`;
            addLog(msg, 'error');
        } finally {
            setIsScanning(false);
            setScanProgress(100);
            setScanStatus(`Concluído. Encontrados ${potentialMaps.length} mapas.`);
        }
    }, [binFile, addLog, setPotentialMaps, templateConfig]);

    if (!binFile) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Ficheiro BIN Necessário</h3>
                <p className="max-w-md">Para utilizar o scanner de mapas, por favor carregue primeiro um ficheiro .BIN no painel de controlo à esquerda.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col xl:flex-row h-full gap-4">
             <div className="flex flex-col gap-4 w-full xl:w-2/3">
                <Card className="shrink-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Microscope /> Análise por Template Deslizante</CardTitle>
                        <CardDescription>
                        Defina um "molde" de mapa (ex: 32x19) e o motor irá varrer o ficheiro à procura de blocos de dados que correspondam a esse padrão e aos seus eixos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col sm:flex-row items-end gap-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                                <div className="space-y-1.5">
                                    <Label htmlFor="template-rows">Linhas</Label>
                                    <Input id="template-rows" type="number" value={templateConfig.rows} onChange={e => setTemplateConfig(c => ({...c, rows: parseInt(e.target.value, 10) || 0}))} disabled={isScanning} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="template-cols">Colunas</Label>
                                    <Input id="template-cols" type="number" value={templateConfig.cols} onChange={e => setTemplateConfig(c => ({...c, cols: parseInt(e.target.value, 10) || 0}))} disabled={isScanning} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="template-datatype">Tipo de Dados</Label>
                                    <Select value={templateConfig.dataType} onValueChange={v => setTemplateConfig(c => ({...c, dataType: v}))} disabled={isScanning}>
                                        <SelectTrigger id="template-datatype">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="8-bit">8-bit</SelectItem>
                                            <SelectItem value="16-bit LE">16-bit (Little Endian)</SelectItem>
                                            <SelectItem value="16-bit BE">16-bit (Big Endian)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5 flex items-end">
                                    <div className="flex items-center space-x-2 h-10">
                                        <Checkbox id="find-axes" checked={templateConfig.findAxes} onCheckedChange={c => setTemplateConfig(cfg => ({...cfg, findAxes: !!c}))} disabled={isScanning}/>
                                        <Label htmlFor="find-axes" className="cursor-pointer">Procurar Eixos</Label>
                                    </div>
                                </div>
                            </div>

                            {isScanning ? (
                                <div className="w-full sm:w-64 flex flex-col gap-2">
                                    <Progress value={scanProgress} className="h-2" />
                                    <p className="text-xs text-muted-foreground text-center mt-1">{scanStatus} ({scanProgress.toFixed(0)}%)</p>
                                </div>
                            ) : (
                                <Button onClick={handleScan} disabled={isScanning} className="w-full sm:w-auto">
                                    {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />}
                                    {isScanning ? 'A Analisar...' : 'Iniciar Análise com Template'}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="flex-1 border rounded-lg min-h-[300px] xl:min-h-0">
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader className="sticky top-0 bg-muted z-10">
                                <TableRow>
                                    <TableHead>End. Mapa</TableHead>
                                    <TableHead>Eixos (Y/X)</TableHead>
                                    <TableHead>Preview</TableHead>
                                    <TableHead>Sugestão</TableHead>
                                    <TableHead>Confiança</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isScanning && potentialMaps.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                <span>A procurar...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : potentialMaps.length > 0 ? (
                                    potentialMaps.map((map) => (
                                        <TableRow key={`${map.address}`} onMouseEnter={() => setHighlightAddress(map.address)} onMouseLeave={() => setHighlightAddress(null)} className="cursor-pointer">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-sm">0x{map.address.toString(16).toUpperCase()}</span>
                                                    <span className="text-xs text-muted-foreground">{map.rows}x{map.cols} ({map.dataType})</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs font-mono">
                                                     <div className="flex items-center gap-1" title="Eixo Y">
                                                        <Columns3 className="h-3 w-3 text-muted-foreground" />
                                                        {map.yAxisAddress ? `0x${map.yAxisAddress.toString(16).toUpperCase()}` : 'N/A'} 
                                                        ({map.yAxisType})
                                                    </div>
                                                    <div className="flex items-center gap-1" title="Eixo X">
                                                        <GitCommitHorizontal className="h-3 w-3 text-muted-foreground" />
                                                        {map.xAxisAddress ? `0x${map.xAxisAddress.toString(16).toUpperCase()}` : 'N/A'}
                                                        ({map.xAxisType})
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <SparkLinePreview data={map.previewData} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{map.suggestion}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Progress value={map.confidence * 100} className="h-2 w-20" />
                                                    <span>{(map.confidence * 100).toFixed(0)}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline" onClick={() => onLoadMap(map)}>
                                                    <DownloadCloud className="mr-2 h-3 w-3" />
                                                    Carregar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            Defina um template e inicie a análise para encontrar mapas.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
            </div>
            <div className="w-full xl:w-1/3 flex flex-col min-h-[300px] xl:min-h-full">
                <HexViewer buffer={binFile?.buffer ?? null} highlightAddress={highlightAddress} />
            </div>
        </div>
    );
}
