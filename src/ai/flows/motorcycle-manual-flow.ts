'use server';
/**
 * @fileOverview A flow for searching motorcycle manuals.
 *
 * - motorcycleManualFlow - A function that handles the manual search process.
 * - MotorcycleManualFlowInput - The input type for the function.
 * - MotorcycleManualFlowOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { searchMotorcycleManuals } from '@/ai/tools/yamaha-manual-search';
import { z } from 'genkit';

const MotorcycleManualFlowInputSchema = z.object({
  query: z.string().describe("The user's search query for a motorcycle manual."),
});
export type MotorcycleManualFlowInput = z.infer<typeof MotorcycleManualFlowInputSchema>;

const MotorcycleManualFlowOutputSchema = z.array(
    z.object({
        title: z.string().describe('The title of the manual.'),
        url: z.string().url().describe('The URL to the manual.'),
        model: z.string().describe('The specific model name for the manual.'),
        year: z.number().describe('The year of the manual.'),
        brand: z.string().describe('The brand of the motorcycle.'),
    })
);
export type MotorcycleManualFlowOutput = z.infer<typeof MotorcycleManualFlowOutputSchema>;

const motorcycleManualFlowPrompt = `Você é um assistente especialista em pesquisar manuais de motocicletas.
Sua tarefa é analisar a solicitação do usuário e usar a ferramenta 'searchMotorcycleManuals' para encontrar os manuais mais relevantes.
Preste atenção aos detalhes como MARCA, MODELO, ANO e TIPO de manual (por exemplo, "proprietário" ou "serviço") na solicitação do usuário.
Use esses detalhes para preencher os parâmetros da ferramenta da forma mais precisa possível para obter os melhores resultados.

Solicitação do usuário: "{{query}}"`;

export async function motorcycleManualFlow(input: MotorcycleManualFlowInput): Promise<MotorcycleManualFlowOutput> {
  const llmResponse = await ai.generate({
    prompt: motorcycleManualFlowPrompt.replace('{{query}}', input.query),
    tools: [searchMotorcycleManuals],
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
