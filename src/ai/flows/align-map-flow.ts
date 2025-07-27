'use server';
/**
 * @fileOverview Um fluxo de IA para alinhar e suavizar inteligentemente os dados de um mapa de ECU.
 *
 * - alignMap - A função de fluxo.
 * - AlignMapInput - O tipo de entrada para a função.
 * - AlignMapOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  AlignMapInputSchema,
  AlignMapOutputSchema,
  type AlignMapInput,
  type AlignMapOutput,
} from '@/ai/schemas';

// Re-exporting types for consumers
export type { AlignMapInput, AlignMapOutput };

const prompt = ai.definePrompt({
  name: 'alignMapPrompt',
  model: googleAI.model('gemini-1.5-flash-latest'),
  input: { schema: AlignMapInputSchema },
  output: { schema: AlignMapOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `Você é um engenheiro de calibração de ECU de classe mundial, especializado em afinação de motores de alto desempenho. A sua tarefa é analisar os dados de um mapa de ECU e suavizá-los para garantir uma operação segura e eficiente do motor.

**Contexto do Mapa:**
- **Nome do Mapa:** {{{mapName}}}
- **Eixo Y (Vertical):** {{{yAxisLabel}}} (Valores: {{{json yAxis}}})
- **Eixo X (Horizontal):** {{{xAxisLabel}}} (Valores: {{{json xAxis}}})
- **Dados Atuais do Mapa (Eixo Z):** {{{json mapData}}}

**Instruções de Alinhamento:**
1.  **Analise o Propósito:** Com base no nome do mapa (ex: Ignição, Combustível), entenda o que os valores representam.
2.  **Suavize as Transições:** O objetivo principal é eliminar picos e vales abruptos que possam causar um comportamento instável do motor. Os valores devem progredir de forma lógica e suave através das RPMs (eixo Y) e da carga/TPS (eixo X).
3.  **Mantenha a Tendência Geral:** Não altere drasticamente a forma geral do mapa. Se a tendência geral for aumentar o avanço de ignição com as RPMs, o mapa alinhado deve manter essa tendência, mas de forma mais suave.
4.  **Lógica por Área:**
    - **Baixa RPM / Baixa Carga (Marcha Lenta):** Os valores devem ser consistentes e suaves para garantir uma marcha lenta estável.
    - **Médias RPM / Cargas Parciais (Cruzeiro):** Foque na suavidade para uma boa dirigibilidade e economia de combustível. Interpole os valores de forma a criar uma transição gradual.
    - **Alta RPM / Alta Carga (Potência Máxima):** As transições devem ser suaves para evitar hesitação. Um pequeno ajuste pode ser necessário para otimizar a potência, mas a prioridade é a suavidade.
5.  **Não Altere os Cantos Extremos:** Preserva os valores nos quatro cantos extremos da tabela (canto superior esquerdo, superior direito, inferior esquerdo, inferior direito), a menos que sejam picos ou vales extremos que se desviem significativamente dos seus vizinhos.
6.  **Formato de Saída:** A sua resposta DEVE ser APENAS um objeto JSON contendo a chave "alignedMapData", que é a grelha de dados 2D completa do mapa suavizado. As dimensões da grelha de saída devem ser idênticas às da grelha de entrada.

Analise a grelha de dados fornecida e retorne a versão suavizada e alinhada.
`,
});

const alignMapFlow = ai.defineFlow(
  {
    name: 'alignMapFlow',
    inputSchema: AlignMapInputSchema,
    outputSchema: AlignMapOutputSchema,
  },
  async (input) => {
    try {
        const { output } = await prompt(input);
        if (!output?.alignedMapData) {
            throw new Error("A IA não conseguiu gerar um mapa alinhado.");
        }
        return output;
    } catch (error) {
        // Re-throw to be caught by the action's error handler
        throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
);

export async function alignMap(input: AlignMapInput): Promise<AlignMapOutput> {
  return alignMapFlow(input);
}
