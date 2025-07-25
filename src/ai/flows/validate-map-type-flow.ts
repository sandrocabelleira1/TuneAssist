'use server';
/**
 * @fileOverview Um fluxo para analisar e validar o tipo de um mapa de ECU com base nos seus padrões de dados.
 *
 * - validateMapType - A função de fluxo.
 * - ValidateMapTypeInput - O tipo de entrada para a função.
 * - ValidateMapTypeOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  ValidateMapTypeInputSchema,
  ValidateMapTypeOutputSchema,
  type ValidateMapTypeInput,
  type ValidateMapTypeOutput,
} from '@/ai/schemas';

// Re-exporting types for consumers of this flow file
export type { ValidateMapTypeInput, ValidateMapTypeOutput };

const prompt = ai.definePrompt({
  name: 'validateMapTypePrompt',
  model: googleAI.model('gemini-1.5-flash-latest'),
  input: { schema: ValidateMapTypeInputSchema },
  output: { schema: ValidateMapTypeOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `Você é um engenheiro de calibração de ECU de motocicletas. Analise o mapa da ECU fornecido, identifique problemas e sugira equações de correção para os eixos e os dados. Responda em Português do Brasil.

**Regras de Análise:**
1.  **Valide os Eixos (X e Y):**
    -   Analise os valores nos eixos \`xAxis\` e \`yAxis\`.
    -   Com base no nome do mapa e nos valores dos dados, determine o que cada eixo provavelmente representa (ex: RPM, Posição da Borboleta/TPS, Pressão do Coletor/MAP).
    -   **RPM:** A marcha lenta (idle) deve estar entre 800-1500. A rotação máxima pode ir até 18.000. Se um eixo parece ser RPM mas os seus valores são muito baixos (ex: 10, 15, 20), sugira uma equação para o escalar corretamente, como \`X * 50\` ou \`X * 100\`. Preencha o campo \`suggestedXAxisEquation\` ou \`suggestedYAxisEquation\` correspondente.
    -   **Posição da Borboleta (TPS):** Geralmente varia de 0 a 100%. Se os valores do eixo estiverem na casa dos milhares (ex: 0 a 1023), sugira uma equação como \`X / 10.23\` para normalizar para uma escala de 0-100. Preencha o campo \`suggestedXAxisEquation\` ou \`suggestedYAxisEquation\` correspondente.

2.  **Analise os Dados (Eixo Z) com Base no Nome do Mapa:**
    -   **ETV (Acelerador):** Os valores devem ser 0-100. Se estiverem na casa dos milhares (ex: 0-65535), sugira a correção \`X / 655.35\` no campo \`suggestedEquation\`.
    -   **Ignição (Avanço):** Se o nome do mapa contém "Ign" ou "ignição", e os valores estão na faixa de 0-255 (típico de 8-bit), sugira a equação \`(X / 2) - 10\` no campo \`suggestedEquation\`. Esta é uma fórmula de conversão comum para graus de avanço. Justifique que os valores raw de 8-bit para ignição são frequentemente convertidos desta forma.
    -   **Combustível (VE):** Os valores devem estar num intervalo razoável para Eficiência Volumétrica, geralmente entre 30 e 120. Se os valores estiverem fora deste intervalo, considere o que podem representar.

3.  **Lógica Especial para Mapas de Combustível (Aplica-se ao Eixo Z):**
    -   **Se a ECU for de uma Yamaha R3 (marca: 'Yamaha', modelo: 'R3') E o nome do mapa indicar que é um mapa de combustível:** Se os dados do mapa (eixo Z) parecerem ser Eficiência Volumétrica (VE, valores entre 20-200), sugira uma equação para converter de VE para milissegundos (ms): \`({{{equation}}}) * 0.09165\`. Justifique que está a converter de VE para ms especificamente para a R3.
    -   **Para outras marcas ou se não for um mapa de combustível da R3:** Se os dados parecerem microssegundos (µs) (valores na casa dos milhares), sugira uma equação para dividir por 1000 no campo \`suggestedEquation\`. Formato: \`({{{equation}}}) / 1000\`. Justifique que está a converter de µs para ms.

4.  **Justifique a sua Conclusão:** No campo \`reasoning\`, explique o seu raciocínio para todas as correções sugeridas de forma clara.

**Importante:** Os campos de equação DEVEM conter apenas expressões matemáticas válidas (ex: "X * 0.1") ou ser omitidos. NÃO preencha com texto.

**Formato da Saída:** Responda APENAS com um objeto JSON que corresponda ao schema de saída.

**Dados de Entrada:**
mapName: {{{mapName}}}
equation: {{{equation}}}
brand: {{{brand}}}
model: {{{model}}}
mapData: {{{json mapData}}}
xAxis: {{{json xAxis}}}
yAxis: {{{json yAxis}}}
`,
});

const validateMapTypeFlow = ai.defineFlow(
  {
    name: 'validateMapTypeFlow',
    inputSchema: ValidateMapTypeInputSchema,
    outputSchema: ValidateMapTypeOutputSchema,
  },
  async (input) => {
    try {
        const { output } = await prompt(input);
        if (!output) {
            throw new Error("A IA não conseguiu analisar o tipo de mapa.");
        }
        return output;
    } catch (error) {
        // Re-throw to be caught by the action's error handler
        throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
);

export async function validateMapType(input: ValidateMapTypeInput): Promise<ValidateMapTypeOutput> {
  return validateMapTypeFlow(input);
}
