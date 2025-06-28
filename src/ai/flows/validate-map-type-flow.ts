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
1.  **Use Pontos de Referência:** Esta é a sua regra mais importante. Um mapa de motor segue um padrão lógico.
    - A primeira célula (canto superior esquerdo) corresponde a **baixa carga e baixa rotação** (ex: TPS/Carga ~1-10%, RPM ~800-1200).
    - A última célula (canto inferior direito) corresponde a **alta carga e alta rotação** (ex: TPS/Carga ~100%, RPM máxima do motor).
    - Use estes pontos de referência para validar se os valores dos eixos (\`xAxis\`, \`yAxis\`) fazem sentido. Se o primeiro valor de RPM for 15000, a equação está errada. Se o primeiro valor de TPS for 50, a equação está errada.
2.  **Analise o Nome do Mapa:** Use o \`mapName\` para entender o tipo de mapa esperado (Ignição, Combustível, ETV, etc.).
3.  **Examine os Dados:** Compare os valores em \`mapData\` com os padrões esperados para o tipo de mapa identificado.
    - **Mapa de Acelerador Eletrónico (ETV):** Valores de dados devem ser 0-100. Se estiverem na casa dos milhares, a equação de dados está errada. Correção comum: \`X / 655.35\`.
    - **Eixo de Posição do Acelerador (TPS):** Valores de eixo devem ser 0-100. Se excederem 100, a equação do eixo está errada. Correção comum: \`X / 10.23\`.
    - **Mapa de Ignição (Avanço de Ponto):** Valores de dados devem ser tipicamente entre -20 e 60.
    - **Mapa de Combustível (VE):** Valores de dados tipicamente entre 30 e 120.
4.  **Seja Proativo nas Sugestões:** Com base nos pontos de referência e na análise dos dados, preencha os campos de sugestão. Se os eixos estiverem claramente incorretos, **sugira equações para os corrigir**, mesmo que o XDF não tenha nenhuma. Se os dados do mapa estiverem na escala errada, sugira a correção.
    - \`suggestedEquation\`: Para corrigir os dados do mapa (eixo Z).
    - \`suggestedXAxisEquation\`: Para corrigir o eixo X.
    - \`suggestedYAxisEquation\`: Para corrigir o eixo Y.
5.  **Justifique a sua Conclusão:** No campo \`reasoning\`, explique o seu raciocínio de forma clara, referindo-se aos pontos de referência. Ex: "Confiança Baixa. O nome indica 'ETV', mas os valores estão na casa dos milhares. O primeiro valor do eixo Y é 12000, o que é um valor de RPM irrealista para a marcha lenta. Sugiro correções para os eixos e para os dados."

**Formato da Saída (JSON OBRIGATÓRIO):**
- \`confidence\`: "Alta", "Média", ou "Baixa".
- \`suspectedType\`: O tipo de mapa que você suspeita.
- \`reasoning\`: Justifique a sua conclusão.
- \`suggestedEquation\`: (Opcional) A nova equação sugerida para o eixo Z. Ex: "X / 655.35"
- \`suggestedXAxisEquation\`: (Opcional) A nova equação sugerida para o eixo X. Ex: "X / 10.23"
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
