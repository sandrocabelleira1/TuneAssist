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
    prompt: `É um especialista em afinação de motores, especializado em calibração de ECUs. A sua tarefa é analisar os dados de desempenho do motor e sugerir correções para um mapa de combustível para atingir um Fator Lambda alvo.

DADOS DE ENTRADA:
- mapData: O mapa de combustível original.
- lambdaTarget: O mapa com os valores Lambda desejados para cada célula.
- testData: Uma lista de pontos de dados com RPM, carga do motor, e Lambda medido.
- aggressiveness: Um fator de 0 a 1 que controla a magnitude das alterações sugeridas.
- eixo_x: Os valores do eixo X do mapa (ex: Carga).
- eixo_y: Os valores do eixo Y do mapa (ex: RPM).

PASSOS A EXECUTAR:
1.  **Criar uma Grelha de Lambda Medido ('lambdaMeasuredGrid'):**
    - Crie uma nova grelha com as mesmas dimensões do 'mapData', inicializada com 'null'.
    - Para cada ponto em 'testData', encontre a célula mais próxima na grelha usando 'eixo_x' e 'eixo_y'.
    - Coloque o valor 'lambda' medido nessa célula.
    - Se múltiplos pontos de teste mapearem para a mesma célula, faça a média dos seus valores de lambda.
    - O resultado é a 'lambdaMeasuredGrid'.

2.  **Calcular o Mapa de Percentagem de Correção ('correctionPercentageMap'):**
    - Crie uma grelha 'correctionPercentageMap' com as mesmas dimensões, inicializada com 0.
    - Para cada célula (y, x) onde 'lambdaMeasuredGrid' tem um valor não-nulo:
        - lambdaMedido = lambdaMeasuredGrid[y][x]
        - lambdaAlvo = lambdaTarget[y][x]
        - percentualCorrecao = (lambdaMedido / lambdaAlvo) - 1
        - Armazene 'percentualCorrecao * 100' em 'correctionPercentageMap[y][x]'.

3.  **Calcular o Mapa Corrigido ('correctedMap'):**
    - Comece com uma cópia do 'mapData'.
    - Para cada célula (y, x) onde 'lambdaMeasuredGrid' tem um valor não-nulo:
        - valorOriginal = mapData[y][x]
        - lambdaMedido = lambdaMeasuredGrid[y][x]
        - lambdaAlvo = lambdaTarget[y][x]
        - percentualCorrecao = (lambdaMedido / lambdaAlvo) - 1
        - ajuste = valorOriginal * percentualCorrecao * aggressiveness
        - valorAjustado = valorOriginal + ajuste
        - Armazene o 'valorAjustado' no 'correctedMap[y][x]'. As células não afetadas devem manter os seus valores originais.

SAÍDA:
Devolva os resultados no formato JSON especificado, com as chaves 'correctedMap', 'correctionPercentageMap', e 'lambdaMeasuredGrid'. Certifique-se de que todos os arrays têm as dimensões corretas. Não inclua explicações, apenas o JSON.

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
    // A lógica algorítmica foi substituída por uma chamada ao modelo de IA
    const {output} = await prompt(input);
    if (!output) {
      throw new Error("A IA não conseguiu gerar uma resposta. Tente novamente.");
    }

    // A IA pode retornar NaN que não é um JSON válido. O Zod também não gosta.
    // Vamos substituir por null para garantir a consistência dos dados.
    const cleanGrid = output.lambdaMeasuredGrid.map(row => 
        row.map(cell => (cell === null || (typeof cell === 'number' && isNaN(cell))) ? null : cell)
    );

    return {
        ...output,
        lambdaMeasuredGrid: cleanGrid,
    };
  }
);
