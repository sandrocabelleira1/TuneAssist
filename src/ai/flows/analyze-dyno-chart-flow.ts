'use server';
/**
 * @fileOverview Um fluxo Genkit para analisar uma imagem de gráfico de dinamómetro e sugerir alterações de afinação.
 *
 * - analyzeDynoChart - A função principal que executa a análise.
 * - DynoChartAnalysisInput - O tipo de entrada para a função.
 * - DynoChartAnalysisOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const DynoChartAnalysisInputSchema = z.object({
    photoDataUri: z
    .string()
    .describe(
      "Uma foto de um gráfico de dinamómetro, como um URI de dados que deve incluir um tipo MIME e usar codificação Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
    mapJson: z.string().describe("Uma representação JSON do mapa de combustível atual da ECU."),
    axesJson: z.string().describe("Uma representação JSON dos eixos (RPM, carga) do mapa de combustível atual."),
});
export type DynoChartAnalysisInput = z.infer<typeof DynoChartAnalysisInputSchema>;

const DynoChartAnalysisOutputSchema = z.object({
  analysis: z
    .string()
    .describe('Uma análise detalhada do gráfico do dinamómetro e sugestões de afinação em formato Markdown.'),
});
export type DynoChartAnalysisOutput = z.infer<typeof DynoChartAnalysisOutputSchema>;


const analysisPrompt = ai.definePrompt(
    {
      name: 'dynoChartAnalysisPrompt',
      input: { schema: DynoChartAnalysisInputSchema },
      output: { schema: DynoChartAnalysisOutputSchema },
      prompt: `Você é um afinador de ECU especialista em analisar gráficos de dinamómetro.

      Tarefa:
      1. Analise a imagem do gráfico do dinamómetro fornecida. Identifique as curvas de potência (cv), torque (Nm) e, se visível, a curva de Relação Ar/Combustível (AFR ou Lambda).
      2. Analise o mapa de combustível atual e os seus eixos, fornecidos em formato JSON.
      3. Compare a performance no gráfico com o mapa de combustível.
      4. Forneça uma análise detalhada em formato Markdown.
      5. Dê sugestões específicas sobre como modificar o mapa de combustível para otimizar a performance. As sugestões devem ser claras e acionáveis, indicando as faixas de RPM e carga a serem ajustadas. Por exemplo: "Aumente o combustível em 5% na faixa de 4000-5000 RPM com carga de 80-100%" ou "A mistura está muito rica em baixas rotações; reduza o combustível em 3% até 3000 RPM".
      6. Se a curva de AFR for visível, baseie as suas sugestões principalmente nela, visando um valor ideal para máxima potência (geralmente em torno de 0.85-0.90 Lambda para motores a gasolina aspirados).
      7. Se a curva de AFR não for visível, infira a necessidade de ajuste com base nas quedas ou picos na curva de torque. Uma queda no torque pode indicar uma mistura pobre ou rica demais.
      
      Imagem do Gráfico do Dinamómetro:
      {{media url=photoDataUri}}
      
      Mapa de Combustível Atual (JSON):
      \`\`\`json
      {{{mapJson}}}
      \`\`\`
      
      Eixos do Mapa (JSON):
      \`\`\`json
      {{{axesJson}}}
      \`\`\`
      `,
    }
  );


const analyzeDynoChartFlow = ai.defineFlow(
  {
    name: 'analyzeDynoChartFlow',
    inputSchema: DynoChartAnalysisInputSchema,
    outputSchema: DynoChartAnalysisOutputSchema,
  },
  async (input) => {
    const { output } = await analysisPrompt(input);
    if (!output) {
      throw new Error("O modelo de IA não retornou uma análise válida.");
    }
    return output;
  }
);


export async function analyzeDynoChart(input: DynoChartAnalysisInput): Promise<DynoChartAnalysisOutput> {
  return await analyzeDynoChartFlow(input);
}

    