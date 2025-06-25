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
    z.array(z.number()).describe('Os valores de Lambda medidos interpolados para a grelha do mapa da ECU.')
  ).describe('Grelha de Lambda medido.'),
});
export type SuggestMapCorrectionsOutput = z.infer<typeof SuggestMapCorrectionsOutputSchema>;

export async function suggestMapCorrections(input: SuggestMapCorrectionsInput): Promise<SuggestMapCorrectionsOutput> {
  return suggestMapCorrectionsFlow(input);
}

const suggestMapCorrectionsFlow = ai.defineFlow(
  {
    name: 'suggestMapCorrectionsFlow',
    inputSchema: SuggestMapCorrectionsInputSchema,
    outputSchema: SuggestMapCorrectionsOutputSchema,
  },
  async input => {
    const { mapData, lambdaTarget, testData, aggressiveness, eixo_x, eixo_y } = input;

    // Initialize data structures for calculations
    let correctedMap = JSON.parse(JSON.stringify(mapData)); // Deep copy
    let correctionPercentageMap = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(0));
    let lambdaMeasuredGrid = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(NaN));
    let contagemPontosCelula = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(0));

    // Helper function to find the closest index in an array
    function encontrarIndiceMaisProximo(arr: number[], val: number): number {
      if (!arr || arr.length === 0) return -1;
      return arr.reduce((bestIndex, currentVal, currentIndex, array) =>
          Math.abs(currentVal - val) < Math.abs(array[bestIndex] - val) ? currentIndex : bestIndex,
        0);
    }

    // Populate the measured Lambda grid by averaging Lambda values for each cell
    for (const ponto of testData) {
      const idx_rpm = encontrarIndiceMaisProximo(eixo_y, ponto.rpm);
      const idx_carga = encontrarIndiceMaisProximo(eixo_x, ponto.carga);
      if (idx_rpm === -1 || idx_carga === -1) continue;

      if (isNaN(lambdaMeasuredGrid[idx_rpm][idx_carga])) {
        lambdaMeasuredGrid[idx_rpm][idx_carga] = ponto.lambda;
      } else {
        const totalAnterior = lambdaMeasuredGrid[idx_rpm][idx_carga] * contagemPontosCelula[idx_rpm][idx_carga];
        lambdaMeasuredGrid[idx_rpm][idx_carga] = (totalAnterior + ponto.lambda) / (contagemPontosCelula[idx_rpm][idx_carga] + 1);
      }
      contagemPontosCelula[idx_rpm][idx_carga]++;
    }

    // Calculate corrections based on the difference between measured and target Lambda
    for (let r_idx = 0; r_idx < eixo_y.length; r_idx++) {
      for (let c_idx = 0; c_idx < eixo_x.length; c_idx++) {
        const lambdaMedido = lambdaMeasuredGrid[r_idx][c_idx];
        const lambdaAlvo = lambdaTarget[r_idx][c_idx];

        if (!isNaN(lambdaMedido)) {
          const desvioLambda = lambdaMedido - lambdaAlvo;
          if (Math.abs(desvioLambda) > 0.01) { // Adjusted threshold for lambda
            const valorOriginal = correctedMap[r_idx][c_idx];
            const percentualCorrecao = (lambdaMedido / lambdaAlvo) - 1;
            const ajuste = valorOriginal * percentualCorrecao * aggressiveness;
            let valorAjustado = valorOriginal + ajuste;
            correctedMap[r_idx][c_idx] = valorAjustado;
            correctionPercentageMap[r_idx][c_idx] = ((valorAjustado / valorOriginal) - 1) * 100;
          }
        }
      }
    }

    return {
      correctedMap: correctedMap,
      correctionPercentageMap: correctionPercentageMap,
      lambdaMeasuredGrid: lambdaMeasuredGrid,
    };
  }
);
