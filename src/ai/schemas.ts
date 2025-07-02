import { z } from 'zod';

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
    suggestedEquation: z.string().optional().describe('Opcional. Uma equação matemática válida para os dados do mapa (eixo Z), usando "X" como variável. Ex: "X / 655.35". Omitir se não houver sugestão.'),
    suggestedXAxisEquation: z.string().optional().describe('Opcional. Uma equação matemática válida para o eixo X, usando "X" como variável. Ex: "X / 10.23". Omitir se não houver sugestão.'),
    suggestedYAxisEquation: z.string().optional().describe('Opcional. Uma equação matemática válida para o eixo Y, usando "X" como variável. Omitir se não houver sugestão.'),
});
export type ValidateMapTypeOutput = z.infer<typeof ValidateMapTypeOutputSchema>;

export const PotentialMapSchema = z.object({
  name: z.string().describe('A descriptive name for the map, e.g., "Mapa de Ignição 1" or "Tabela de Combustível 3".'),
  address: z.number().describe('The starting memory address of the map in decimal.'),
  rows: z.number().describe('The number of rows in the map grid.'),
  cols: z.number().describe('The number of columns in the map grid.'),
  dataSize: z.number().int().describe('The size of each data point in bytes (must be 1 for 8-bit or 2 for 16-bit).'),
});

export const ExistingMapSchema = z.object({
  name: z.string(),
  address: z.number(),
});

export const FindMapsInputSchema = z.object({
  binHexData: z.string().describe('A hexadecimal string representing the first 8192 bytes of the BIN file.'),
  brand: z.string().optional().describe('The brand of the ECU (e.g., Yamaha, Honda). This helps in identifying common map types for that brand.'),
  existingMaps: z.array(ExistingMapSchema).optional().describe('An optional list of maps that have already been defined in an XDF, to avoid duplication.'),
});

export const FindMapsOutputSchema = z.object({
  maps: z.array(PotentialMapSchema),
  analysis: z.string().optional().describe("An analysis of the scan, especially if no maps are found. Explains why, e.g., data seems encrypted or unstructured."),
});
export type FindMapsOutput = z.infer<typeof FindMapsOutputSchema>;
