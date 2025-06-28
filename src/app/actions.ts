'use server';
import { validateMapType as validateMapTypeFlow, type ValidateMapTypeInput, type ValidateMapTypeOutput } from '@/ai/flows/validate-map-type-flow';
import { findMaps as findMapsFlow, type FindMapsInput, type FindMapsOutput } from '@/ai/flows/find-maps-flow';
import { ValidateMapTypeInputSchema, FindMapsInputSchema } from '@/ai/schemas';
import { z } from 'zod';

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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
