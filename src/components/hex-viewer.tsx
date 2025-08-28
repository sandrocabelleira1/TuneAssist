
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';

const BYTES_PER_LINE = 16;
const ROW_HEIGHT = 20; // Estimated height of a row in pixels

interface HexViewerProps {
    fileBuffer: ArrayBuffer | null;
    onAddressSelect?: (address: number) => void;
}

export const HexViewer = ({ fileBuffer, onAddressSelect }: HexViewerProps) => {
    const [cursorPosition, setCursorPosition] = useState<{ offset: number; value: number | null }>({ offset: -1, value: null });
    const [numRows, setNumRows] = useState(0);
    const [visibleRows, setVisibleRows] = useState({ start: 0, end: 50 }); // Render 50 rows at a time
    
    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (fileBuffer) {
            setNumRows(Math.ceil(fileBuffer.byteLength / BYTES_PER_LINE));
        } else {
            setNumRows(0);
        }
        // Reset visible rows when file changes
        setVisibleRows({ start: 0, end: 50 });
        setCursorPosition({ offset: -1, value: null });
    }, [fileBuffer]);
    
    const handleScroll = useCallback(() => {
        if (!viewportRef.current || !fileBuffer) return;
        
        const { scrollTop, clientHeight } = viewportRef.current;
        const start = Math.floor(scrollTop / ROW_HEIGHT);
        const end = start + Math.ceil(clientHeight / ROW_HEIGHT) + 5; // Add a buffer
        
        setVisibleRows(prev => {
            if (start !== prev.start || end !== prev.end) {
                return { start: Math.max(0, start), end: Math.min(numRows, end) };
            }
            return prev;
        });
    }, [fileBuffer, numRows]);

    const handleAddressClick = (address: number) => {
        if (onAddressSelect) {
            onAddressSelect(address);
        }
    };

    const renderRow = (rowIndex: number) => {
        if (!fileBuffer) return null;

        const startOffset = rowIndex * BYTES_PER_LINE;
        if (startOffset >= fileBuffer.byteLength) return null;

        const endOffset = Math.min(startOffset + BYTES_PER_LINE, fileBuffer.byteLength);
        const rowBytes = new Uint8Array(fileBuffer.slice(startOffset, endOffset));

        return (
            <div key={startOffset} className="flex font-mono text-xs h-[20px]">
                <div 
                    className="w-20 text-muted-foreground pr-4 text-right shrink-0 cursor-pointer hover:text-primary"
                    onClick={() => handleAddressClick(startOffset)}
                    title={`Clique para selecionar o endereço 0x${startOffset.toString(16).toUpperCase()}`}
                >
                    {startOffset.toString(16).toUpperCase().padStart(8, '0')}
                </div>
                <div className="flex flex-1">
                    {Array.from({ length: BYTES_PER_LINE }).map((_, i) => {
                        const currentOffset = startOffset + i;
                        const byte = i < rowBytes.length ? rowBytes[i] : null;
                        const isCursorOn = cursorPosition.offset === currentOffset;
                        
                        return (
                            <span 
                                key={i}
                                onMouseEnter={() => setCursorPosition({ offset: currentOffset, value: byte })}
                                className={cn('w-7 text-center shrink-0', {
                                    'bg-primary/20': isCursorOn,
                                    'text-muted-foreground': byte === null
                                })}
                            >
                                {byte !== null ? byte.toString(16).toUpperCase().padStart(2, '0') : '--'}
                            </span>
                        );
                    })}
                </div>
                <div className="w-40 pl-4 shrink-0">
                     {Array.from({ length: BYTES_PER_LINE }).map((_, i) => {
                        const byte = i < rowBytes.length ? rowBytes[i] : null;
                        return (
                            <span key={i} className={cn('shrink-0', {'text-muted-foreground': byte === null})}>
                                {byte !== null ? (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.') : ' '}
                            </span>
                        );
                     })}
                </div>
            </div>
        );
    };

    if (!fileBuffer) {
        return <div className="text-muted-foreground text-center p-4">Carregue um ficheiro .BIN para começar.</div>;
    }

    return (
        <div className="h-full w-full flex flex-col border rounded-lg bg-card text-card-foreground">
            <div className="flex-shrink-0 p-2 border-b text-xs font-semibold">
                <div className="flex">
                    <div className="w-20 pr-4 text-right text-muted-foreground shrink-0">Endereço</div>
                    <div className="flex-1 text-muted-foreground">00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F</div>
                    <div className="w-40 pl-4 text-muted-foreground shrink-0">ASCII</div>
                </div>
            </div>
             <div className="flex-1 min-h-0 relative">
                 <ScrollArea className="h-full" viewportRef={viewportRef} onScroll={handleScroll}>
                    <div style={{ height: `${numRows * ROW_HEIGHT}px`, position: 'relative' }}>
                         {Array.from({ length: visibleRows.end - visibleRows.start }).map((_, i) => (
                           <div 
                             key={visibleRows.start + i} 
                             style={{
                               position: 'absolute',
                               top: `${(visibleRows.start + i) * ROW_HEIGHT}px`,
                               width: '100%',
                               height: `${ROW_HEIGHT}px`,
                             }}
                           >
                               {renderRow(visibleRows.start + i)}
                           </div>
                        ))}
                    </div>
                </ScrollArea>
             </div>
            <div className="flex-shrink-0 p-2 border-t text-xs text-muted-foreground font-mono">
                {cursorPosition.offset !== -1 && cursorPosition.value !== null && (
                    <span>
                        Endereço: 0x{cursorPosition.offset.toString(16).toUpperCase().padStart(8, '0')} | Valor: 0x{cursorPosition.value?.toString(16).toUpperCase().padStart(2, '0')} ({cursorPosition.value})
                    </span>
                )}
            </div>
        </div>
    );
};
