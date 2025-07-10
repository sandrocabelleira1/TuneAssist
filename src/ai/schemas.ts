import { z } from 'zod';

export const ValidateMapTypeInputSchema = z.object({
    mapName: z.string().describe('O nome do mapa, conforme definido no ficheiro XDF.'),
    mapData: z.array(z.array(z.number().nullable())).describe('Os dados 2D do mapa.'),
    xAxis: z.array(z.number()).describe('Os valores do eixo X (horizontal).'),
    yAxis: z.array(z.number()).describe('Os valores do eixo Y (vertical).'),
    equation: z.string().optional().describe('A equação matemática atual para os dados do mapa (eixo Z). Ex: "X/128".'),
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
  name: z.string().describe('Um nome descritivo para o mapa, ex: "Mapa de Ignição 1" ou "Tabela de Combustível 3".'),
  address: z.number().describe('O endereço de memória inicial do mapa em decimal.'),
  rows: z.number().describe('O número de linhas na grelha do mapa.'),
  cols: z.number().describe('O número de colunas na grelha do mapa.'),
  dataSize: z.number().int().describe('O tamanho de cada ponto de dados em bytes (deve ser 1 para 8 bits ou 2 para 16 bits).'),
});

export const ExistingMapSchema = z.object({
  name: z.string(),
  address: z.number(),
  sizeInBytes: z.number().describe('O tamanho total do mapa em bytes, para que a IA possa evitar sobreposições.'),
});

export const FindMapsInputSchema = z.object({
  binHexData: z.string().describe('Uma string hexadecimal representando os primeiros 8192 bytes do ficheiro BIN.'),
  brand: z.string().optional().describe('A marca da ECU (ex: Yamaha, Honda). Isto ajuda a identificar tipos de mapas comuns para essa marca.'),
  model: z.string().optional().describe('O modelo da motocicleta (ex: R3, CBR600RR). Isto ajuda a dar nomes ainda mais precisos aos mapas.'),
  existingMaps: z.array(ExistingMapSchema).optional().describe('Uma lista opcional de mapas que já foram definidos num XDF, para evitar duplicação.'),
});

export const FindMapsOutputSchema = z.object({
  maps: z.array(PotentialMapSchema),
  analysis: z.string().optional().describe("Uma análise da procura, especialmente se nenhum mapa for encontrado. Explica o porquê, ex: os dados parecem encriptados ou não estruturados."),
});
export type FindMapsOutput = z.infer<typeof FindMapsOutputSchema>;

export const ExplainMapInputSchema = z.object({
    mapName: z.string(),
    mapData: z.array(z.array(z.number().nullable())),
    xAxis: z.array(z.union([z.string(), z.number()])),
    yAxis: z.array(z.union([z.string(), z.number()])),
    xAxisLabel: z.string(),
    yAxisLabel: z.string(),
});
export type ExplainMapInput = z.infer<typeof ExplainMapInputSchema>;

export const ExplainMapOutputSchema = z.object({
    explanation: z.string().describe('A explicação textual do mapa.'),
});
export type ExplainMapOutput = z.infer<typeof ExplainMapOutputSchema>;

export const TextToSpeechInputSchema = z.string();
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>;

export const TextToSpeechOutputSchema = z.object({
    media: z.string().describe('A data URI para o ficheiro de áudio WAV gerado.'),
});
export type TextToSpeechOutput = z.infer<typeof TextToSpeechOutputSchema>;