

import { z } from 'zod';

// This is a placeholder as the actual schema is gone.
export const AiFuelSuggestionSchema = z.object({
  reasoning: z.string(),
  changes: z.array(z.object({
    y: z.number(),
    x: z.number(),
    newValue: z.number(),
  })),
});


export type AiFuelSuggestion = z.infer<typeof AiFuelSuggestionSchema>;

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string | AiFuelSuggestion;
};


export type AxisData = {
  label: string;
  raw: (number|string)[];
  calculated: (string | number)[];
  address: number | null;
  originalIndices: number[]; // To map sorted back to original
};

export type AxisDimension = {
  label: string;
  count: number;
  address?: number;
  dataSize?: number;
  isBigEndian?: boolean;
  equation?: string;
  decimalpl?: number;
  values?: (string | number)[]; // For hardcoded labels
  requiresSort: boolean;
};

export type XDFinition = {
  uniqueId: string;
  name:string;
  address: number;
  rows: number;
  cols: number;
  dataSize: number; // in bytes
  isBigEndian: boolean;
  isRowMajor: boolean;
  equation: string;
  decimalpl: number;
  xAxisDef: AxisDimension;
  yAxisDef: AxisDimension;
  rowStride?: number;
};

export type LogMessage = {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'debug';
};

export type MapData = (number | null)[][];

export type ProcessedMap = {
  calculatedMap: MapData | null; 
  rawMap: MapData | null;
  addresses: MapData | null;
  axes: {
    x: AxisData;
    y: AxisData;
  }
} | null;

export type ManualAxisConfig = {
  x: { equation: string, stride?: number };
  y: { equation: string, stride?: number };
  z: { equation: string, stride?: number, rowStride?: number };
  isBigEndian: boolean | null;
  sortX?: boolean;
  sortY?: boolean;
};

export type PlotOrientation = 'y-vs-x' | 'x-vs-y';

export type ModifiedCell = {
  y: number;
  x: number;
};

export type ChartPoint = {
    x: number;
    y: number | null;
    originalIndex: number;
};

export type IgnitionTimingPoint = {
    id: string;
    rpm: string;
    time: string;
    torque: string;
    advance: string;
};

export type IgnitionTimingRun = {
    base: IgnitionTimingPoint[];
    modified: IgnitionTimingPoint[];
}

export type ScanConfig = {
    minSize: number;
    maxSize: number;
    dataType: '8-bit' | '16-bit LE' | '16-bit BE';
    // These are set internally based on dataType
    dataSize?: number; 
    isBigEndian?: boolean;
}


export type PotentialMap = {
    name?: string;
    address: number;
    rows: number;
    cols: number;
    dataSize: number;
    isBigEndian: boolean;
    confidence: number; // A score from 0 to 1
    suggestion: string;
    dataType: string;
    equation: string;
    rowStride?: number;
    previewData?: number[][]; // For sparkline
    xAxisAddress?: number;
    yAxisAddress?: number;
    xAxisType: 'RPM' | 'Carga' | 'Desconhecido';
    yAxisType: 'RPM' | 'Carga' | 'Desconhecido';
}

export type FoundAxis = {
  id: string;
  address: number;
  length: number;
  type: 'RPM' | 'Carga';
  data: number[];
}

export type TemplateAnalysisConfig = {
    address: number;
    rows: number;
    cols: number;
    dataType: 'uint8' | 'uint16le' | 'uint16be';
    equation: string;
}

export interface DynoRunDataPoint {
  id: string;
  rpm: number;
  torque: number;
  power: number;
}

export interface DynoRun {
  id: string;
  name: string;
  data: DynoRunDataPoint[];
  color: string;
}

export interface BackupFile {
  id: string;
  name: string;
  storagePath: string;
  size: number;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
  userId: string;
}

export interface UserProfile {
    credits?: number;
    licenseExpiryDate?: string;
}
