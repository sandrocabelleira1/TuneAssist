
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseXDF, readAndCalculateMapFromBin, generateChecksum, writeMapToBin, recalculateRawMapFromCalculated, getCellAddress } from '@/lib/ecu';
import type { XDFDefinition, MapData, AxisDataState, LogMessage } from '@/lib/types';
import { getHeatmapColor } from '@/lib/colors';
import './styles.css';

// Componente para uma célula editável da tabela
function EditableMapCell({ value, onCellChange, address }: { value: number | null, onCellChange: (newValue: number) => void, address: number | null }) {
    const [isEditing, setIsEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState(value !== null ? String(value) : '');

    useEffect(() => {
        setCurrentValue(value !== null ? String(value) : '');
    }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        const newValue = parseFloat(currentValue);
        if (!isNaN(newValue)) {
            onCellChange(newValue);
        } else {
            setCurrentValue(value !== null ? String(value) : ''); // Reverte se inválido
        }
    };

    if (isEditing) {
        return (
            <input
                type="text"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                autoFocus
                className="w-full h-full text-center bg-gray-600 text-white border-none"
            />
        );
    }

    return (
        <div 
            onClick={() => setIsEditing(true)} 
            className="w-full h-full flex items-center justify-center cursor-pointer"
            title={address !== null ? `Endereço: 0x${address.toString(16).toUpperCase()}`: ''}
        >
            {value !== null ? value.toFixed(2) : '-'}
        </div>
    );
}

// Componente principal da aplicação
export default function EcuTuningPage() {
    const [binFile, setBinFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
    const [xdfFile, setXdfFile] = useState<{ name: string; definitions: XDFDefinition[] } | null>(null);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [debugMode, setDebugMode] = useState(false);
    const [selectedMapName, setSelectedMapName] = useState<string>('');
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [axes, setAxes] = useState<{ x: AxisDataState, y: AxisDataState } | null>(null);
    const [isManualLogModalOpen, setIsManualLogModalOpen] = useState(false);
    const [isEditAxesModalOpen, setIsEditAxesModalOpen] = useState(false);
    const [manualLogEntries, setManualLogEntries] = useState([{ rpm: '', load: '', afr: '' }]);

    const binInputRef = useRef<HTMLInputElement>(null);
    const xdfInputRef = useRef<HTMLInputElement>(null);
    
    const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
        const id = `${Date.now()}`;
        setLogs(prev => [...prev, { id, timestamp: new Date().toLocaleTimeString(), message, type }]);
    }, []);
    
    const visibleLogs = logs.filter(log => debugMode || log.type !== 'debug');

    const selectedMapDefinition = xdfFile?.definitions.find(def => def.name === selectedMapName);

    // Manipuladores de ficheiros
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'bin' | 'xdf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const buffer = event.target?.result;
            if (!buffer) {
                addLog(`Erro ao ler o ficheiro ${file.name}`, 'error');
                return;
            }

            if (type === 'bin' && buffer instanceof ArrayBuffer) {
                setBinFile({ name: file.name, buffer });
                (document.getElementById('binFileName') as HTMLElement).textContent = file.name;
                addLog(`Ficheiro BIN carregado: ${file.name}`, 'success');
            } else if (type === 'xdf' && typeof buffer === 'string') {
                 try {
                    const { definitions } = parseXDF(buffer);
                    if (definitions.length === 0) throw new Error("Nenhuma definição de mapa válida encontrada no XDF.");
                    setXdfFile({ name: file.name, definitions });
                    (document.getElementById('xdfFileName') as HTMLElement).textContent = file.name;
                    addLog(`Ficheiro XDF carregado: ${file.name} com ${definitions.length} mapas.`, 'success');
                 } catch (error) {
                    addLog(`Erro ao processar o XDF: ${(error as Error).message}`, 'error');
                 }
            }
        };
        
        if (type === 'xdf') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    };

    // Efeito para atualizar o seletor de mapas
    useEffect(() => {
        const selector = document.getElementById('mapSelector') as HTMLSelectElement;
        if (binFile && xdfFile) {
            selector.disabled = false;
            selector.innerHTML = '<option value="">Selecione um mapa</option>';
            xdfFile.definitions.forEach(def => {
                const option = document.createElement('option');
                option.value = def.name;
                option.textContent = def.name;
                selector.appendChild(option);
            });
        } else {
            selector.disabled = true;
            selector.innerHTML = '<option>Carregue BIN e XDF</option>';
        }
    }, [binFile, xdfFile]);

    // Manipulador para seleção de mapa
    const handleMapSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        setSelectedMapName(name);
        if (name && binFile && xdfFile) {
            const def = xdfFile.definitions.find(d => d.name === name);
            if (def) {
                try {
                    const { calculatedMap, sortedAxes } = readAndCalculateMapFromBin(binFile.buffer, def);
                    setMapData(calculatedMap);
                    setAxes(sortedAxes);
                    addLog(`Mapa carregado: ${name}`, 'info');
                } catch (error) {
                    addLog(`Erro ao ler o mapa do BIN: ${(error as Error).message}`, 'error');
                    setMapData(null);
                    setAxes(null);
                }
            }
        } else {
            setMapData(null);
            setAxes(null);
        }
    };
    
    // Habilitar/desabilitar botões com base no estado
    useEffect(() => {
        const mapSelected = !!(selectedMapName && mapData);
        (document.getElementById('editAxesButton') as HTMLButtonElement).disabled = !mapSelected;
        (document.getElementById('manualLogButton') as HTMLButtonElement).disabled = !mapSelected;
        (document.getElementById('analyzeButton') as HTMLButtonElement).disabled = !mapSelected;
        (document.getElementById('saveButton') as HTMLButtonElement).disabled = !mapSelected;
    }, [selectedMapName, mapData]);

    const handleCellChange = (rowIndex: number, colIndex: number, newValue: number) => {
        if (!mapData) return;
        const newMapData = mapData.map(row => [...row]);
        newMapData[rowIndex][colIndex] = newValue;
        setMapData(newMapData);
        addLog(`Célula [${rowIndex}, ${colIndex}] alterada para ${newValue.toFixed(2)}`, 'debug');
    };
    
    const handleAddLogEntry = () => {
        setManualLogEntries([...manualLogEntries, { rpm: '', load: '', afr: '' }]);
    };
    
    const handleLogEntryChange = (index: number, field: string, value: string) => {
        const newEntries = [...manualLogEntries];
        newEntries[index] = {...newEntries[index], [field]: value };
        setManualLogEntries(newEntries);
    };

    return (
        <div className="bg-gray-900 text-gray-300 min-h-screen p-4 sm:p-6 md:p-8 font-sans">
            <h1 className="text-3xl font-bold text-white mb-2 text-center">TuneAssist AI</h1>
            <p className="text-center text-gray-400 mb-8">Assistente de Afinação de ECU Potenciado por IA</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-gray-800 p-6 rounded-lg shadow-xl">
                    <h2 className="text-xl font-bold text-white mb-6 border-b border-gray-600 pb-3">Painel de Controlo</h2>

                    <div className="mb-6">
                        <h3 className="font-semibold text-lg text-blue-400 mb-3">1. Carregar Ficheiros</h3>
                        <div className="space-y-4">
                            <div>
                               <label htmlFor="binFile" className="file-input-label" onClick={() => binInputRef.current?.click()}>
                                    <span className="font-bold">Carregar .BIN</span>
                                    <span className="block text-xs text-gray-400 mt-1" id="binFileName">Nenhum ficheiro selecionado</span>
                               </label>
                               <input ref={binInputRef} type="file" id="binFile" accept=".bin" className="hidden" onChange={(e) => handleFileChange(e, 'bin')} />
                            </div>
                             <div>
                               <label htmlFor="xdfFile" className="file-input-label" onClick={() => xdfInputRef.current?.click()}>
                                    <span className="font-bold">Carregar .XDF</span>
                                    <span className="block text-xs text-gray-400 mt-1" id="xdfFileName">Nenhum ficheiro selecionado</span>
                               </label>
                               <input ref={xdfInputRef} type="file" id="xdfFile" accept=".xdf" className="hidden" onChange={(e) => handleFileChange(e, 'xdf')} />
                            </div>
                        </div>
                    </div>
                    
                     <div className="mb-6">
                        <h3 className="font-semibold text-lg text-blue-400 mb-3">2. Selecionar Mapa</h3>
                         <select id="mapSelector" className="w-full bg-gray-700 text-white p-2 rounded-md disabled:opacity-50" disabled onChange={handleMapSelect} value={selectedMapName}>
                            <option value="">Carregue BIN e XDF</option>
                        </select>
                    </div>

                    <div className="mb-6">
                         <h3 className="font-semibold text-lg text-blue-400 mb-3">3. Ações e Dados de Ensaio</h3>
                         <div className="space-y-4">
                            <button id="editAxesButton" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-all disabled:bg-gray-500 disabled:cursor-not-allowed" disabled onClick={() => setIsEditAxesModalOpen(true)}>
                                Editar Eixos da Tabela
                            </button>
                            <button id="manualLogButton" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-md transition-all disabled:bg-gray-500 disabled:cursor-not-allowed" disabled onClick={() => setIsManualLogModalOpen(true)}>
                                Adicionar Dados do Ensaio
                            </button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <h3 className="font-semibold text-lg text-blue-400 mb-3">4. Parâmetros e Ações</h3>
                         <div className="space-y-4">
                            <div>
                                <label htmlFor="aggressiveness" className="block mb-2 text-sm font-medium">Agressividade da Correção: <span id="aggressivenessValue" className="font-bold text-blue-400">20%</span></label>
                                <input type="range" id="aggressiveness" min="1" max="100" defaultValue="20" className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb" onChange={(e) => {
                                    (document.getElementById('aggressivenessValue') as HTMLElement).textContent = `${e.target.value}%`;
                                }}/>
                            </div>
                            <button id="analyzeButton" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-all disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>Analisar e Gerar Mapa</button>
                            <button id="saveButton" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-all disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>Salvar Novo .BIN</button>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-3">
                             <h3 className="font-semibold text-lg text-blue-400">Log de Operações</h3>
                             <label className="flex items-center text-sm cursor-pointer">
                                <input type="checkbox" id="debugMode" className="debug-checkbox mr-2" checked={debugMode} onChange={(e) => setDebugMode(e.target.checked)} />
                                Modo de Depuração
                             </label>
                        </div>
                        <div id="logPanel" className="log-panel">
                             {visibleLogs.length > 0 ? visibleLogs.map(log => (
                                <div key={log.id} className={`log-entry ${log.type}`}>
                                    <span className="timestamp">{log.timestamp}</span>
                                    <span className="message">{log.message}</span>
                                </div>
                             )).reverse() : 'Aguardando ações do utilizador...'}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-gray-800 p-6 rounded-lg shadow-xl min-h-[70vh]">
                     <div id="mapContainer" className="map-container-wrapper">
                        {mapData && axes && selectedMapDefinition ? (
                             <div className="overflow-auto h-full">
                                <table className="w-full border-collapse text-xs">
                                    <thead>
                                        <tr>
                                            <th className="sticky top-0 left-0 z-20 bg-gray-700 p-2 border border-gray-600 text-left">
                                                {selectedMapDefinition.yAxisDef.label} \ {selectedMapDefinition.xAxisDef.label}
                                            </th>
                                            {axes.x.calculated.map((x, i) => <th key={i} className="sticky top-0 bg-gray-700 p-2 border border-gray-600">{typeof x === 'number' ? x.toFixed(0) : x}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {axes.y.calculated.map((y, yi) => (
                                            <tr key={yi}>
                                                <td className="sticky left-0 bg-gray-700 p-2 border border-gray-600 font-bold">{typeof y === 'number' ? y.toFixed(0) : y}</td>
                                                {mapData[yi].map((cell, xi) => {
                                                    const address = getCellAddress(selectedMapDefinition, yi, xi);
                                                    return (
                                                      <td key={xi} className="p-0 border border-gray-600 text-center" style={{ backgroundColor: getHeatmapColor(cell, Math.min(...mapData.flat().filter(v => v !== null) as number[]), Math.max(...mapData.flat().filter(v => v !== null) as number[])) }}>
                                                        <EditableMapCell value={cell} onCellChange={(newValue) => handleCellChange(yi, xi, newValue)} address={address} />
                                                      </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                <p>Carregue os ficheiros .BIN e .XDF para começar.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Modal de Entrada Manual */}
            {isManualLogModalOpen && (
                 <div id="manualLogModal" className="modal-backdrop">
                    <div className="modal-content">
                        <h3 className="text-xl font-bold text-white mb-4">Entrada Manual de Dados de Ensaio</h3>
                        <p className="text-gray-400 mb-6">Adicione os pontos do seu ensaio para o ajuste automático.</p>
                        <div id="manualLogEntries" className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {manualLogEntries.map((entry, index) => (
                                <div key={index} className="grid grid-cols-3 gap-2">
                                    <input type="number" placeholder="RPM" value={entry.rpm} onChange={(e) => handleLogEntryChange(index, 'rpm', e.target.value)} className="textarea-dark" />
                                    <input type="number" placeholder="Carga" value={entry.load} onChange={(e) => handleLogEntryChange(index, 'load', e.target.value)} className="textarea-dark" />
                                    <input type="number" placeholder="AFR" value={entry.afr} onChange={(e) => handleLogEntryChange(index, 'afr', e.target.value)} className="textarea-dark" />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4">
                            <button id="addLogEntry" className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold" onClick={handleAddLogEntry}>Adicionar Novo Ponto</button>
                        </div>
                         <div className="mt-8 flex justify-end space-x-4">
                             <button id="cancelManualLog" className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white font-semibold" onClick={() => setIsManualLogModalOpen(false)}>Cancelar</button>
                             <button id="confirmManualLog" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold" onClick={() => setIsManualLogModalOpen(false)}>Concluir e Usar Dados</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Modal de Edição de Eixos */}
             {isEditAxesModalOpen && (
                 <div id="editAxesModal" className="modal-backdrop">
                    <div className="modal-content">
                        <h3 className="text-xl font-bold text-white mb-4">Editar Eixos da Tabela</h3>
                        <p className="text-gray-400 mb-6">Insira os valores corretos para os eixos, separados por vírgulas.</p>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="yAxisText" className="block mb-2 text-sm font-medium text-gray-300">Eixo Y (RPM)</label>
                                <textarea id="yAxisText" rows="4" className="textarea-dark" defaultValue={axes?.y.calculated.join(', ')}></textarea>
                            </div>
                            <div>
                                <label htmlFor="xAxisText" className="block mb-2 text-sm font-medium text-gray-300">Eixo X (Carga/TPS)</label>
                                 <textarea id="xAxisText" rows="4" className="textarea-dark" defaultValue={axes?.x.calculated.join(', ')}></textarea>
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-4">
                             <button id="cancelAxesEdit" className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white font-semibold" onClick={() => setIsEditAxesModalOpen(false)}>Cancelar</button>
                             <button id="confirmAxesEdit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold" onClick={() => setIsEditAxesModalOpen(false)}>Salvar Eixos</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
