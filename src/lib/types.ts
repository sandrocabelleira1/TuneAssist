



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
};

export type XDFDefinition = {
  uniqueId: string;
  name:string;
  address: number;
  rows: number;
  cols: number;
  dataSize: number; // in bytes
  isBigEndian: boolean;
  equation: string;
  decimalpl: number;
  xAxisDef: AxisDimension;
  yAxisDef: AxisDimension;
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
  axes: {
    x: AxisData;
    y: AxisData;
  }
} | null;

export type ManualAxisConfig = {
  x: { equation: string };
  y: { equation: string };
  z: { equation: string };
};



    