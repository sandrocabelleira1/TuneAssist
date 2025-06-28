'use server';
import { motorcycleManualFlow, type MotorcycleManualFlowInput, type MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { generateManualContent as generateManualContentFlow, type GenerateManualContentInput, type GenerateManualContentOutput } from '@/ai/flows/generate-manual-content-flow';
import { validateMapType as validateMapTypeFlow, type ValidateMapTypeInput, type ValidateMapTypeOutput } from '@/ai/flows/validate-map-type-flow';
import { findMaps as findMapsFlow, type FindMapsInput, type FindMapsOutput } from '@/ai/flows/find-maps-flow';
import { GenerateManualContentInputSchema, ValidateMapTypeInputSchema, FindMapsInputSchema } from '@/ai/schemas';
import { z } from 'zod';

const SearchForManualsActionInputSchema = z.object({
  query: z.string(),
  brand: z.string().optional(),
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


export async function generateManualContent(input: GenerateManualContentInput): Promise<{ success: boolean; data?: GenerateManualContentOutput; error?: string }> {
  try {
    const validatedInput = GenerateManualContentInputSchema.parse(input);
    const result = await generateManualContentFlow(validatedInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in generateManualContent action:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Dados de entrada inválidos: ${error.message}` };
    }
    return { success: false, error: (error as Error).message };
  }
}

export async function validateMapType(input: ValidateMapTypeInput): Promise<{ success: boolean; data?: ValidateMapTypeOutput; error?: string }> {
  try {
    const validatedInput = ValidateMapTypeInputSchema.parse(input);
    const result = await validateMapTypeFlow(validatedInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in validateMapType action:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Dados de entrada inválidos: ${error.message}` };
    }
    return { success: false, error: (error as Error).message };
  }
}

export async function findPotentialMaps(input: FindMapsInput): Promise<{ success: boolean; data?: FindMapsOutput; error?: string }> {
  try {
    const validatedInput = FindMapsInputSchema.parse(input);
    const result = await findMapsFlow(validatedInput);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in findPotentialMaps action:", error);
     if (error instanceof z.ZodError) {
      return { success: false, error: `Dados de entrada inválidos: ${error.message}` };
    }
    return { success: false, error: (error as Error).message };
  }
}
