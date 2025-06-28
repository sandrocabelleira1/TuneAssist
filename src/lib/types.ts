export type AxisDefinition = {
  address: number | null;
  count: number;
  dataSize: number;
  isBigEndian: boolean;
  equation: string;
  label: string;
  staticLabels?: (string | number)[];
} | null;

export type XDFDefinition = {
  name:string;
  address: number;
  rows: number;
  cols: number;
  dataSize: number;
  isBigEndian: boolean;
  equation: string;
  xAxisDef: AxisDefinition;
  yAxisDef: AxisDefinition;
};

export type LogMessage = {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'debug';
};

export type MapData = (number | null)[][];

export type OriginalSortOrder = {
  x: { value: string | number; index: number }[];
  y: { value: string | number; index: number }[];
};
