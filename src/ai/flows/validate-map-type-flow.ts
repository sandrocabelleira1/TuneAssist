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
  prompt: `Você é um engenheiro de calibração de ECU de classe mundial, especializado em motocicletas de alto desempenho. A sua tarefa é analisar um mapa de ECU, identificar problemas comuns e, se possível, sugerir correções para as equações de conversão. Responda SEMPRE em Português do Brasil.

**Análise Crítica a Realizar:**
1.  **Use Pontos de Referência Lógicos para Motores de Motocicleta:** A sua regra mais importante é validar se os eixos seguem um padrão lógico para um motor de motocicleta.
    - **Eixo de RPM (Rotações por Minuto):** O eixo deve ser monotónico (valores aumentam ou diminuem de forma consistente). A marcha lenta (idle) fica geralmente entre **800 e 1500 RPM**. O primeiro valor do eixo de RPM deve estar próximo desta faixa. Um primeiro valor de 5000 RPM, por exemplo, indica que a equação provavelmente está incorreta. A rotação máxima pode chegar até **18.000 RPM** em motos desportivas, portanto, valores altos no final do eixo são normais.
    - **Eixo de Carga (TPS ou MAP):** Geralmente varia de 0% a 100%. O primeiro valor deve estar próximo de 0-10%, e o último próximo de 100%.
    - Use estes pontos de referência para validar se os valores dos eixos (\`xAxis\`, \`yAxis\`) fazem sentido.
2.  **Analise o Nome do Mapa:** Use o \`mapName\` para entender o tipo de mapa esperado (Ignição, Combustível, ETV, etc.).
3.  **Examine os Dados (Eixo Z):** Compare os valores em \`mapData\` com os padrões esperados para o tipo de mapa identificado.
    - **Mapa de Acelerador Eletrónico (ETV):** Valores de dados devem ser 0-100. Se estiverem na casa dos milhares, a equação de dados está errada. Correção comum: \`X / 655.35\`.
    - **Mapa de Ignição (Avanço de Ponto):** Valores de dados devem ser tipicamente entre -20 e 60 graus.
    - **Mapa de Combustível (Eficiência Volumétrica - VE):** Valores de dados tipicamente entre 30 e 120.
4.  **Seja Proativo nas Sugestões:** Com base nos pontos de referência e na análise dos dados, preencha os campos de sugestão. Se um eixo está claramente fora da escala esperada (ex: eixo de RPM começa em 8000), **sugira uma equação para o corrigir**, mesmo que o XDF não tenha nenhuma. Se os dados do mapa estiverem na escala errada, sugira a correção.
    - \`suggestedEquation\`: Para corrigir os dados do mapa (eixo Z).
    - \`suggestedXAxisEquation\`: Para corrigir o eixo X.
    - \`suggestedYAxisEquation\`: Para corrigir o eixo Y.
    **Importante:** Os campos de equação DEVEM conter apenas expressões matemáticas válidas (ex: "X * 0.1") ou ser omitidos do JSON de saída. NÃO preencha estes campos com texto como "análise necessária".
5.  **Lógica Especial para Mapas de Combustível:** Esta é a sua tarefa mais importante. Se o \`mapName\` contiver "Comb" (Combustível), "Fuel", ou "Injeção", e os valores em \`mapData\` estiverem maioritariamente entre 20 e 200, é quase certo que a equação atual (\`equation\`) está a calcular um valor de Carga ou Eficiência Volumétrica (VE), e NÃO o tempo de injeção final. O utilizador precisa de ver o tempo de injeção em milissegundos (ms), que para uma Yamaha R3 estará tipicamente na casa dos 1-8 ms.
    - **Sua Tarefa OBRIGATÓRIA:** Você DEVE compor uma nova equação para o campo \`suggestedEquation\`. Esta nova equação TEM de pegar na equação existente (do campo \`equation\`) e multiplicá-la por um fator de conversão.
    - **Fator de Conversão:** Para uma Yamaha R3, o fator de conversão de VE para tempo de injeção (ms) é tipicamente **0.09165**.
    - **Regra de Composição:** A sua sugestão DEVE seguir este formato: \`({{{equation}}}) * 0.09165\`. Não simplifique a expressão. Se a equação for \`X/128\`, a sua sugestão TEM de ser \`(X/128) * 0.09165\`. Se a equação for \`X\`, a sua sugestão TEM de ser \`(X) * 0.09165\`. Se a equação for \`X/514.56\`, a sua sugestão TEM de ser \`(X/514.56) * 0.09165\`.
    - **Justificação:** No campo \`reasoning\`, explique: "Os valores atuais parecem ser de Eficiência Volumétrica (VE). Para mostrar o tempo de injeção real em milissegundos (ms), que é a unidade padrão no TunerPro, sugeri uma nova equação que multiplica o cálculo de VE por um fator de conversão típico para os injetores de uma Yamaha R3." Defina a confiança como 'Alta' ou 'Média'.
6.  **Justifique a sua Conclusão:** No campo \`reasoning\`, explique o seu raciocínio de forma clara, referindo-se aos pontos de referência. Ex: "Confiança Baixa. O eixo de RPM começa em 8000, o que é um valor irrealista para a marcha lenta. O nome indica 'Ignição', mas os valores dos dados estão acima de 200, sugerindo que a escala está incorreta. Sugiro correções para os eixos e para os dados."

**Formato da Saída (JSON OBRIGATÓRIO):**
A sua resposta deve ser um objeto JSON que corresponda ao schema de saída, contendo apenas os campos definidos. Se não tiver uma sugestão de equação, OMITE o campo correspondente (suggestedEquation, suggestedXAxisEquation, suggestedYAxisEquation).

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
