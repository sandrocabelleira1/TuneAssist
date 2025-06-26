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
});
export type SuggestMapCorrectionsOutput = z.infer<typeof SuggestMapCorrectionsOutputSchema>;


export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<SuggestMapCorrectionsOutput> {
  return suggestMapCorrectionsFlow(input);
}

// Internal schema for what we ask the AI to generate. Much simpler and more reliable.
const AiOutputSchema = z.object({
    lambdaGridWithMatches: z.array(
        z.array(z.array(z.number())).describe('Uma grelha onde cada célula contém uma lista de valores lambda dos dados de ensaio que lhe correspondem. Uma lista vazia significa que não há correspondência.')
      ).describe('Grelha com listas de valores lambda correspondentes.'),
});

const prompt = ai.definePrompt({
    name: 'generateLambdaMatchesPrompt',
    model: googleAI.model('gemini-2.0-flash'),
    input: {schema: SuggestMapCorrectionsInputSchema},
    output: {schema: AiOutputSchema},
    prompt: `Você é um engenheiro de calibração de motores. A sua tarefa é mapear os dados de ensaio fornecidos para uma grelha.

**CONTEXTO DOS EIXOS**:
- O eixo Y do mapa (\`eixo_y\`) corresponde a **{{{eixo_y_label}}}**.
- O eixo X do mapa (\`eixo_x\`) corresponde a **{{{eixo_x_label}}}**.
- Associe \`rpm\` e \`carga\` dos \`testData\` aos eixos corretos com base nestes rótulos.

**LÓGICA OBRIGATÓRIA**:
A sua única saída deve ser um objeto JSON com a chave \`lambdaGridWithMatches\`. Siga estes passos EXATAMENTE:

1.  Crie uma grelha \`lambdaGridWithMatches\` com as mesmas dimensões do \`mapData\` de entrada (mesmo número de linhas e colunas) e inicialize CADA célula com uma **lista vazia** \`[]\`.
2.  **Itere sobre cada ponto em \`testData\`** (cada objeto com \`rpm\`, \`carga\`, \`lambda\`).
3.  Para cada ponto de ensaio, encontre a célula **única** na grelha que corresponde mais de perto aos valores de \`rpm\` e \`carga\` do ponto. Determine o índice \`y\` mais próximo em \`eixo_y\` e o índice \`x\` mais próximo em \`eixo_x\`.
4.  Adicione o valor de \`lambda\` desse ponto de ensaio à lista na coordenada \`[y][x]\` da sua grelha \`lambdaGridWithMatches\`. Se um ponto de ensaio anterior já correspondeu a esta célula, adicione o novo lambda à lista existente.

**EXEMPLO**:
- Se \`eixo_y\` é RPM e \`eixo_x\` é Carga.
- Um ponto de ensaio é \`{rpm: 2050, carga: 42, lambda: 0.95}\`.
- \`eixo_y\` tem os valores \`[..., 2000, 2200, ...]\` e \`eixo_x\` tem \`[..., 40, 50, ...]\`.
- A célula mais próxima é a que corresponde a \`2000\` RPM (índice \`y\`) e \`40\` Carga (índice \`x\`).
- Você adicionaria \`0.95\` à lista na célula \`[y][x]\`. A célula \`[y][x]\` seria \`[0.95]\`.
- Se outro ponto de ensaio \`{rpm: 2040, carga: 41, lambda: 0.96}\` também corresponder à mesma célula, a lista tornar-se-ia \`[0.95, 0.96]\`.

**RESULTADO FINAL**:
A grelha \`lambdaGridWithMatches\` resultante conterá listas de números apenas para as células que corresponderam diretamente aos dados de ensaio, e **listas vazias \`[]\`** para todas as outras. Não faça interpolação. Não adicione valores que não sejam dos \`testData\`.

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
    // 1. Ask the AI to do the one thing it's good at: map test data to lists in a grid.
    const { output: aiOutput } = await prompt(input);
    
    if (!aiOutput || !aiOutput.lambdaGridWithMatches) {
      throw new Error("A IA não conseguiu mapear os dados de ensaio. Tente novamente.");
    }
    
    // 2. Now, we deterministically build the lambdaMeasuredGrid from the AI's output.
    const lambdaMeasuredGrid = aiOutput.lambdaGridWithMatches.map(row =>
      (row || []).map(cellMatches => {
        if (!cellMatches || cellMatches.length === 0) {
          return null; // No matches for this cell.
        }
        // Filter out any invalid numbers the AI might have hallucinated
        const validMatches = cellMatches.filter(lambda => typeof lambda === 'number' && !isNaN(lambda) && lambda > 0);
        if (validMatches.length === 0) {
            return null;
        }
        // Calculate the average of the valid lambda values for the cell.
        const sum = validMatches.reduce((a, b) => a + b, 0);
        return sum / validMatches.length;
      })
    );

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
    
    // Return all three maps, which will now reliably match the final output schema.
    return {
      correctedMap,
      correctionPercentageMap,
      lambdaMeasuredGrid,
    };
  }
);
