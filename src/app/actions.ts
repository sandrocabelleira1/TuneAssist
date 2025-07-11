'use server';
import { validateMapType as validateMapTypeFlow, type ValidateMapTypeInput, type ValidateMapTypeOutput } from '@/ai/flows/validate-map-type-flow';
import { findMaps as findMapsFlow, type FindMapsInput, type FindMapsOutput } from '@/ai/flows/find-maps-flow';
import { explainMap as explainMapFlow, type ExplainMapInput, type ExplainMapOutput } from '@/ai/flows/explain-map-flow';
import { generateSpeech as generateSpeechFlow, type TextToSpeechInput, type TextToSpeechOutput } from '@/ai/flows/text-to-speech-flow';
import { ValidateMapTypeInputSchema, FindMapsInputSchema, ExplainMapInputSchema, TextToSpeechInputSchema } from '@/ai/schemas';
import { z } from 'zod';

// Helper function for common AI error handling
function handleAiError(error: unknown, context: string): { success: false; error: string } {
    console.error(`Error in ${context} action:`, error);

    if (error instanceof z.ZodError) {
      return { success: false, error: `Dados de entrada inválidos: ${JSON.stringify(error.flatten().fieldErrors)}` };
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lowerErrorMessage = errorMessage.toLowerCase();

    if (lowerErrorMessage.includes('503') || lowerErrorMessage.includes('service unavailable') || lowerErrorMessage.includes('model is overloaded')) {
        return { success: false, error: 'O serviço de IA está temporariamente sobrecarregado. Por favor, aguarde um momento e tente novamente.' };
    }
    
    if (lowerErrorMessage.includes('429') || lowerErrorMessage.includes('quota')) {
        return { success: false, error: 'Limite de utilização da IA atingido. Atingiu o limite diário do plano gratuito. Por favor, tente novamente amanhã ou atualize o seu plano da API da Google.' };
    }
    
    if (errorMessage.includes('Y is not defined')) {
        return { success: false, error: 'A equação para um dos eixos é inválida. Apenas a variável "X" pode ser usada em equações de eixo. Por favor, corrija a definição XDF.' };
    }
    
    // Catch generic network/server errors more robustly
    if (lowerErrorMessage.includes('unexpected response') || lowerErrorMessage.includes('failed to fetch')) {
      return { success: false, error: `Ocorreu um erro de rede ou servidor (${context}). Por favor, tente novamente.` };
    }

    if (errorMessage.includes('resposta vazia') || errorMessage.includes('não conseguiu analisar') || errorMessage.includes('não conseguiu gerar')) {
      return { success: false, error: `A IA não conseguiu gerar uma resposta para ${context}. Por favor, tente novamente.` };
    }

    return { success: false, error: `Ocorreu um erro inesperado (${context}): ${errorMessage}` };
}


export async function validateMapType(input: ValidateMapTypeInput): Promise<{ success: boolean; data?: ValidateMapTypeOutput; error?: string }> {
  try {
    const validatedInput = ValidateMapTypeInputSchema.parse(input);
    const result = await validateMapTypeFlow(validatedInput);
    if (!result) {
        throw new Error('A IA devolveu uma resposta vazia.');
    }
    return { success: true, data: result };
  } catch (error) {
    return handleAiError(error, 'validação do mapa');
  }
}

export async function findPotentialMaps(input: FindMapsInput): Promise<{ success: boolean; data?: FindMapsOutput; error?: string }> {
  try {
    const validatedInput = FindMapsInputSchema.parse(input);
    const result = await findMapsFlow(validatedInput);
    if (!result) {
        throw new Error('A IA devolveu uma resposta vazia.');
    }
    return { success: true, data: result };
  } catch (error) {
    return handleAiError(error, 'procura de mapas');
  }
}

export async function explainMap(input: ExplainMapInput): Promise<{ success: boolean; data?: ExplainMapOutput; error?: string }> {
  try {
    const validatedInput = ExplainMapInputSchema.parse(input);
    const result = await explainMapFlow(validatedInput);
     if (!result) {
        throw new Error('A IA devolveu uma resposta vazia.');
    }
    return { success: true, data: result };
  } catch (error) {
    return handleAiError(error, 'geração de explicação');
  }
}

export async function generateSpeech(text: TextToSpeechInput): Promise<{ success: boolean; data?: TextToSpeechOutput; error?: string }> {
  try {
    const validatedInput = TextToSpeechInputSchema.parse(text);
    const result = await generateSpeechFlow(validatedInput);
     if (!result) {
        throw new Error('A IA devolveu uma resposta vazia.');
    }
    return { success: true, data: result };
  } catch (error) {
    return handleAiError(error, 'geração de áudio');
  }
}
