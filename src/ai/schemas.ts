import { z } from 'zod';

export const ValidateMapTypeInputSchema = z.object({
    mapName: z.string().describe('O nome do mapa, conforme definido no ficheiro XDF.'),
    mapData: z.array(z.array(z.number().nullable())).describe('Os dados 2D do mapa.'),
    xAxis: z.array(z.number()).describe('Os valores do eixo X (horizontal).'),
    yAxis: z.array(z.number()).describe('Os valores do eixo Y (vertical).'),
    equation: z.string().optional().describe('A equação matemática atual para os dados do mapa (eixo Z). Ex: "X/128".'),
    brand: z.string().nullable().optional().describe('A marca da ECU (ex: Yamaha, Honda).'),
    model: z.string().nullable().optional().describe('O modelo da motocicleta (ex: R3, CBR600RR).'),
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

export const AlignMapInputSchema = z.object({
    mapName: z.string().describe('O nome do mapa, ex: "Ignição Principal"'),
    mapData: z.array(z.array(z.number().nullable())).describe('Os dados 2D do mapa a serem alinhados.'),
    xAxis: z.array(z.union([z.string(), z.number()])).describe('Valores do eixo X (ex: TPS, Carga)'),
    yAxis: z.array(z.union([z.string(), z.number()])).describe('Valores do eixo Y (ex: RPM)'),
    xAxisLabel: z.string().describe('Rótulo do eixo X (ex: "Posição da Borboleta")'),
    yAxisLabel: z.string().describe('Rótulo do eixo Y (ex: "RPM do Motor")'),
});
export type AlignMapInput = z.infer<typeof AlignMapInputSchema>;

export const AlignMapOutputSchema = z.object({
    alignedMapData: z.array(z.array(z.number().nullable())).describe('A nova grelha de dados do mapa 2D, suavizada e alinhada.'),
});
export type AlignMapOutput = z.infer<typeof AlignMapOutputSchema>;

export const CorrectMapInputSchema = z.object({
    mapName: z.string().describe('O nome do mapa de combustível a ser corrigido.'),
    mapData: z.array(z.array(z.number().nullable())).describe('Os dados 2D atuais do mapa de combustível (VE).'),
    xAxis: z.array(z.union([z.string(), z.number()])).describe('Valores do eixo X (Carga/Load).'),
    yAxis: z.array(z.union([z.string(), z.number()])).describe('Valores do eixo Y (RPM).'),
    xAxisLabel: z.string().describe('Rótulo do eixo X.'),
    yAxisLabel: z.string().describe('Rótulo do eixo Y.'),
    logRpm: z.number().describe('O valor de RPM do ponto de dados do log.'),
    logLoad: z.number().describe('O valor de Carga/Load do ponto de dados do log.'),
    measuredAfr: z.number().describe('O valor de AFR (Air-Fuel Ratio) medido pelo sensor de banda larga.'),
    targetAfr: z.number().describe('O valor de AFR alvo desejado para este ponto de operação.'),
    aggressiveness: z.number().min(0).max(100).describe('A percentagem de agressividade da correção (0-100). Influencia a força e a propagação da alteração.'),
});
export type CorrectMapInput = z.infer<typeof CorrectMapInputSchema>;

export const CorrectMapOutputSchema = z.object({
    correctedMap: z.array(z.array(z.number().nullable())).describe('A nova grelha de dados do mapa 2D, corrigida com base nos dados de log.'),
});
export type CorrectMapOutput = z.infer<typeof CorrectMapOutputSchema>;
