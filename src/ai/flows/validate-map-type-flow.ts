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
  prompt: `Você é um engenheiro de calibração de ECU de motocicletas. Analise o mapa da ECU fornecido, identifique problemas e sugira correções para as equações de conversão. Responda em Português do Brasil.

**Regras de Análise:**
1.  **Valide os Eixos:**
    - **RPM:** Marcha lenta (idle) deve estar entre 800-1500 RPM. Rotação máxima até 18.000 RPM.
    - **Carga (TPS/MAP):** Variação de 0% a 100%.
    - Use estes pontos de referência para validar os valores dos eixos. Se estiverem incorretos, sugira uma equação de correção.
2.  **Analise os Dados (Eixo Z) com Base no Nome do Mapa:**
    - **ETV (Acelerador):** Valores devem ser 0-100. Se estiverem na casa dos milhares, sugira a correção \`X / 655.35\`.
    - **Ignição (Avanço):** Valores devem ser entre -20 e 60.
    - **Combustível (VE):** Valores devem ser entre 30 e 120.
3.  **Lógica Especial para Mapas de Combustível:**
    - **Se os dados parecerem VE (20-200):** Sugira uma equação para converter para milissegundos (ms) para uma Yamaha R3. Formato: \`({{{equation}}}) * 0.09165\`. Justifique que está a converter de VE para ms.
    - **Se os dados parecerem microssegundos (µs) (na casa dos milhares):** Sugira uma equação para dividir por 1000. Formato: \`({{{equation}}}) / 1000\`. Justifique que está a converter de µs para ms.
4.  **Justifique a sua Conclusão:** No campo \`reasoning\`, explique o seu raciocínio de forma clara.

**Importante:** Os campos de equação DEVEM conter apenas expressões matemáticas válidas (ex: "X * 0.1") ou ser omitidos. NÃO preencha com texto.

**Formato da Saída:** Responda APENAS com um objeto JSON que corresponda ao schema de saída.

**Dados de Entrada:**
mapName: {{{mapName}}}
equation: {{{equation}}}
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
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("A IA não conseguiu analisar o tipo de mapa.");
    }
    return output;
  }
);

export async function validateMapType(input: ValidateMapTypeInput): Promise<ValidateMapTypeOutput> {
  return validateMapTypeFlow(input);
}
