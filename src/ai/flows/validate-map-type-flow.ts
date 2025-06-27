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
  prompt: `Você é um engenheiro de calibração de motores de classe mundial com décadas de experiência em engenharia reversa de ECUs. A sua especialidade é identificar mapas de ECU apenas olhando para a sua forma e padrões de dados.

A sua tarefa é analisar uma grelha de dados de um mapa de ECU e determinar se a sua 'forma' corresponde ao seu nome/tipo declarado.

**Padrões Comuns de Mapas:**
- **Mapa de Combustível (Eficiência Volumétrica - VE):** Os valores representam a eficiência do enchimento do cilindro. Geralmente, os valores aumentam com a RPM e com a Carga (TPS/MAP) à medida que o motor entra na sua faixa de eficiência ótima. A forma do mapa parece-se com 'colinas' e 'vales'. Os valores raramente são uniformes.
- **Mapa de Ignição (Avanço de Ponto):** Os valores representam graus de avanço de ignição. Geralmente, o avanço aumenta com a RPM para compensar o tempo de combustão. No entanto, o avanço DIMINUI com o aumento da Carga para prevenir a detonação (knock). A forma é muito distinta da de um mapa de combustível.
- **Mapa Lambda Alvo:** Os valores representam a relação ar/combustível alvo. Geralmente, os valores são próximos de 1.0 (estequiométrico para gasolina) em áreas de cruzeiro (baixa carga, RPM média) e tornam-se mais baixos (mais ricos, ex: 0.85) em áreas de alta carga e alta RPM para potência máxima e segurança do motor.
- **Mapa de Injeção de Partida a Frio:** Os valores são muito altos a baixas temperaturas e diminuem drasticamente à medida que o motor aquece. Um dos eixos é quase sempre a temperatura.
- **Mapa de Pressão do Turbo (Boost):** Os valores representam a pressão alvo. Geralmente aumentam com a RPM e carga até atingirem um limite máximo definido.

**Análise a Realizar:**
1.  Observe o \`mapName\` fornecido (ex: "combustivel tps cyl1", "ponto ignicao principal").
2.  Analise a \`mapData\` 2D. Verifique como os valores mudam ao longo do eixo Y (\`yAxis\`, tipicamente RPM) e do eixo X (\`xAxis\`, tipicamente Carga).
3.  Compare o padrão observado com os padrões de mapas comuns descritos acima.
4.  Com base na sua análise, determine a probabilidade de a \`mapData\` corresponder ao seu \`mapName\`.

**Formato da Saída (JSON):**
- \`confidence\`: O seu nível de confiança de que o nome do mapa corresponde aos dados. Valores possíveis: "Alta", "Média", "Baixa".
- \`suspectedType\`: O tipo de mapa que você acredita que os dados realmente representam (ex: "Mapa de Combustível (VE)", "Mapa de Ignição", "Mapa Lambda Alvo", "Desconhecido").
- \`reasoning\`: Uma explicação concisa e clara para o utilizador, justificando a sua conclusão. Explique a sua lógica em termos simples. Ex: "Os valores aumentam consistentemente com a RPM e a Carga, o que é um padrão clássico para um mapa de combustível (VE). A 'forma' dos dados é consistente com o nome do mapa." ou "Os valores diminuem com o aumento da carga, o que é um forte indicador de um mapa de ignição, não de um mapa de combustível como o nome sugere."

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
