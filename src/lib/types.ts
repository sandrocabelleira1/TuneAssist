export type AxisDefinition = {
  address: number;
  count: number;
  dataSize: number;
  isBigEndian: boolean;
  equation: string;
  label: string;
} | null;

export type XDFDefinition = {
  name:string;
  address: number;
  rows: number;
  cols: number;
  dataSize: number;
  isBigEndian: boolean;
  equation: string;
  inverseEquation: string;
  xAxisDef: AxisDefinition;
  yAxisDef: AxisDefinition;
};

export type TestDataEntry = {
  rpm: number;
  carga: number;
  afr: number;
};

export type LogMessage = {
  id: number;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'debug';
};

export type MapData = (number | null)[][];

export type OriginalSortOrder = {
  x: { value: number; index: number }[];
  y: { value: number; index: number }[];
};
