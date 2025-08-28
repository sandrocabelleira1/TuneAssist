

'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DownloadCloud, Settings, Play, Search, FolderDown } from 'lucide-react';
import type { PotentialMap, ScanConfig } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { readAndCalculateMapFromBinManual } from '@/lib/ecu';
import { XDFinition } from '@/lib/types';
import { HexViewer } from './hex-viewer';

const SurfacePlot3D = React.lazy(() => import('@/components/surface-plot'));
const LinePlot2D = React.lazy(() => import('@/components/line-plot'));


interface MapScannerProps {
    binFile: { name: string; buffer: ArrayBuffer } | null;
    onLoadMap: (map: PotentialMap) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
}

export default function MapScanner({ binFile, onLoadMap, addLog }: MapScannerProps) {
    const [scanConfig, setScanConfig] = useState<Omit<ScanConfig, 'dataSize' | 'isBigEndian'>>({
        rows: 16,
        cols: 20,
        dataType: '16-bit LE',
    });

    const [mapAddress, setMapAddress] = useState('');
    const [xAxisAddress, setXAxisAddress] = useState('');
    const [yAxisAddress, setYAxisAddress] = useState('');

    const [discoveredMap, setDiscoveredMap] = useState<any | null>(null);

    const { toast } = useToast();

    const handleAddressInput = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        const cleanValue = value.toLowerCase().startsWith('0x') ? value.substring(2) : value;
        setter(cleanValue.replace(/[^0-9a-f]/gi, ''));
    }

    const handleAddressSelectFromHex = useCallback((address: number) => {
        const hexAddress = address.toString(16);
        if (!mapAddress) {
            setMapAddress(hexAddress);
            toast({ title: "Endereço do Mapa Preenchido", description: `0x${hexAddress.toUpperCase()} foi definido como o endereço do mapa.` });
        } else if (!xAxisAddress) {
            setXAxisAddress(hexAddress);
            toast({ title: "Endereço do Eixo X Preenchido", description: `0x${hexAddress.toUpperCase()} foi definido como o endereço do eixo X.` });
        } else if (!yAxisAddress) {
            setYAxisAddress(hexAddress);
            toast({ title: "Endereço do Eixo Y Preenchido", description: `0x${hexAddress.toUpperCase()} foi definido como o endereço do eixo Y.` });
        } else {
             toast({ title: "Todos os campos preenchidos", description: "Considere limpar um campo se quiser selecionar um novo endereço.", variant: "default" });
        }
    }, [mapAddress, xAxisAddress, yAxisAddress, toast]);


    const handleDiscoverMap = () => {
        if (!binFile || !mapAddress) {
            toast({ title: "Dados Insuficientes", description: "É necessário carregar um ficheiro BIN e fornecer um endereço de mapa.", variant: "destructive" });
            return;
        }

        const mapAddr = parseInt(mapAddress, 16);
        if (isNaN(mapAddr)) {
            toast({ title: "Endereço Inválido", description: "O endereço do mapa não é um hexadecimal válido.", variant: "destructive" });
            return;
        }

        addLog(`A tentar descobrir o mapa em 0x${mapAddress.toUpperCase()}...`, 'info');

        try {
            const dataSize = scanConfig.dataType.includes('16') ? 2 : 1;
            const isBigEndian = scanConfig.dataType.includes('BE');

            const tempDef: XDFinition = {
                uniqueId: `scanner_${mapAddr}`,
                name: `Mapa Descoberto @ 0x${mapAddress.toUpperCase()}`,
                address: mapAddr,
                rows: scanConfig.rows,
                cols: scanConfig.cols,
                dataSize: dataSize,
                isBigEndian: isBigEndian,
                isRowMajor: true,
                equation: 'x',
                decimalpl: 2,
                xAxisDef: {
                    label: 'Eixo X',
                    count: scanConfig.cols,
                    requiresSort: false,
                    address: xAxisAddress ? parseInt(xAxisAddress, 16) : undefined,
                    dataSize,
                    isBigEndian
                },
                yAxisDef: {
                    label: 'Eixo Y',
                    count: scanConfig.rows,
                    requiresSort: false,
                    address: yAxisAddress ? parseInt(yAxisAddress, 16) : undefined,
                    dataSize,
                    isBigEndian
                }
            };

            const result = readAndCalculateMapFromBinManual(binFile.buffer, tempDef, {
                x: { equation: 'x' },
                y: { equation: 'x' },
                z: { equation: 'x' },
                isBigEndian: isBigEndian,
                sortX: false,
                sortY: false
            });

            setDiscoveredMap({
                ...result,
                definition: tempDef
            });

            addLog(`Mapa em 0x${mapAddress.toUpperCase()} lido com sucesso.`, 'success');

        } catch (error: any) {
            addLog(`Erro ao descobrir o mapa: ${error.message}`, 'error');
            toast({ title: "Erro na Descoberta", description: error.message, variant: "destructive" });
            setDiscoveredMap(null);
        }
    };
    
    const handlePromoteToMain = () => {
        if (!discoveredMap) return;

        const { definition } = discoveredMap;

        const potentialMap: PotentialMap = {
            name: definition.name,
            address: definition.address,
            rows: definition.rows,
            cols: definition.cols,
            dataSize: definition.dataSize,
            isBigEndian: definition.isBigEndian,
            equation: definition.equation,
            xAxisAddress: definition.xAxisDef.address,
            yAxisAddress: definition.yAxisDef.address,
            // These are unknown from this context, placeholder values
            confidence: 0.9, 
            suggestion: "Carregado do Scanner",
            dataType: scanConfig.dataType,
            xAxisType: 'Desconhecido',
            yAxisType: 'Desconhecido',
        };
        
        onLoadMap(potentialMap);
        addLog(`Mapa "${definition.name}" promovido para o painel principal.`, 'success');
    };

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
        <div className="flex h-full flex-col lg:flex-row gap-4">
            <div className="lg:w-1/3 flex flex-col gap-4">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings /> Configuração do Scanner</CardTitle>
                        <CardDescription>
                          Defina a estrutura do mapa que procura e os seus endereços (em hexadecimal). Clique num endereço no Hex Viewer para preencher os campos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                               <Label htmlFor="scan-rows">Linhas</Label>
                               <Input id="scan-rows" type="number" value={scanConfig.rows || ''} onChange={e => setScanConfig(c => ({...c, rows: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-2">
                               <Label htmlFor="scan-cols">Colunas</Label>
                               <Input id="scan-cols" type="number" value={scanConfig.cols || ''} onChange={e => setScanConfig(c => ({...c, cols: parseInt(e.target.value, 10) || 0}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="scan-type">Tipo Dados</Label>
                                <Select value={scanConfig.dataType} onValueChange={v => setScanConfig(d => ({...d, dataType: v as any}))}>
                                    <SelectTrigger id="scan-type"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8-bit">8-bit</SelectItem>
                                        <SelectItem value="16-bit LE">16-bit LE</SelectItem>
                                        <SelectItem value="16-bit BE">16-bit BE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="map-address">Endereço Mapa</Label>
                                <Input id="map-address" placeholder="ex: 1A2B3" value={mapAddress} onChange={e => handleAddressInput(setMapAddress, e.target.value)} />
                             </div>
                             <div className="space-y-2">
                                <Label htmlFor="xaxis-address">Endereço Eixo X</Label>
                                <Input id="xaxis-address" placeholder="Opcional" value={xAxisAddress} onChange={e => handleAddressInput(setXAxisAddress, e.target.value)} />
                             </div>
                             <div className="space-y-2">
                                <Label htmlFor="yaxis-address">Endereço Eixo Y</Label>
                                <Input id="yaxis-address" placeholder="Opcional" value={yAxisAddress} onChange={e => handleAddressInput(setYAxisAddress, e.target.value)} />
                             </div>
                        </div>

                        <div className="flex gap-2">
                             <Button onClick={handleDiscoverMap} className="flex-1">
                                <Search className="mr-2" /> Descobrir Mapa
                            </Button>
                            {discoveredMap && (
                                <Button onClick={handlePromoteToMain} variant="secondary" className="flex-1">
                                    <FolderDown className="mr-2" /> Carregar no Painel
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <div className="flex-1 min-h-[300px] lg:min-h-0">
                    <HexViewer fileBuffer={binFile.buffer} onAddressSelect={handleAddressSelectFromHex} />
                </div>
            </div>
             
            <div className="lg:w-2/3 flex-1 min-h-0">
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle>Visualização do Mapa Descoberto</CardTitle>
                        <CardDescription>
                            {discoveredMap ? `Visualizando mapa ${discoveredMap.definition.rows}x${discoveredMap.definition.cols} de 0x${discoveredMap.definition.address.toString(16).toUpperCase()}` : "A aguardar descoberta de mapa..."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0">
                        {discoveredMap ? (
                             <div className="h-full w-full">
                                <React.Suspense fallback={<div className="flex items-center justify-center h-full">A carregar gráfico...</div>}>
                                     <SurfacePlot3D
                                        mapData={discoveredMap.calculatedMap}
                                        xAxis={discoveredMap.axes.x.calculated}
                                        yAxis={discoveredMap.axes.y.calculated}
                                        xAxisLabel={discoveredMap.axes.x.label || 'Eixo X'}
                                        yAxisLabel={discoveredMap.axes.y.label || 'Eixo Y'}
                                        zAxisLabel={discoveredMap.definition.name || 'Mapa'}
                                    />
                                </React.Suspense>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-center">
                                <div>
                                    <p className="font-semibold">Nenhum mapa para exibir.</p>
                                    <p className="text-sm">Configure e clique em "Descobrir Mapa".</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
