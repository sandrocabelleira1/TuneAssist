'use server';
/**
 * @fileOverview AI-powered ECU map correction suggestions.
 *
 * - suggestMapCorrections - A function that suggests corrections to the ECU map based on test data and target Lambda.
 * - SuggestMapCorrectionsInput - The input type for the suggestMapCorrections function.
 * - SuggestMapCorrectionsOutput - The return type for the suggestMapCorrections function.
 */

import {ai} from '@/ai/genkit';
import {googleAI} from '@genkit-ai/googleai';
import {z} from 'zod';

const SuggestMapCorrectionsInputSchema = z.object({
  mapData: z.array(
    z.array(z.number().nullable()).describe('Os dados originais do mapa da ECU (array 2D).')
  ).describe('Dados originais do mapa da ECU.'),
  lambdaTarget: z.array(
    z.array(z.number().nullable()).describe('Os valores Lambda alvo para o mapa da ECU.')
  ).describe('Valores Lambda alvo.'),
  testData: z.array(
    z.object({
      rpm: z.number().describe('RPM do motor durante o ensaio.'),
      carga: z.number().describe('Carga do motor durante o ensaio (%).'),
      lambda: z.number().describe('Fator Lambda medido durante o ensaio.'),
      torque: z.number().optional().describe('O torque medido durante o ensaio (Nm).'),
      potencia: z.number().optional().describe('A potência medida durante o ensaio (CV).'),
    })
  ).describe('Dados de ensaio recolhidos durante o funcionamento do motor.'),
  aggressiveness: z.number().describe('A agressividade da correção (0-1).'),
  eixo_x: z.array(z.number()).describe('Valores do eixo X (ex. Carga)'),
  eixo_y: z.array(z.number()).describe('Valores do eixo Y (ex. RPM)'),
  eixo_x_label: z.string().describe('Rótulo para o eixo X.'),
  eixo_y_label: z.string().describe('Rótulo para o eixo Y.'),
  factorySpecs: z.string().optional().describe('Especificações de fábrica ou notas fornecidas pelo utilizador para dar contexto à IA.')
});
export type SuggestMapCorrectionsInput = z.infer<typeof SuggestMapCorrectionsInputSchema>;

const SuggestMapCorrectionsOutputSchema = z.object({
  correctedMap: z.array(
    z.array(z.number().nullable()).describe('Os dados corrigidos do mapa da ECU (array 2D).')
  ).describe('Dados corrigidos do mapa da ECU.'),
  correctionPercentageMap: z.array(
    z.array(z.number().nullable()).describe('A percentagem de correção aplicada a cada célula no mapa da ECU.')
  ).describe('Mapa de percentagem de correção.'),
  lambdaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('Os valores de Lambda medidos interpolados para a grelha do mapa da ECU. Use null para células sem dados.')
  ).describe('Grelha de Lambda medido.'),
  torqueMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('Os valores de Torque medidos interpolados para a grelha do mapa da ECU. Use null para células sem dados.')
  ).describe('Grelha de Torque medido.'),
  potenciaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('Os valores de Potência medidos interpolados para a grelha do mapa da ECU. Use null para células sem dados.')
  ).describe('Grelha de Potência medida.'),
});
export type SuggestMapCorrectionsOutput = z.infer<typeof SuggestMapCorrectionsOutputSchema>;


export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<SuggestMapCorrectionsOutput> {
  return suggestMapCorrectionsFlow(input);
}

// The AI now generates the fully interpolated grids directly.
const AiOutputSchema = z.object({
  lambdaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('A grelha completa de valores Lambda medidos, interpolada para preencher todas as células.')
  ).describe('Grelha de Lambda medido interpolada.'),
  torqueMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('A grelha completa de valores de Torque medidos, interpolada. Use null se não houver dados de torque.')
  ).describe('Grelha de Torque medido interpolada.'),
  potenciaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('A grelha completa de valores de Potência medidos, interpolada. Use null se não houver dados de potência.')
  ).describe('Grelha de Potência medida interpolada.'),
});

const prompt = ai.definePrompt({
    name: 'generateInterpolatedGridPrompt',
    model: googleAI.model('gemini-2.0-flash'),
    input: {schema: SuggestMapCorrectionsInputSchema},
    output: {schema: AiOutputSchema},
    prompt: `Você é um engenheiro de calibração de motores de classe mundial. A sua tarefa é pegar em dados de ensaio esparsos e gerar grelhas de dados medidas completas e interpoladas.

**CONTEXTO DOS EIXOS**:
- O eixo Y do mapa (\`eixo_y\`) corresponde a **{{{eixo_y_label}}}**.
- O eixo X do mapa (\`eixo_x\`) corresponde a **{{{eixo_x_label}}}**.
- Associe \`rpm\` e \`carga\` dos \`testData\` aos eixos corretos com base nestes rótulos.

**LÓGICA OBRIGATÓRIA**:
A sua única saída deve ser um objeto JSON contendo \`lambdaMeasuredGrid\`, \`torqueMeasuredGrid\`, e \`potenciaMeasuredGrid\`. Siga estes passos EXATAMENTE:

1.  **Mapeamento Inicial:** Primeiro, mapeie cada ponto de dados em \`testData\` para a sua célula correspondente mais próxima na grelha (usando \`eixo_x\` e \`eixo_y\`). Para células que recebem múltiplos pontos de dados, **calcule a média** dos valores (lambda, torque, potência). Isto cria grelhas esparsas com valores apenas onde existem dados de ensaio.
2.  **Interpolação Inteligente:** Agora, o passo mais importante. Preencha TODAS as células vazias nas grelhas de lambda, torque e potência. A interpolação deve ser **inteligente e suave**, como um engenheiro faria. Considere os valores vizinhos e a posição nos eixos RPM e Carga. Os valores devem mudar de forma lógica e gradual, evitando saltos bruscos. O objetivo é criar uma representação completa e realista do comportamento do motor em toda a faixa de operação.
3.  **Resultado Final:** As grelhas resultantes devem ter as mesmas dimensões do \`mapData\` de entrada e estar totalmente preenchidas com valores numéricos. Use \`null\` apenas se for absolutamente impossível determinar um valor para uma célula (por exemplo, para torque e potência se não forem fornecidos dados de ensaio).

Dados de Entrada:
mapData: {{{json mapData}}}
testData: {{{json testData}}}
eixo_x: {{{json eixo_x}}}
eixo_y: {{{json eixo_y}}}
eixo_x_label: {{{eixo_x_label}}}
eixo_y_label: {{{eixo_y_label}}}
{{#if factorySpecs}}
factorySpecs: {{{factorySpecs}}}
{{/if}}
`,
});

const suggestMapCorrectionsFlow = ai.defineFlow(
  {
    name: 'suggestMapCorrectionsFlow',
    inputSchema: SuggestMapCorrectionsInputSchema,
    outputSchema: SuggestMapCorrectionsOutputSchema,
  },
  async (input) => {
    // 1. Ask the AI to map AND interpolate test data into full grids.
    const { output: aiOutput } = await prompt(input);
    
    if (!aiOutput || !aiOutput.lambdaMeasuredGrid) {
      throw new Error("A IA não conseguiu gerar as grelhas de dados interpoladas. Tente novamente.");
    }

    // 2. The AI's output is now the data we need. No more processing needed.
    const { lambdaMeasuredGrid, torqueMeasuredGrid, potenciaMeasuredGrid } = aiOutput;
    
    const { mapData, lambdaTarget, aggressiveness } = input;

    // 3. Calculate correctionPercentageMap deterministically in code.
    const correctionPercentageMap = lambdaMeasuredGrid.map((row, y) => {
        return row.map((measuredLambda, x) => {
            const target = lambdaTarget[y]?.[x];
            if (measuredLambda === null || target === null || target === undefined || target === 0) {
                return null; // No data or no target, so no correction.
            }
            // Formula: ((measured / target) - 1) * 100
            return ((measuredLambda / target) - 1) * 100;
        });
    });

    // 4. Calculate correctedMap deterministically in code.
    const correctedMap = mapData.map((row, y) => {
        return row.map((originalValue, x) => {
            const correctionPercent = correctionPercentageMap[y]?.[x];
            // If there is no correction (null), or the original value is invalid, return the original value.
            if (correctionPercent === null || correctionPercent === undefined || originalValue === null || originalValue === undefined) {
                return originalValue;
            }
            // Formula: original * (1 + (correctionPercent / 100) * aggressiveness)
            const newValue = originalValue * (1 + (correctionPercent / 100) * aggressiveness);
            return newValue;
        });
    });
    
    // Return all maps, which will now reliably match the final output schema.
    return {
      correctedMap,
      correctionPercentageMap,
      lambdaMeasuredGrid,
      torqueMeasuredGrid: torqueMeasuredGrid || [], // Ensure it's an array
      potenciaMeasuredGrid: potenciaMeasuredGrid || [], // Ensure it's an array
    };
  }
);
