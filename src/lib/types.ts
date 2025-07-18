export type AxisDataState = {
  raw: number[];
  calculated: (string | number)[];
};

export type AxisDefinition = {
  // This is a direct reference to the <XDFAXIS> DOM element during parsing.
  // It's a temporary structure and not stored long-term.
  node: Element | null;
  count: number;
  label: string;
  // These are added after parsing for use in the app
  address?: number | null;
  dataSize?: number;
  isBigEndian?: boolean;
  equation?: string;
  equationVar?: string;
  majorStride?: number; 
  minorStride?: number;
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
  equationVar: string;
  xAxisDef: AxisDefinition;
  yAxisDef: AxisDefinition;
  isPotential?: boolean;
  majorStride: number; // in bytes
  minorStride: number; // in bytes
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

    
