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
  prompt: `Você é um engenheiro reverso de ECU especialista, agindo como o software WinOLS. A sua tarefa é analisar uma string hexadecimal de um ficheiro binário (.bin) da ECU de um veículo e identificar potenciais mapas de dados.

**Critérios para Identificação de Mapas:**
1.  **Estrutura de Grelha:** A sua principal tarefa é procurar blocos retangulares de dados. Um mapa de 16x10 (16 linhas, 10 colunas) com dados de 16-bit (2 bytes por ponto) ocupará 16 * 10 * 2 = 320 bytes. Procure por estes "retângulos" de dados organizados.
2.  **Padrões de Dados Suaves:** Dentro destes blocos, os valores não devem ser aleatórios. Procure por progressões lógicas, como valores que aumentam ou diminuem de forma relativamente suave e consistente ao longo das linhas e/ou colunas. Isto é o sinal mais forte de um mapa de afinação (ex: avanço de ignição, injeção de combustível).
3.  **Ignorar Ruído e Preenchimento:** O ficheiro BIN contém muito mais do que apenas mapas. Ignore ativamente longas sequências do mesmo byte (ex: 00 00 00... ou FF FF FF...) e dados que parecem ser de alta entropia (aleatórios), pois estes são provavelmente código do programa ou preenchimento, e não mapas de dados. Concentre-se nas "ilhas" de dados estruturados.

{{#if brand}}
A ECU é de uma motocicleta {{brand}}. Use esta informação para dar nomes mais precisos aos mapas que encontrar, com base nos tipos de mapas comuns para esta marca.
{{/if}}

Com base na sua análise, gere uma lista de mapas potenciais. Para cada mapa, forneça um nome plausível, o seu endereço de memória inicial (em decimal), as suas dimensões (linhas e colunas) e o tamanho dos dados (1 para 8 bits, 2 para 16 bits).

Os dados hexadecimais fornecidos são do início do ficheiro. O endereço de cada mapa deve ser o seu offset a partir do início destes dados.

Uma lista de mapas existentes é fornecida abaixo, incluindo o seu endereço inicial e tamanho total em bytes. Não sugira mapas que já estão definidos ou que se sobreponham a estas áreas de memória. O seu principal objetivo é encontrar mapas novos, não identificados, procurando por dados estruturados que NÃO fazem parte dos mapas existentes.

**A sua função é ser um assistente útil para um especialista.** A sua principal tarefa é encontrar *candidatos* a mapas. Mesmo que um padrão não seja perfeito ou se tiver dúvidas sobre as suas dimensões, é preferível sugerir um mapa potencial do que não sugerir nada. O utilizador é um engenheiro experiente que irá validar, corrigir ou descartar as suas sugestões. O seu valor está em apontar áreas de interesse, não em ter 100% de certeza. A sua resposta DEVE ser em Português do Brasil. Se, mesmo com esta abordagem mais flexível, não conseguir encontrar nenhuma estrutura que se assemelhe remotamente a um mapa, responda com um array 'maps' vazio e explique porquê no campo 'analysis'.

Responda APENAS com um objeto JSON que corresponda ao schema de saída especificado.

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
