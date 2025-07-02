'use server';
/**
 * @fileOverview Um fluxo de IA para encontrar potenciais mapas de dados dentro de um ficheiro BIN.
 *
 * - findMaps - A função de fluxo.
 * - FindMapsInput - O tipo de entrada para a função.
 * - FindMapsOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  FindMapsInputSchema,
  FindMapsOutputSchema,
  type FindMapsOutput,
} from '@/ai/schemas';
import type { z } from 'zod';

export type FindMapsInput = z.infer<typeof FindMapsInputSchema>;
export type { FindMapsOutput };

const prompt = ai.definePrompt({
  name: 'findMapsPrompt',
  model: googleAI.model('gemini-1.5-flash-latest'),
  input: { schema: FindMapsInputSchema },
  output: { schema: FindMapsOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `You are an expert ECU reverse engineer, acting like the software WinOLS. Your task is to analyze a hexadecimal string from a vehicle's ECU binary (.bin) file and identify potential data maps. These maps are typically 2D grids of 8-bit or 16-bit values. Look for structured blocks of data with patterns, such as smooth increments/decrements, that are characteristic of tuning maps (e.g., ignition timing, fuel injection, throttle position).
{{#if brand}}

The ECU is from a {{brand}} motorcycle. Use this information to give more accurate names to the maps you find, based on common map types for this brand.
{{/if}}

Based on your analysis, generate a list of potential maps. For each map, provide a plausible name, its starting memory address (in decimal), its dimensions (rows and columns), and the data size (1 for 8-bit, 2 for 16-bit). Your analysis must be based solely on the provided hex data.

The provided hex data is from the start of the file. The address of each map should be its offset from the beginning of this data.

A list of existing maps is provided below. Do not suggest maps that are already defined. Your main goal is to find new, unidentified maps by looking for structured data that is NOT part of the existing maps. Pay close attention to the addresses to avoid any overlaps.

IMPORTANT: If you cannot confidently identify any new maps, respond with an empty 'maps' array and provide a brief explanation in the 'analysis' field. For example, explain that the data appears to be encrypted, compressed, or simply lacks the structured patterns typical of ECU maps.

Respond ONLY with a JSON object matching the specified output schema. Be critical and only identify maps you are confident about.

Hex Data:
{{{binHexData}}}

{{#if existingMaps}}
Existing maps (ignore these addresses and areas):
{{{json existingMaps}}}
{{/if}}
`,
});

const findMapsFlow = ai.defineFlow(
  {
    name: 'findMapsFlow',
    inputSchema: FindMapsInputSchema,
    outputSchema: FindMapsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      return { maps: [], analysis: "A IA devolveu uma resposta inesperada. Por favor, tente novamente." };
    }
    return output;
  }
);

export async function findMaps(input: FindMapsInput): Promise<FindMapsOutput> {
  return findMapsFlow(input);
}
