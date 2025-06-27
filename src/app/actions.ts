'use server';
import { suggestMapCorrections as suggestMapCorrectionsFlow, type SuggestMapCorrectionsInput, type SuggestMapCorrectionsOutput } from '@/ai/flows/suggest-map-corrections';
import { motorcycleManualFlow, type MotorcycleManualFlowInput, type MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { generateManualContent as generateManualContentFlow, type GenerateManualContentInput, type GenerateManualContentOutput } from '@/ai/flows/generate-manual-content-flow';
import { validateMapType as validateMapTypeFlow, type ValidateMapTypeInput, type ValidateMapTypeOutput } from '@/ai/flows/validate-map-type-flow';
import { GenerateManualContentInputSchema, ValidateMapTypeInputSchema } from '@/ai/schemas';
import { z } from 'zod';

const SuggestMapCorrectionsActionInputSchema = z.object({
  mapData: z.array(z.array(z.number().nullable())),
  lambdaTarget: z.array(z.array(z.number().nullable())),
  testData: z.array(z.object({
    rpm: z.number(),
    carga: z.number(),
    lambda: z.number(),
    torque: z.number().optional(),
    potencia: z.number().optional(),
  })),
  aggressiveness: z.number().min(0).max(1),
  eixo_x: z.array(z.number()),
  eixo_y: z.array(z.number()),
  eixo_x_label: z.string(),
  eixo_y_label: z.string(),
  factorySpecs: z.string().optional(),
});


export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<{ success: boolean; data?: SuggestMapCorrectionsOutput; error?: string }> {
  try {
    const validatedInput = SuggestMapCorrectionsActionInputSchema.parse(input);
    const result = await suggestMapCorrectionsFlow(validatedInput);
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

const FetchManualInfoActionInputSchema = z.object({
  query: z.string().min(1, 'A consulta é obrigatória.'),
  brand: z.string().optional(),
});

export async function fetchManualInformation(input: { query: string; brand?: string }): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const validatedInput = FetchManualInfoActionInputSchema.parse(input);
    const manuals = await motorcycleManualFlow(validatedInput);

    if (!manuals || manuals.length === 0) {
      return { success: true, data: 'Nenhum manual encontrado para esta consulta. Por favor, insira as especificações manualmente.' };
    }

    const formattedData = manuals.map(manual => 
      `Manual Encontrado: "${manual.title}" (Marca: ${manual.brand}, Modelo: ${manual.model}, Ano: ${manual.year}).`
    ).join('\n');

    const resultText = `A IA encontrou os seguintes manuais que podem ser relevantes. Use estas informações como contexto para a afinação:\n\n${formattedData}`;

    return { success: true, data: resultText };
  } catch (error) {
    console.error("Error in fetchManualInformation action:", error);
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
