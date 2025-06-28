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
  model: googleAI.model('gemini-2.0-flash'),
  input: { schema: FindMapsInputSchema },
  output: { schema: FindMapsOutputSchema },
  prompt: `You are an expert ECU reverse engineer, acting like the software WinOLS. Your task is to analyze a hexadecimal string from a vehicle's ECU binary (.bin) file and identify potential data maps. These maps are typically 2D grids of 8-bit or 16-bit values. Look for structured blocks of data with patterns, such as smooth increments/decrements, that are characteristic of tuning maps (e.g., ignition timing, fuel injection, throttle position).

Based on your analysis, generate a list of potential maps. For each map, provide a plausible name, its starting memory address (in decimal), its dimensions (rows and columns), and the data size (1 for 8-bit, 2 for 16-bit). Your analysis must be based solely on the provided hex data.

The provided hex data is from the start of the file. The address of each map should be its offset from the beginning of this data.

If a list of existing map names is provided, do not suggest maps that are already present in that list. Focus on finding new, unidentified maps.

Respond ONLY with a JSON object containing a 'maps' key, which holds an array of map objects matching the specified output schema. Be critical and only identify maps you are confident about.

Hex Data:
{{{binHexData}}}

{{#if existingMapNames}}
List of existing maps to ignore:
{{{json existingMapNames}}}
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
      throw new Error("A IA não conseguiu encontrar nenhum mapa potencial.");
    }
    return output;
  }
);

export async function findMaps(input: FindMapsInput): Promise<FindMapsOutput> {
  return findMapsFlow(input);
}
