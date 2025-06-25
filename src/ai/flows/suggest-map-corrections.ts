'use server';
/**
 * @fileOverview AI-powered ECU map correction suggestions.
 *
 * - suggestMapCorrections - A function that suggests corrections to the ECU map based on test data and target Lambda.
 * - SuggestMapCorrectionsInput - The input type for the suggestMapCorrections function.
 * - SuggestMapCorrectionsOutput - The return type for the suggestMapCorrections function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestMapCorrectionsInputSchema = z.object({
  mapData: z.array(
    z.array(z.number()).describe('Os dados originais do mapa da ECU (array 2D).')
  ).describe('Dados originais do mapa da ECU.'),
  lambdaTarget: z.array(
    z.array(z.number()).describe('Os valores Lambda alvo para o mapa da ECU.')
  ).describe('Valores Lambda alvo.'),
  testData: z.array(
    z.object({
      rpm: z.number().describe('RPM do motor durante o ensaio.'),
      carga: z.number().describe('Carga do motor durante o ensaio (%).'),
      lambda: z.number().describe('Fator Lambda medido durante o ensaio.'),
    })
  ).describe('Dados de ensaio recolhidos durante o funcionamento do motor.'),
  aggressiveness: z.number().describe('A agressividade da correção (0-1).'),
  eixo_x: z.array(z.number()).describe('Valores do eixo X (ex. Carga)'),
  eixo_y: z.array(z.number()).describe('Valores do eixo Y (ex. RPM)'),
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
});
export type SuggestMapCorrectionsOutput = z.infer<typeof SuggestMapCorrectionsOutputSchema>;


export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<SuggestMapCorrectionsOutput> {
  return suggestMapCorrectionsFlow(input);
}

// Internal schema for what we ask the AI to generate. Much simpler and more reliable.
const AiOutputSchema = z.object({
  lambdaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('Os valores de Lambda medidos interpolados para a grelha do mapa da ECU. Use null para células sem dados.')
  ).describe('Grelha de Lambda medido.'),
});

const prompt = ai.definePrompt({
    name: 'generateLambdaMeasuredGridPrompt',
    input: {schema: SuggestMapCorrectionsInputSchema},
    output: {schema: AiOutputSchema},
    prompt: `Você é um engenheiro de calibração de motores. Sua única tarefa é analisar os dados de um mapa de combustível de uma ECU e os dados de um teste de dinamômetro, e criar uma grelha de valores de lambda medidos.

**SAÍDA OBRIGATÓRIA**:
A sua saída DEVE ser um único objeto JSON contendo APENAS a chave \`lambdaMeasuredGrid\`.

- **\`lambdaMeasuredGrid\`**: Crie uma grelha com as mesmas dimensões do \`mapData\` de entrada. Para cada célula no mapa, encontre os pontos correspondentes nos \`testData\` (usando os eixos \`eixo_x\` e \`eixo_y\` para interpolação) e preencha com o valor de lambda medido.
  - Se vários pontos de teste corresponderem a uma única célula, use o valor MÉDIO de lambda.
  - Para células do mapa que não tenham dados de teste correspondentes, o valor DEVE ser \`null\`.
  - Esta grelha DEVE ter exatamente as mesmas dimensões (linhas e colunas) que o \`mapData\` original.

**NÃO FAÇA MAIS NADA.** Não calcule mapas corrigidos nem percentagens de correção. A sua única responsabilidade é gerar a \`lambdaMeasuredGrid\`. O formato deve corresponder exatamente ao schema de saída fornecido.

Dados de Entrada:
mapData: {{{json mapData}}}
testData: {{{json testData}}}
eixo_x: {{{json eixo_x}}}
eixo_y: {{{json eixo_y}}}
`,
});

const suggestMapCorrectionsFlow = ai.defineFlow(
  {
    name: 'suggestMapCorrectionsFlow',
    inputSchema: SuggestMapCorrectionsInputSchema,
    outputSchema: SuggestMapCorrectionsOutputSchema,
  },
  async (input) => {
    // 1. Ask the AI to do the one thing it's good at: interpolate test data onto a grid.
    const { output: aiOutput } = await prompt(input);
    
    if (!aiOutput || !aiOutput.lambdaMeasuredGrid) {
      throw new Error("A IA não conseguiu gerar uma grelha de lambda. Tente novamente.");
    }
    
    // Clean the AI output just in case it returns non-numbers
    const lambdaMeasuredGrid = aiOutput.lambdaMeasuredGrid.map(row =>
        (row || []).map(cell => (typeof cell === 'number' && !isNaN(cell)) ? cell : null)
    );

    const { mapData, lambdaTarget, aggressiveness } = input;

    // 2. Calculate correctionPercentageMap deterministically in code.
    const correctionPercentageMap = lambdaMeasuredGrid.map((row, y) => {
        return row.map((measuredLambda, x) => {
            const target = lambdaTarget[y]?.[x];
            if (measuredLambda === null || target === null || target === undefined || target === 0) {
                return 0; // No data or no target, so no correction.
            }
            // Formula: ((measured / target) - 1) * 100
            return ((measuredLambda / target) - 1) * 100;
        });
    });

    // 3. Calculate correctedMap deterministically in code.
    const correctedMap = mapData.map((row, y) => {
        return row.map((originalValue, x) => {
            const correctionPercent = correctionPercentageMap[y]?.[x];
            if (originalValue === null || originalValue === undefined || correctionPercent === null || correctionPercent === undefined) {
                return originalValue; // Keep original value if it's null or no correction exists
            }
            // Formula: original * (1 + (correctionPercent / 100) * aggressiveness)
            const newValue = originalValue * (1 + (correctionPercent / 100) * aggressiveness);
            return newValue;
        });
    });
    
    // Return all three maps, which will now reliably match the final output schema.
    return {
      correctedMap,
      correctionPercentageMap,
      lambdaMeasuredGrid,
    };
  }
);
