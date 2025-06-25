'use server';
import { suggestMapCorrections as suggestMapCorrectionsFlow, SuggestMapCorrectionsInput, SuggestMapCorrectionsOutput } from '@/ai/flows/suggest-map-corrections';
import { motorcycleManualFlow, MotorcycleManualFlowInput, MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { z } from 'zod';

// We need to validate the input on the server side as well for security.
const SuggestMapCorrectionsActionInputSchema = z.object({
  mapData: z.array(z.array(z.number().nullable())),
  lambdaTarget: z.array(z.array(z.number().nullable())),
  testData: z.array(z.object({
    rpm: z.number(),
    carga: z.number(),
    lambda: z.number(),
  })),
  aggressiveness: z.number().min(0).max(1),
  eixo_x: z.array(z.number()),
  eixo_y: z.array(z.number()),
  eixo_x_label: z.string(),
  eixo_y_label: z.string(),
  factorySpecs: z.string().optional(),
});

export async function suggestMapCorrections(input: any): Promise<{ success: boolean; data?: SuggestMapCorrectionsOutput; error?: string }> {
  try {
    const validatedInput = SuggestMapCorrectionsActionInputSchema.parse(input);
    const result = await suggestMapCorrectionsFlow(validatedInput as SuggestMapCorrectionsInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in suggestMapCorrections action:", error);
    
    if (error instanceof z.ZodError) {
        return { success: false, error: `Dados de entrada inválidos: ${error.message}` };
    }
    
    return { success: false, error: (error as Error).message };
  }
}

const SearchForManualsActionInputSchema = z.object({
  model: z.string(),
});

export async function searchForManuals(input: MotorcycleManualFlowInput): Promise<{ success: boolean; data?: MotorcycleManualFlowOutput; error?: string }> {
  try {
    const validatedInput = SearchForManualsActionInputSchema.parse(input);
    const result = await motorcycleManualFlow(validatedInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in searchForManuals action:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Dados de entrada inválidos: ${error.message}` };
    }
    return { success: false, error: (error as Error).message };
  }
}
