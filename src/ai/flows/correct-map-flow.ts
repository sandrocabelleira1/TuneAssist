'use server';
/**
 * @fileOverview Um fluxo de IA para corrigir um mapa de ECU com base em dados de log.
 *
 * - correctMap - A função de fluxo.
 * - CorrectMapInput - O tipo de entrada para a função.
 * - CorrectMapOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  CorrectMapInputSchema,
  CorrectMapOutputSchema,
  type CorrectMapInput,
  type CorrectMapOutput,
} from '@/ai/schemas';

// Re-exporting types for consumers
export type { CorrectMapInput, CorrectMapOutput };

const prompt = ai.definePrompt({
  name: 'correctMapPrompt',
  model: googleAI.model('gemini-1.5-flash-latest'),
  input: { schema: CorrectMapInputSchema },
  output: { schema: CorrectMapOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `Você é um engenheiro de calibração de ECU de classe mundial. A sua tarefa é analisar um ponto de dados de log (RPM, Carga, AFR Medido) e corrigir um mapa de combustível (Eficiência Volumétrica - VE) para atingir um AFR Alvo.

**Contexto do Mapa:**
- **Nome do Mapa:** {{{mapName}}}
- **Eixo Y (Vertical):** {{{yAxisLabel}}} (Valores: {{{json yAxis}}})
- **Eixo X (Horizontal):** {{{xAxisLabel}}} (Valores: {{{json xAxis}}})
- **Dados Atuais do Mapa (Eixo Z - VE):** {{{json mapData}}}

**Dados do Log e Alvo:**
- **RPM do Log:** {{{logRpm}}}
- **Carga do Log:** {{{logLoad}}}
- **AFR Medido:** {{{measuredAfr}}}
- **AFR Alvo:** {{{targetAfr}}}
- **Agressividade da Correção (%):** {{{aggressiveness}}} (0 = sem alteração, 100 = correção total no ponto exato e propagação máxima)

**Instruções para Correção:**
1.  **Localize a Célula Principal:** Encontre a célula na grelha \`mapData\` que está mais próxima dos valores de \`logRpm\` e \`logLoad\`. Use interpolação para encontrar o ponto exato se os valores do log estiverem entre os pontos dos eixos.
2.  **Calcule a Correção Percentual:**
    - A fórmula é: \`Correção = (AFR Medido / AFR Alvo) - 1\`.
    - Um resultado positivo significa que a mistura está rica (AFR medido < AFR alvo), então você precisa remover combustível (diminuir o valor de VE).
    - Um resultado negativo significa que a mistura está pobre (AFR medido > AFR alvo), então você precisa adicionar combustível (aumentar o valor de VE).
    - A correção real a ser aplicada é \`Correção * (Agressividade / 100)\`.
3.  **Aplique a Correção:**
    - Multiplique o valor da célula principal por \`(1 + Correção Percentual Calculada)\`.
    - Exemplo: Se o valor da célula for 80 e a correção for +5% (0.05), o novo valor será \`80 * 1.05 = 84\`.
4.  **Propague a Correção (Suavização):**
    - A correção não deve ser um pico isolado. Propague a alteração para as células vizinhas, diminuindo o impacto à medida que se afasta da célula principal.
    - A \`Agressividade\` influencia o quão longe e quão forte a correção se espalha. Uma agressividade de 100% deve ter um raio de influência maior do que uma de 20%.
    - Crie uma transição suave e natural em torno do ponto corrigido. As células distantes devem permanecer inalteradas.
5.  **Formato de Saída:** A sua resposta DEVE ser APENAS um objeto JSON contendo a chave "correctedMap", que é a grelha de dados 2D completa do mapa corrigido. As dimensões da grelha de saída devem ser idênticas às da grelha de entrada.

Analise os dados fornecidos e retorne o mapa de combustível corrigido.`,
});

const correctMapFlow = ai.defineFlow(
  {
    name: 'correctMapFlow',
    inputSchema: CorrectMapInputSchema,
    outputSchema: CorrectMapOutputSchema,
  },
  async (input) => {
    try {
        const { output } = await prompt(input);
        if (!output?.correctedMap) {
            throw new Error("A IA não conseguiu gerar um mapa corrigido.");
        }
        return output;
    } catch (error) {
        // Re-throw to be caught by the action's error handler
        throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
);

export async function correctMap(input: CorrectMapInput): Promise<CorrectMapOutput> {
  return correctMapFlow(input);
}
