
'use client';

import React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LogDataTableProps {
  data: any[];
  className?: string;
}

export default function LogDataTable({ data, className }: LogDataTableProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const headers = Object.keys(data[0]);

  return (
    <div className={cn("w-full h-full", className)}>
        <ScrollArea className="h-full w-full rounded-md border">
            <Table>
                <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                    {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                    ))}
                </TableRow>
                </TableHeader>
                <TableBody>
                {data.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                    {headers.map((header, cellIndex) => {
                        const cellValue = row[header];
                        return (
                        <TableCell key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap">
                            {typeof cellValue === 'number' ? cellValue.toFixed(2) : String(cellValue ?? '')}
                        </TableCell>
                        );
                    })}
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </ScrollArea>
    </div>
  );
}
