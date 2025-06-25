'use server';
/**
 * @fileOverview A flow for searching motorcycle manuals.
 *
 * - motorcycleManualFlow - A function that handles the manual search process.
 * - MotorcycleManualFlowInput - The input type for the function.
 * - MotorcycleManualFlowOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { searchYamahaManuals } from '@/ai/tools/yamaha-manual-search';
import { z } from 'genkit';

const MotorcycleManualFlowInputSchema = z.object({
  model: z.string().describe('The motorcycle model to search for.'),
});
export type MotorcycleManualFlowInput = z.infer<typeof MotorcycleManualFlowInputSchema>;

const MotorcycleManualFlowOutputSchema = z.array(
    z.object({
        title: z.string().describe('The title of the manual.'),
        url: z.string().url().describe('The URL to the manual.'),
        model: z.string().describe('The specific model name for the manual.'),
        year: z.number().describe('The year of the manual.'),
    })
);
export type MotorcycleManualFlowOutput = z.infer<typeof MotorcycleManualFlowOutputSchema>;

export async function motorcycleManualFlow(input: MotorcycleManualFlowInput): Promise<MotorcycleManualFlowOutput> {
  const llmResponse = await ai.generate({
    prompt: `You are an expert at finding motorcycle manuals. Find the manuals for the following model: ${input.model}`,
    tools: [searchYamahaManuals],
    model: 'googleai/gemini-2.0-flash',
  });

  const toolResponse = llmResponse.toolRequests;

  if (toolResponse.length > 0) {
    const toolOutput = await toolResponse[0].executor();
    return toolOutput as MotorcycleManualFlowOutput;
  }

  // If the tool wasn't called for some reason, return an empty array.
  return [];
}
