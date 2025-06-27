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
  model: googleAI.model('gemini-2.0-flash'),
  input: { schema: ValidateMapTypeInputSchema },
  output: { schema: ValidateMapTypeOutputSchema },
  prompt: `Você é um engenheiro de calibração de ECU de classe mundial. A sua tarefa é analisar um mapa de ECU, identificar problemas comuns e, se possível, sugerir correções para as equações de conversão. Responda SEMPRE em Português do Brasil.

**Análise Crítica a Realizar:**
1.  Analise o \`mapName\` para entender o tipo de mapa esperado.
2.  Examine os dados nos eixos (\`xAxis\`, \`yAxis\`) e no mapa (\`mapData\`).
3.  Compare os valores com os padrões esperados:
    - **Mapa de Acelerador Eletrónico (ETV):** Valores devem ser idealmente 0-100 (percentagem ou graus). Se os valores em \`mapData\` estiverem na casa das centenas ou milhares, a equação está provavelmente errada. Uma correção comum para dados de 16-bit é \`X / 655.35\`.
    - **Eixo de Posição do Acelerador (TPS):** Valores devem ser 0-100. Se os valores no \`xAxis\` ou \`yAxis\` excederem 100 de forma significativa (ex: 117), a equação está errada. Uma correção comum para dados de 16-bit é \`X / 10.23\`.
    - **Mapa de Ignição (Avanço de Ponto):** Valores devem ser tipicamente entre -20 e 60. O avanço deve diminuir com o aumento da carga.
    - **Mapa de Combustível (VE):** Valores tipicamente entre 30 e 120, aumentando com RPM e carga.
4.  Com base nesta análise, preencha os campos de \`confidence\`, \`suspectedType\` e \`reasoning\`.
5.  **SUGESTÃO DE CORREÇÃO (O MAIS IMPORTANTE):** Se identificar um erro claro de magnitude (como nos exemplos de ETV ou TPS) e souber uma correção padrão, preencha os campos de sugestão. Se não houver um erro óbvio, deixe os campos de sugestão vazios.
    - \`suggestedEquation\`: Para corrigir os dados do mapa (eixo Z).
    - \`suggestedXAxisEquation\`: Para corrigir o eixo X.
    - \`suggestedYAxisEquation\`: Para corrigir o eixo Y.

**Formato da Saída (JSON):**
- \`confidence\`: "Alta", "Média", ou "Baixa".
- \`suspectedType\`: O tipo de mapa que você suspeita.
- \`reasoning\`: Justifique a sua conclusão. Seja explícito sobre a anomalia. Ex: "Confiança Baixa. O nome do mapa é 'ETV', mas os valores estão na casa dos milhares, indicando uma equação de conversão incorreta. Sugiro usar 'X / 655.35'."
- \`suggestedEquation\`: (Opcional) A nova equação sugerida para o eixo Z.
- \`suggestedXAxisEquation\`: (Opcional) A nova equação sugerida para o eixo X.
- \`suggestedYAxisEquation\`: (Opcional) A nova equação sugerida para o eixo Y.

**Dados de Entrada:**
mapName: {{{mapName}}}
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
