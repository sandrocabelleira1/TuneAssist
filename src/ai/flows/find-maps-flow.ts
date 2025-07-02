'use server';
/**
 * @fileOverview Um fluxo de IA para encontrar potenciais mapas de dados dentro de um ficheiro BIN.
 *
 * - findMaps - A função de fluxo.
 * - FindMapsInput - O tipo de entrada para a função.
 * - FindMapsOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  FindMapsInputSchema,
  FindMapsOutputSchema,
  type FindMapsOutput,
} from '@/ai/schemas';
import type { z } from 'zod';

export type FindMapsInput = z.infer<typeof FindMapsInputSchema>;
export type { FindMapsOutput };

const prompt = ai.definePrompt({
  name: 'findMapsPrompt',
  model: googleAI.model('gemini-1.5-flash-latest'),
  input: { schema: FindMapsInputSchema },
  output: { schema: FindMapsOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `Você é um engenheiro reverso de ECU especialista, agindo como o software WinOLS. A sua tarefa é analisar uma string hexadecimal de um ficheiro binário (.bin) da ECU de um veículo e identificar potenciais mapas de dados. Estes mapas são tipicamente grelhas 2D de valores de 8 ou 16 bits. Procure por blocos de dados estruturados com padrões, como incrementos/decrementos suaves, que são característicos de mapas de afinação (ex: avanço de ignição, injeção de combustível, posição do acelerador).
{{#if brand}}

A ECU é de uma motocicleta {{brand}}. Use esta informação para dar nomes mais precisos aos mapas que encontrar, com base nos tipos de mapas comuns para esta marca.
{{/if}}

Com base na sua análise, gere uma lista de mapas potenciais. Para cada mapa, forneça um nome plausível, o seu endereço de memória inicial (em decimal), as suas dimensões (linhas e colunas) e o tamanho dos dados (1 para 8 bits, 2 para 16 bits). A sua análise deve basear-se unicamente nos dados hexadecimais fornecidos.

Os dados hexadecimais fornecidos são do início do ficheiro. O endereço de cada mapa deve ser o seu offset a partir do início destes dados.

Uma lista de mapas existentes é fornecida abaixo, incluindo o seu endereço inicial e tamanho total em bytes. Não sugira mapas que já estão definidos ou que se sobreponham a estas áreas de memória. O seu principal objetivo é encontrar mapas novos, não identificados, procurando por dados estruturados que NÃO fazem parte dos mapas existentes.

IMPORTANTE: A sua resposta para os nomes dos mapas e a análise DEVE ser em Português do Brasil. Se não conseguir identificar com confiança nenhum mapa novo, responda com um array 'maps' vazio e forneça uma breve explicação no campo 'analysis'. Por exemplo, explique que os dados parecem estar encriptados, comprimidos ou simplesmente não têm os padrões estruturados típicos de mapas de ECU.

Responda APENAS com um objeto JSON que corresponda ao schema de saída especificado. Seja crítico e identifique apenas mapas sobre os quais tem confiança.

Dados Hexadecimais:
{{{binHexData}}}

{{#if existingMaps}}
Mapas existentes (ignore estas áreas de memória):
{{{json existingMaps}}}
{{/if}}
`,
});

const findMapsFlow = ai.defineFlow(
  {
    name: 'findMapsFlow',
    inputSchema: FindMapsInputSchema,
    outputSchema: FindMapsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      return { maps: [], analysis: "A IA devolveu uma resposta inesperada. Por favor, tente novamente." };
    }
    return output;
  }
);

export async function findMaps(input: FindMapsInput): Promise<FindMapsOutput> {
  return findMapsFlow(input);
}
