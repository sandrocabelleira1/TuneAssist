'use server';
import { suggestMapCorrections as suggestMapCorrectionsFlow, SuggestMapCorrectionsInput, SuggestMapCorrectionsOutput } from '@/ai/flows/suggest-map-corrections';
import { z } from 'zod';

// We need to validate the input on the server side as well for security.
const SuggestMapCorrectionsActionInputSchema = z.object({
  mapData: z.array(z.array(z.number().nullable()))
    .transform(arr => 
      arr
        .filter(row => row.some(cell => cell !== null))
        .map(row => row.map(cell => cell === null ? 0 : cell))
    ),
  afrTarget: z.array(z.array(z.number().nullable()))
    .transform(arr => 
      arr
        .filter(row => row.some(cell => cell !== null))
        .map(row => row.map(cell => cell === null ? 14.7 : cell))
    ),
  testData: z.array(z.object({
    rpm: z.number(),
    carga: z.number(),
    afr: z.number(),
  })),
  aggressiveness: z.number().min(0).max(1),
  eixo_x: z.array(z.number()),
  eixo_y: z.array(z.number()),
});

export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<{ success: boolean; data?: SuggestMapCorrectionsOutput; error?: string }> {
  try {
    const validatedInput = SuggestMapCorrectionsActionInputSchema.parse(input);
    const result = await suggestMapCorrectionsFlow(validatedInput as SuggestMapCorrectionsInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in suggestMapCorrections action:", error);
    
    if (error instanceof z.ZodError) {
        return { success: false, error: `Invalid input data: ${error.message}` };
    }
    
    return { success: false, error: (error as Error).message };
  }
}
