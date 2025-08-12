
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Loader2, DownloadCloud, Microscope, MapPinned, Columns3, GitCommitHorizontal, Wand2 } from 'lucide-react';
import type { LogMessage, PotentialMap } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const HexViewer = ({ buffer, highlightAddress, onAddressClick }: { 
    buffer: ArrayBuffer | null;
    highlightAddress: number | null;
    onAddressClick: (address: number) => void;
}) => {
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

  const handleCellClick = (lineAddress: number, byteIndex: number) => {
      onAddressClick(lineAddress + byteIndex);
  };

  return (
    <ScrollArea className="h-full w-full bg-background border rounded-lg">
      <div className="p-2 font-mono text-xs">
        <div className="flex sticky top-0 bg-muted z-10">
            <span className="text-muted-foreground w-20 shrink-0">Endereço</span>
            <span className="flex-1 text-muted-foreground">00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F</span>
            <span className="text-muted-foreground w-20 shrink-0 text-center">ASCII</span>
        </div>
        {hexValues.map(line => {
          const isHighlighted = highlightAddress !== null && line.address <= highlightAddress && highlightAddress < line.address + bytesPerLine;
          return (
            <div key={line.address} ref={isHighlighted ? highlightRef : null} className={`flex hover:bg-muted/50 ${isHighlighted ? 'bg-primary/20 rounded' : ''}`}>
              <span className="text-muted-foreground w-20 shrink-0 py-0.5">0x{line.address.toString(16).padStart(8, '0')}</span>
              <span className="flex-1 text-foreground whitespace-pre cursor-pointer py-0.5" onClick={() => handleCellClick(line.address, 0)}>
                {line.hex.split(' ').map((hexByte, index) => (
                    <span key={index} onClick={(e) => { e.stopPropagation(); handleCellClick(line.address, index); }} className="px-[1px] hover:bg-primary/30 rounded">{hexByte}</span>
                )).reduce((prev, curr) => <>{prev}{' '}{curr}</>)}
              </span>
              <span className="text-muted-foreground w-20 shrink-0 text-center py-0.5">{line.ascii}</span>
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
}

export default function MapScanner({ binFile, onLoadMap, addLog }: MapScannerProps) {
    
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const [mapDefinition, setMapDefinition] = useState({
        address: '0x0',
        rows: '16',
        cols: '16',
        dataType: '8-bit',
    });

    const handleAddressClick = (address: number) => {
        setMapDefinition(def => ({ ...def, address: `0x${address.toString(16)}` }));
    };

    const handleCreateMap = useCallback(() => {
        if (!binFile) {
            toast({ title: "Ficheiro BIN não carregado", variant: "destructive" });
            return;
        }

        setIsLoading(true);

        try {
            const address = parseInt(mapDefinition.address, 16);
            const rows = parseInt(mapDefinition.rows, 10);
            const cols = parseInt(mapDefinition.cols, 10);

            if (isNaN(address) || isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
                 toast({ title: "Definição Inválida", description: "Verifique os valores de endereço, linhas e colunas.", variant: "destructive" });
                 return;
            }
            
            const dataSize = mapDefinition.dataType.includes('16') ? 2 : 1;
            const isBigEndian = mapDefinition.dataType.includes('BE');
            
            if (address + (rows * cols * dataSize) > binFile.buffer.byteLength) {
                toast({ title: "Mapa Fora dos Limites", description: "A definição do mapa excede o tamanho do ficheiro.", variant: "destructive" });
                return;
            }

            const potentialMap: PotentialMap = {
                address,
                rows,
                cols,
                dataSize,
                isBigEndian,
                confidence: 1.0, // Manual definition is always 100% confidence
                suggestion: `Manual @ 0x${address.toString(16).toUpperCase()}`,
                dataType: `${dataSize * 8}-bit${dataSize > 1 ? (isBigEndian ? ' BE' : ' LE') : ''}`,
                equation: 'x', // Default equation
                xAxisAddress: undefined,
                yAxisAddress: undefined,
                xAxisType: 'Desconhecido',
                yAxisType: 'Desconhecido',
            };
            
            onLoadMap(potentialMap);
            toast({ title: "Mapa Criado", description: `Mapa ${rows}x${cols} em 0x${address.toString(16).toUpperCase()} carregado para análise.` });

        } catch (error) {
             const msg = `Erro ao criar mapa: ${(error as Error).message}`;
             addLog(msg, 'error');
             toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [binFile, mapDefinition, onLoadMap, toast, addLog]);

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
        <div className="flex flex-col h-full gap-4">
             <Card className="shrink-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MapPinned /> Definição Manual de Mapa</CardTitle>
                    <CardDescription>
                    Clique num endereço no visualizador hexadecimal abaixo ou insira-o manualmente. Defina as dimensões e o tipo de dados para criar e carregar um mapa para análise.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-end gap-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                             <div className="space-y-1.5">
                                <Label htmlFor="map-address">Endereço do Mapa</Label>
                                <Input id="map-address" value={mapDefinition.address} onChange={e => setMapDefinition(c => ({...c, address: e.target.value}))} disabled={isLoading} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="map-rows">Linhas</Label>
                                <Input id="map-rows" type="number" value={mapDefinition.rows} onChange={e => setMapDefinition(c => ({...c, rows: e.target.value}))} disabled={isLoading} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="map-cols">Colunas</Label>
                                <Input id="map-cols" type="number" value={mapDefinition.cols} onChange={e => setMapDefinition(c => ({...c, cols: e.target.value}))} disabled={isLoading} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="map-datatype">Tipo de Dados</Label>
                                <Select value={mapDefinition.dataType} onValueChange={v => setMapDefinition(c => ({...c, dataType: v}))} disabled={isLoading}>
                                    <SelectTrigger id="map-datatype">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8-bit">8-bit</SelectItem>
                                        <SelectItem value="16-bit LE">16-bit (Little Endian)</SelectItem>
                                        <SelectItem value="16-bit BE">16-bit (Big Endian)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button onClick={handleCreateMap} disabled={isLoading} className="w-full sm:w-auto">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DownloadCloud className="mr-2 h-4 w-4" />}
                            {isLoading ? 'A Carregar...' : 'Criar e Carregar Mapa'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex-1 min-h-[300px]">
                 <HexViewer 
                    buffer={binFile?.buffer ?? null} 
                    highlightAddress={parseInt(mapDefinition.address, 16)} 
                    onAddressClick={handleAddressClick}
                />
            </div>
        </div>
    );
}

