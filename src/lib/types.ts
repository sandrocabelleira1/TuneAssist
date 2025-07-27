export type AxisDataState = {
  label: string;
  raw: number[];
  calculated: (string | number)[];
  originalIndices: number[];
};

export type AxisDimension = {
  count: number;
  label: string;
  address?: number | null;
  dataSize?: number;
  stride?: number;
  isBigEndian?: boolean;
  equation?: string;
  decimalpl?: number;
  values?: (string | number)[];
};

export type AxisDefinition = {
  node: Element | null;
  count: number;
  label: string;
  address?: number | null;
  dataSize?: number;
  stride?: number;
  isBigEndian?: boolean;
  equation?: string;
  decimalpl?: number;
  values?: (string | number)[]; // To hold explicit values from <LABEL> tags
} | null;

export type XDFDefinition = {
  name:string;
  address: number;
  rows: number;
  cols: number;
  dataSize: number; // in bytes
  colStrideBytes: number;
  rowStrideBytes: number;
  dataOrganization: 'ROW_MAJOR' | 'COL_MAJOR';
  isBigEndian: boolean;
  equation: string;
  decimalpl: number;
  xAxisDef: AxisDimension;
  yAxisDef: AxisDimension;
  isPotential?: boolean;
};

export type LogMessage = {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'debug';
};

export type MapData = (number | null)[][];
