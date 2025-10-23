'use server';
/**
 * @fileOverview Flow to suggest fuel map changes based on user request.
 *
 * This file defines the Genkit flow for the AI tuning co-pilot.
 * - suggestFuelMapChanges - The main function that gets called by the UI.
 * - SuggestFuelMapInput - The Zod schema for the flow's input.
 * - AiFuelSuggestion - The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { type MapData, type AxisData, type ChatMessage } from '@/lib/types';

// Define the schema for a single cell change
const AiFuelMapCellChangeSchema = z.object({
  y: z.number().describe('The row index of the cell to change.'),
  x: z.number().describe('The column index of the cell to change.'),
  newValue: z.number().describe('The new value for the cell.'),
});

// Define the schema for the overall AI suggestion
export const AiFuelSuggestionSchema = z.object({
  reasoning: z
    .string()
    .describe('A brief, user-friendly explanation of the changes being made.'),
  changes: z
    .array(AiFuelMapCellChangeSchema)
    .describe('An array of cell modifications.'),
});
export type AiFuelSuggestion = z.infer<typeof AiFuelSuggestionSchema>;

// Define the schema for the input to the flow
const AxisDataSchema = z.object({
  label: z.string(),
  calculated: z.array(z.union([z.string(), z.number()])),
});

const MapInfoSchema = z.object({
  map: z.array(z.array(z.number().nullable())),
  xAxis: AxisDataSchema,
  yAxis: AxisDataSchema,
});

export const SuggestFuelMapInputSchema = z.object({
  userRequest: z.string(),
  currentMap: MapInfoSchema,
  targetLambda: z.number(),
  chatHistory: z.array(z.any()).optional(),
});
export type SuggestFuelMapInput = z.infer<typeof SuggestFuelMapInputSchema>;

// Export the main function that the UI will call
export async function suggestFuelMapChanges(
  input: SuggestFuelMapInput
): Promise<AiFuelSuggestion> {
  return await fuelTuningFlow(input);
}

// Define the Genkit prompt
const fuelTuningPrompt = ai.definePrompt({
  name: 'fuelTuningPrompt',
  input: { schema: SuggestFuelMapInputSchema },
  output: { schema: AiFuelSuggestionSchema },
  prompt: `You are an expert ECU tuner. Your task is to analyze a user's request regarding their fuel map and provide specific, targeted changes.

  Current State:
  - The user's target air-fuel ratio is Lambda {{targetLambda}}.
  - The user's current fuel map is provided below. The values in the map represent fuel injection quantities. Higher values mean more fuel (richer mixture), lower values mean less fuel (leaner mixture).
  - Y-Axis (Rows): {{JSON.stringify currentMap.yAxis}}
  - X-Axis (Columns): {{JSON.stringify currentMap.xAxis}}
  - Map Data: {{JSON.stringify currentMap.map}}
  - Previous conversation: {{JSON.stringify chatHistory}}

  User's Request: "{{userRequest}}"

  Your Task:
  1.  **Analyze the Request**: Understand the user's goal. Are they trying to fix a lean spot, a rich spot, or achieve a specific performance characteristic?
  2.  **Identify Target Cells**: Based on the user's request and the axis labels/values, determine the exact cells (row and column indices) in the map that need to be adjusted.
  3.  **Calculate New Values**: For each target cell, calculate the new fuel value.
      - If the user says the mixture is "lean" (e.g., Lambda > {{targetLambda}}), you must **increase** the fuel value.
      - If the user says the mixture is "rich" (e.g., Lambda < {{targetLambda}}), you must **decrease** the fuel value.
      - Apply changes proportionally. A small correction might be 1-3%, while a larger one could be 5-10%.
  4.  **Formulate Response**:
      - **Reasoning**: Provide a clear, concise explanation of your logic in Portuguese. Explain *why* you are making the changes and which cells you are targeting.
      - **Changes**: Provide a JSON array of the specific changes, including the 'y' (row index), 'x' (column index), and 'newValue'.
      
  **Example**:
  If the user says "A mistura está pobre a 3000 RPM com 80% de carga", and 3000 RPM corresponds to column index 5 and 80% carga corresponds to row index 8, your response might include a change like: \`{ "y": 8, "x": 5, "newValue": 135.5 }\` (assuming the old value was 130).

  Generate the response now based on the user's request.`,
});

// Define the Genkit flow
const fuelTuningFlow = ai.defineFlow(
  {
    name: 'suggestFuelMapChangesFlow',
    inputSchema: SuggestFuelMapInputSchema,
    outputSchema: AiFuelSuggestionSchema,
  },
  async (input) => {
    const { output } = await fuelTuningPrompt(input);
    if (!output) {
      throw new Error('A IA não conseguiu gerar uma sugestão.');
    }
    return output;
  }
);
