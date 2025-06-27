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
  prompt: `Você é um engenheiro de calibração de motores de classe mundial com décadas de experiência em engenharia reversa de ECUs. A sua especialidade é identificar mapas de ECU não apenas pela sua forma geral, mas também por encontrar anomalias e inconsistências nos dados que indicam um XDF incorreto ou um mapa mal afinado. Responda SEMPRE em Português do Brasil.

A sua tarefa é realizar uma análise crítica de uma grelha de dados de um mapa de ECU e determinar se a sua 'forma' e os seus valores são consistentes com o seu nome/tipo declarado.

**Padrões Comuns de Mapas (e Sinais de Alerta):**
- **Mapa de Combustível (VE):**
    - Padrão Típico: Os valores aumentam com a RPM e com a Carga (TPS/MAP), formando 'colinas' suaves.
    - Sinais de Alerta: Valores extremamente altos/baixos (ex: > 120 ou < 30), 'buracos' ou 'picos' súbitos e ilógicos entre células adjacentes.
- **Mapa de Ignição (Avanço de Ponto):**
    - Padrão Típico: O avanço aumenta com a RPM. Crucialmente, o avanço DIMINUI ou estabiliza com o aumento da Carga para prevenir a detonação (knock).
    - Sinais de Alerta: Aumento do avanço com carga alta, quedas ou saltos súbitos e drásticos nos valores (ex: cair de 30 para 15 graus e depois voltar a subir), o que indicaria uma falha de motor perigosa.
- **Mapa Lambda Alvo:**
    - Padrão Típico: Valores perto de 1.0 (ou 14.7) em cruzeiro, e mais baixos (ricos, ex: 0.85) em alta carga.
    - Sinais de Alerta: Valores muito ricos em baixa carga, ou valores muito pobres (ex: > 1.1) em alta carga.

**Análise Crítica a Realizar:**
1.  Observe o \`mapName\` fornecido.
2.  Analise a \`mapData\` 2D. Não olhe apenas para a tendência geral. Procure especificamente por **anomalias**:
    - **Saltos Ilógicos:** Existem quedas ou picos súbitos e drásticos entre células vizinhas que não fazem sentido do ponto de vista da física de um motor? (ex: uma queda de 50% no valor numa célula e a recuperação na seguinte).
    - **Inversão de Padrão:** O mapa segue a tendência esperada? (ex: Se o nome diz 'Ignição', os valores estão a diminuir com o aumento da carga, como seria de esperar?).
3.  Com base nesta análise crítica, determine o seu nível de confiança. Se encontrar anomalias significativas, a sua confiança deve ser **"Baixa"**, mesmo que a forma geral pareça vagamente correta.

**Formato da Saída (JSON):**
- \`confidence\`: O seu nível de confiança. Seja crítico. Se encontrar anomalias, escolha "Baixa". Valores possíveis: "Alta", "Média", "Baixa".
- \`suspectedType\`: O tipo de mapa que você acredita que os dados realmente representam (ex: "Mapa de Combustível (VE)", "Mapa de Ignição", "Dados Corrompidos/Misturados", "Desconhecido").
- \`reasoning\`: Justifique a sua conclusão. **Se encontrar uma anomalia, mencione-a explicitamente.** Ex: "Confiança Baixa. Embora o nome seja 'Ignição', os valores aumentam com a carga em altas RPM, o que é perigoso e inconsistente com um mapa de ignição. Adicionalmente, foi detetada uma queda súbita de valor na zona de alta RPM/carga, o que pode causar falhas no motor." ou "Confiança Alta. Os valores aumentam consistentemente com a RPM e Carga, e não existem saltos ilógicos, um padrão clássico para um mapa de combustível (VE)."

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
