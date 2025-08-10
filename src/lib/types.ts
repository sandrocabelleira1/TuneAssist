












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

export type PotentialMap = {
    address: number;
    rows: number;
    cols: number;
    dataSize: number;
    isBigEndian: boolean;
    confidence: number; // A score from 0 to 1
    suggestion: string;
    reason: string;
    dataType: string;
    equation: string;
    previewData?: number[][];
    xAxisAddress?: number;
    yAxisAddress?: number;
    xAxisType?: 'RPM' | 'Carga' | 'Desconhecido';
    yAxisType?: 'RPM' | 'Carga' | 'Desconhecido';
}

export type TemplateAnalysisConfig = {
    rows: number;
    cols: number;
    rpmMin: number;
    rpmMax: number;
    loadMin: number;
    loadMax: number;
    address: string | number; // hex string from input, number for processing
    dataLength: number; // in bytes
    dataType: 'uint8' | 'uint16le' | 'uint16be';
    equation: string;
}
