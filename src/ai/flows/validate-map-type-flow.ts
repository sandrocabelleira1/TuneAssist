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

**Padrões Comuns de Mapas (Forma e Magnitude):**
- **Mapa de Combustível (VE):**
    - Padrão Típico: Os valores aumentam com a RPM e com a Carga (TPS/MAP), formando 'colinas' suaves.
    - Magnitude Típica: Geralmente entre 30 e 120.
    - Sinais de Alerta: Valores extremamente altos/baixos, 'buracos' ou 'picos' súbitos e ilógicos.
- **Mapa de Ignição (Avanço de Ponto):**
    - Padrão Típico: O avanço aumenta com a RPM. Crucialmente, o avanço DIMINUI ou estabiliza com o aumento da Carga para prevenir a detonação (knock).
    - Magnitude Típica: Geralmente entre -10 e 60 graus.
    - Sinais de Alerta: Aumento do avanço com carga alta, quedas ou saltos súbitos, valores muito fora da faixa normal.
- **Mapa Lambda Alvo:**
    - Padrão Típico: Valores perto de 1.0 (ou 14.7) em cruzeiro, e mais baixos (ricos, ex: 0.85) em alta carga.
    - Magnitude Típica: Geralmente entre 0.7 e 1.2.
    - Sinais de Alerta: Valores muito ricos em baixa carga, ou valores muito pobres em alta carga.
- **Mapa de Acelerador Eletrónico (ETV/TPS):**
    - Padrão Típico: Os valores aumentam com a posição do pedal e RPM.
    - Magnitude Típica: Valores em graus (0-90) ou percentagem (0-100).
    - Sinais de Alerta: **Valores na casa das centenas ou milhares indicam quase certamente uma equação de conversão em falta ou incorreta no XDF.**

**Análise Crítica a Realizar:**
1.  Observe o \`mapName\` fornecido.
2.  Analise a \`mapData\` 2D. Verifique a **Forma** e a **Magnitude**.
    - **Análise da Forma:** O padrão geral (subidas, descidas) corresponde ao tipo de mapa esperado? Existem anomalias como saltos ilógicos, 'buracos' ou 'picos' drásticos entre células vizinhas?
    - **Análise da Magnitude:** A gama de valores (mínimo, máximo, média) está dentro do esperado para este tipo de mapa? (Ex: Se o nome diz 'Acelerador', os valores são de 0-100 ou estão na casa dos milhares?)
3.  Com base nesta análise DUPLA (Forma + Magnitude), determine o seu nível de confiança. Se encontrar anomalias significativas em qualquer uma delas, a sua confiança deve ser **"Baixa"**.

**Formato da Saída (JSON):**
- \`confidence\`: O seu nível de confiança. Seja crítico. Se encontrar anomalias, escolha "Baixa". Valores possíveis: "Alta", "Média", "Baixa".
- \`suspectedType\`: O tipo de mapa que você acredita que os dados realmente representam (ex: "Mapa de Combustível (VE)", "Mapa de Ignição", "Dados Corrompidos/Misturados", "Desconhecido").
- \`reasoning\`: Justifique a sua conclusão. **Se encontrar uma anomalia, mencione-a explicitamente.** Ex: "Confiança Baixa. O nome do mapa é 'MAP ETV', mas os valores estão na casa dos milhares, o que é inconsistente com graus ou percentagem. Isto indica fortemente que a equação de conversão no ficheiro XDF está em falta ou incorreta, mostrando os valores 'crus' em vez das unidades de engenharia." ou "Confiança Alta. Os valores aumentam consistentemente com a RPM e Carga, e não existem saltos ilógicos, um padrão clássico para um mapa de combustível (VE)."

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
