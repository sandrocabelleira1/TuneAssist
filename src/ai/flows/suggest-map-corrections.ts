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
    z.array(z.number()).describe('Os dados corrigidos do mapa da ECU (array 2D).')
  ).describe('Dados corrigidos do mapa da ECU.'),
  correctionPercentageMap: z.array(
    z.array(z.number()).describe('A percentagem de correção aplicada a cada célula no mapa da ECU.')
  ).describe('Mapa de percentagem de correção.'),
  lambdaMeasuredGrid: z.array(
    z.array(z.number().nullable()).describe('Os valores de Lambda medidos interpolados para a grelha do mapa da ECU. Use null para células sem dados.')
  ).describe('Grelha de Lambda medido.'),
});
export type SuggestMapCorrectionsOutput = z.infer<typeof SuggestMapCorrectionsOutputSchema>;

export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<SuggestMapCorrectionsOutput> {
  return suggestMapCorrectionsFlow(input);
}

const prompt = ai.definePrompt({
    name: 'suggestMapCorrectionsPrompt',
    input: {schema: SuggestMapCorrectionsInputSchema},
    output: {schema: SuggestMapCorrectionsOutputSchema},
    prompt: `Você é um engenheiro de calibração de motores de classe mundial. Sua tarefa é analisar os dados de um mapa de combustível de uma ECU, juntamente com os dados de um teste de dinamômetro, e gerar um mapa de combustível corrigido.

O seu objetivo é ajustar o \`mapData\` original para que o \`lambda\` real do motor corresponda ao \`lambdaTarget\` para cada ponto de operação (RPM e Carga).

Você deve fornecer três peças de dados como saída em formato JSON. Siga esta ordem:

1.  **\`lambdaMeasuredGrid\`**: Primeiro, crie uma grelha com as mesmas dimensões do \`mapData\`, preenchida com os valores de lambda dos \`testData\`. Para cada ponto de teste, encontre a célula correspondente no mapa (usando \`eixo_x\` e \`eixo_y\`) e coloque o valor de lambda. Se houver vários pontos para a mesma célula, use a média. Para células sem dados, use \`null\`.

2.  **\`correctionPercentageMap\`**: Em seguida, crie um mapa que mostra a alteração percentual necessária para cada célula. Para células onde \`lambdaMeasuredGrid\` tem um valor, a fórmula é \`((lambdaMeasuredGrid[y][x] / lambdaTarget[y][x]) - 1) * 100\`. Para células onde \`lambdaMeasuredGrid\` é \`null\`, o valor DEVE ser \`0\`. Este mapa DEVE ter as mesmas dimensões do \`mapData\`.

3.  **\`correctedMap\`**: Finalmente, crie o mapa de combustível ajustado. Para cada célula, o novo valor deve ser calculado com base na correção. A fórmula geral para o ajuste é: \`valorOriginal * (1 + (correctionPercentageMap[y][x] / 100) * aggressiveness)\`. Células onde a correção é 0 devem manter o seu valor original do \`mapData\`.

**MUITO IMPORTANTE**: A sua saída deve ser um único objeto JSON contendo OBRIGATORIAMENTE as três chaves: \`correctedMap\`, \`correctionPercentageMap\`, e \`lambdaMeasuredGrid\`. Todos os três mapas devem ter as mesmas dimensões do \`mapData\` de entrada. Não inclua nenhuma outra informação, texto ou explicação. A estrutura do JSON deve corresponder exatamente ao schema de saída fornecido. A falta de qualquer uma das chaves resultará em falha.

Dados de Entrada:
mapData: {{{json mapData}}}
lambdaTarget: {{{json lambdaTarget}}}
testData: {{{json testData}}}
aggressiveness: {{{aggressiveness}}}
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
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error("A IA não conseguiu gerar uma resposta ou a resposta foi inválida. Tente novamente.");
    }

    // A IA pode retornar NaN que não é um JSON válido e não passa no Zod.
    // Limpamos os dados para garantir a consistência, mesmo que o prompt deva evitar isso.
    const cleanNumber = (val: any, fallback = 0): number => 
        (typeof val === 'number' && !isNaN(val)) ? val : fallback;
        
    const cleanNullableNumber = (val: any): number | null => 
        (typeof val === 'number' && !isNaN(val)) ? val : null;
    
    // A validação do schema já ocorreu via Genkit. Se chegamos aqui, as propriedades existem.
    const correctedMap = output.correctedMap.map(row => 
        (row || []).map(cell => cleanNumber(cell, input.mapData[0][0] || 0)) // Fallback to a value from original map if possible
    );

    const correctionPercentageMap = output.correctionPercentageMap.map(row => 
        (row || []).map(cell => cleanNumber(cell, 0))
    );
    
    const lambdaMeasuredGrid = output.lambdaMeasuredGrid.map(row => 
        (row || []).map(cell => cleanNullableNumber(cell))
    );

    return {
      correctedMap,
      correctionPercentageMap,
      lambdaMeasuredGrid,
    };
  }
);
