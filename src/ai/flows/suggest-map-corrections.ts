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
    })
  ).describe('Dados de ensaio recolhidos durante o funcionamento do motor.'),
  aggressiveness: z.number().describe('A agressividade da correção (0-1).'),
  eixo_x: z.array(z.number()).describe('Valores do eixo X (ex. Carga)'),
  eixo_y: z.array(z.number()).describe('Valores do eixo Y (ex. RPM)'),
  eixo_x_label: z.string().describe('Rótulo para o eixo X.'),
  eixo_y_label: z.string().describe('Rótulo para o eixo Y.'),
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
    prompt: `Você é um engenheiro de calibração de motores. A sua tarefa é mapear dados de ensaio para uma grelha, e apenas isso.

**CONTEXTO DOS EIXOS**:
- O eixo Y do mapa (\`eixo_y\`) corresponde a **{{{eixo_y_label}}}**.
- O eixo X do mapa (\`eixo_x\`) corresponde a **{{{eixo_x_label}}}**.
- Associe \`rpm\` e \`carga\` dos \`testData\` aos eixos corretos com base nestes rótulos.

**LÓGICA OBRIGATÓRIA**:
A sua única saída deve ser um objeto JSON com a chave \`lambdaMeasuredGrid\`. Siga estes passos EXATAMENTE:

1.  Crie uma grelha \`lambdaMeasuredGrid\` com as mesmas dimensões do \`mapData\` de entrada (mesmo número de linhas e colunas) e inicialize TODAS as suas células com o valor \`null\`.
2.  Crie uma estrutura de dados temporária (por exemplo, um dicionário ou mapa em memória) para armazenar correspondências. As chaves serão as coordenadas da grelha (ex: "y_x") e os valores serão listas de valores de lambda.
3.  **Itere sobre cada ponto em \`testData\`** (cada objeto com \`rpm\`, \`carga\`, \`lambda\`).
4.  Para cada ponto de ensaio, encontre a célula **única** na grelha que corresponde mais de perto aos valores de \`rpm\` e \`carga\` do ponto. Determine o índice \`y\` mais próximo em \`eixo_y\` e o índice \`x\` mais próximo em \`eixo_x\`.
5.  Adicione o valor de \`lambda\` desse ponto de ensaio à lista de lambdas para a coordenada encontrada (\`[y][x]\`) na sua estrutura temporária.
6.  Após iterar sobre TODOS os \`testData\`, percorra a sua estrutura temporária.
7.  Para cada coordenada \`[y][x]\` que tiver uma lista de lambdas, calcule a **média** desses valores.
8.  Atualize a célula \`[y][x]\` na sua \`lambdaMeasuredGrid\` com o valor médio calculado. As células que não tiveram correspondência com nenhum ponto de ensaio DEVEM permanecer \`null\`.

**EXEMPLO**:
- Se \`eixo_y\` é RPM e \`eixo_x\` é Carga.
- Um ponto de ensaio é \`{rpm: 2050, carga: 42, lambda: 0.95}\`.
- \`eixo_y\` tem os valores \`[..., 2000, 2200, ...]\` e \`eixo_x\` tem \`[..., 40, 50, ...]\`.
- A célula mais próxima é a que corresponde a \`2000\` RPM (índice \`y\`) e \`40\` Carga (índice \`x\`).
- Você adicionaria \`0.95\` à lista de lambdas para a célula \`[y][x]\`.
- Se outro ponto de ensaio também corresponder à mesma célula \`[y][x]\`, você adicionaria o seu lambda à mesma lista.
- No final, você calcularia a média da lista para essa célula.

**RESULTADO FINAL**:
A \`lambdaMeasuredGrid\` resultante conterá valores numéricos apenas para as células que corresponderam diretamente aos dados de ensaio, e \`null\` para todas as outras. Não preencha células vazias. Não faça interpolação entre células.

Dados de Entrada:
mapData: {{{json mapData}}}
testData: {{{json testData}}}
eixo_x: {{{json eixo_x}}}
eixo_y: {{{json eixo_y}}}
eixo_x_label: {{{eixo_x_label}}}
eixo_y_label: {{{eixo_y_label}}}
`,
});

const suggestMapCorrectionsFlow = ai.defineFlow(
  {
    name: 'suggestMapCorrectionsFlow',
    inputSchema: SuggestMapCorrectionsInputSchema,
    outputSchema: SuggestMapCorrectionsOutputSchema,
  },
  async (input) => {
    // 1. Ask the AI to do the one thing it's good at: map test data to a grid.
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
            // If there is no correction, or the original value is invalid, return the original value.
            if (correctionPercent === 0 || originalValue === null || originalValue === undefined) {
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
