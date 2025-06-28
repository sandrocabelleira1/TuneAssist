import { z } from 'zod';

export const GenerateManualContentInputSchema = z.object({
  title: z.string().describe('The title of the manual.'),
  brand: z.string().describe('The brand of the motorcycle.'),
  model: z.string().describe('The model of the motorcycle.'),
  year: z.number().describe('The year of the motorcycle.'),
});
export type GenerateManualContentInput = z.infer<typeof GenerateManualContentInputSchema>;


export const GenerateManualContentOutputSchema = z.object({
  content: z.string().describe('The generated content of the manual, formatted with Markdown.'),
});
export type GenerateManualContentOutput = z.infer<typeof GenerateManualContentOutputSchema>;

export const ValidateMapTypeInputSchema = z.object({
    mapName: z.string().describe('O nome do mapa, conforme definido no ficheiro XDF.'),
    mapData: z.array(z.array(z.number().nullable())).describe('Os dados 2D do mapa.'),
    xAxis: z.array(z.number()).describe('Os valores do eixo X (horizontal).'),
    yAxis: z.array(z.number()).describe('Os valores do eixo Y (vertical).'),
});
export type ValidateMapTypeInput = z.infer<typeof ValidateMapTypeInputSchema>;

export const ValidateMapTypeOutputSchema = z.object({
    confidence: z.enum(['Alta', 'Média', 'Baixa']).describe('O nível de confiança de que o nome do mapa corresponde aos dados.'),
    suspectedType: z.string().describe('O tipo de mapa que a IA suspeita que os dados representam.'),
    reasoning: z.string().describe('Uma explicação que justifica a conclusão da IA.'),
    suggestedEquation: z.string().optional().describe('(Opcional) A nova equação sugerida para os dados do mapa (eixo Z). Ex: "X / 655.35"'),
    suggestedXAxisEquation: z.string().optional().describe('(Opcional) A nova equação sugerida para o eixo X. Ex: "X / 10.23"'),
    suggestedYAxisEquation: z.string().optional().describe('(Opcional) A nova equação sugerida para o eixo Y.'),
});
export type ValidateMapTypeOutput = z.infer<typeof ValidateMapTypeOutputSchema>;

export const PotentialMapSchema = z.object({
  name: z.string().describe('A descriptive name for the map, e.g., "Mapa de Ignição 1" or "Tabela de Combustível 3".'),
  address: z.number().describe('The starting memory address of the map in decimal.'),
  rows: z.number().describe('The number of rows in the map grid.'),
  cols: z.number().describe('The number of columns in the map grid.'),
  dataSize: z.union([z.literal(1), z.literal(2)]).describe('The size of each data point in bytes (1 for 8-bit, 2 for 16-bit).'),
});

export const FindMapsInputSchema = z.object({
  binHexData: z.string().describe('A hexadecimal string representing the first 8192 bytes of the BIN file.'),
  existingMapNames: z.array(z.string()).optional().describe('An optional list of map names that have already been defined in an XDF, to avoid duplication.'),
});

export const FindMapsOutputSchema = z.object({
  maps: z.array(PotentialMapSchema),
});
export type FindMapsOutput = z.infer<typeof FindMapsOutputSchema>;
