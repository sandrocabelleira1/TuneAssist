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
