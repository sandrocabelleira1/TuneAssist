'use server';
/**
 * @fileOverview A flow to generate a textual explanation of an ECU map.
 *
 * - explainMap - The flow function.
 * - ExplainMapInput - The input type for the function.
 * - ExplainMapOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  ExplainMapInputSchema,
  ExplainMapOutputSchema,
  type ExplainMapInput,
  type ExplainMapOutput,
} from '@/ai/schemas';


export type { ExplainMapInput, ExplainMapOutput };

const prompt = ai.definePrompt({
  name: 'explainMapPrompt',
  model: googleAI.model('gemini-1.5-pro-latest'),
  input: { schema: ExplainMapInputSchema },
  output: { schema: ExplainMapOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `Você é um engenheiro de calibração de ECU experiente e amigável. A sua tarefa é explicar o mapa da ECU fornecido em português do Brasil claro e simples, como se estivesse a ensinar a um principiante.

**Mapa a ser explicado:**
- **Nome do Mapa:** {{{mapName}}}
- **Rótulo do Eixo X (Horizontal):** {{{xAxisLabel}}}
- **Rótulo do Eixo Y (Vertical):** {{{yAxisLabel}}}
- **Valores do Eixo X:** {{{json xAxis}}}
- **Valores do Eixo Y:** {{{json yAxis}}}
- **Dados do Mapa (Eixo Z):** {{{json mapData}}}

**Instruções:**
1.  **Identifique o Propósito do Mapa:** Com base no nome "{{mapName}}", comece por explicar o que este mapa controla no motor (ex: "Este é um mapa de ignição, que controla o momento exato em que a vela de ignição dispara...").
2.  **Explique os Eixos:** Descreva o que cada eixo representa de uma forma simples.
    - Para o eixo Y (vertical), rotulado como "{{yAxisLabel}}", diga algo como: "O eixo vertical representa a velocidade do motor em RPM. Valores mais baixos são a marcha lenta, e valores mais altos são rotações elevadas."
    - Para o eixo X (horizontal), rotulado como "{{xAxisLabel}}", diga: "O eixo horizontal representa a carga do motor, que é basicamente o quanto o acelerador está aberto. Valores baixos significam pouca aceleração, e valores altos significam aceleração total."
3.  **Explique os Dados (Eixo Z):** Explique o que os números dentro da tabela significam. Pegue em 2 ou 3 exemplos para ilustrar:
    - **Exemplo 1 (Baixa RPM, Baixa Carga):** "Vamos ver o que acontece em baixa rotação e com pouca aceleração. Aqui, o valor é [valor], o que significa que [explique o efeito - ex: 'o ponto de ignição está adiantado para otimizar a queima e a economia de combustível']."
    - **Exemplo 2 (Alta RPM, Alta Carga):** "Agora, em alta rotação e com o acelerador no máximo, o valor muda para [valor]. Isto significa que [explique o efeito - ex: 'o ponto é ligeiramente atrasado para evitar detonação e proteger o motor, extraindo a máxima potência']."
4.  **Mantenha a Concisão:** A explicação inteira deve ser curta e direta, ideal para ser convertida em áudio. Evite jargões técnicos excessivos. Foque-se na relação causa-efeito.

Responda APENAS com um objeto JSON que corresponda ao schema de saída especificado.
`,
});

const explainMapFlow = ai.defineFlow(
  {
    name: 'explainMapFlow',
    inputSchema: ExplainMapInputSchema,
    outputSchema: ExplainMapOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("A IA não conseguiu gerar uma explicação para o mapa.");
    }
    return output;
  }
);

export async function explainMap(input: ExplainMapInput): Promise<ExplainMapOutput> {
  return explainMapFlow(input);
}
