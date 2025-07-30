
export type AxisDataState = {
  label: string;
  raw: number[];
  calculated: (string | number)[];
  originalIndices: number[];
};

export type AxisDimension = {
  isLinked?: boolean;
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


export type XDFDefinition = {
  uniqueId: string;
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
