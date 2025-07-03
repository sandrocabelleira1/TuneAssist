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
      return { success: false, error: `Dados de entrada inválidos: ${JSON.stringify(error.flatten().fieldErrors)}` };
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
        return { success: false, error: 'Limite de utilização da IA atingido. Atingiu o limite diário do plano gratuito. Por favor, tente novamente amanhã ou atualize o seu plano da API da Google.' };
    }
    if (errorMessage.includes('Y is not defined')) {
        return { success: false, error: 'A equação para um dos eixos é inválida. Apenas a variável "X" pode ser usada em equações de eixo. Por favor, corrija a definição XDF.' };
    }
    return { success: false, error: `Ocorreu um erro inesperado durante a validação do mapa: ${errorMessage}` };
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
      return { success: false, error: `Dados de entrada inválidos: ${JSON.stringify(error.flatten().fieldErrors)}` };
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
        return { success: false, error: 'Limite de utilização da IA atingido. Atingiu o limite diário do plano gratuito. Por favor, tente novamente amanhã ou atualize o seu plano da API da Google.' };
    }
    
    return { success: false, error: `Ocorreu um erro inesperado ao procurar mapas: ${errorMessage}` };
  }
}
