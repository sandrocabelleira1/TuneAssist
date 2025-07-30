

export type AxisData = {
  label: string;
  raw: number[];
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
  calculatedMap: MapData; // The sorted and calculated map
  rawMap: MapData; // The original map as read from the BIN
  axes: {
    x: AxisData; // The sorted axis
    y: AxisData; // The sorted axis
  }
}
