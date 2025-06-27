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
});
export type ValidateMapTypeOutput = z.infer<typeof ValidateMapTypeOutputSchema>;
