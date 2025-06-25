'use server';
/**
 * @fileOverview AI-powered ECU map correction suggestions.
 *
 * - suggestMapCorrections - A function that suggests corrections to the ECU map based on test data and target AFR.
 * - SuggestMapCorrectionsInput - The input type for the suggestMapCorrections function.
 * - SuggestMapCorrectionsOutput - The return type for the suggestMapCorrections function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestMapCorrectionsInputSchema = z.object({
  mapData: z.array(
    z.array(z.number()).describe('Os dados originais do mapa da ECU (array 2D).')
  ).describe('Dados originais do mapa da ECU.'),
  afrTarget: z.array(
    z.array(z.number()).describe('Os valores AFR alvo para o mapa da ECU.')
  ).describe('Valores AFR alvo.'),
  testData: z.array(
    z.object({
      rpm: z.number().describe('RPM do motor durante o ensaio.'),
      carga: z.number().describe('Carga do motor durante o ensaio (%).'),
      afr: z.number().describe('AFR medido durante o ensaio.'),
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
  afrMeasuredGrid: z.array(
    z.array(z.number()).describe('Os valores de AFR medidos interpolados para a grelha do mapa da ECU.')
  ).describe('Grelha de AFR medido.'),
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
    const { mapData, afrTarget, testData, aggressiveness, eixo_x, eixo_y } = input;

    // Initialize data structures for calculations
    let correctedMap = JSON.parse(JSON.stringify(mapData)); // Deep copy
    let correctionPercentageMap = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(0));
    let afrMeasuredGrid = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(NaN));
    let contagemPontosCelula = Array(eixo_y.length).fill(0).map(() => Array(eixo_x.length).fill(0));

    // Helper function to find the closest index in an array
    function encontrarIndiceMaisProximo(arr: number[], val: number): number {
      if (!arr || arr.length === 0) return -1;
      return arr.reduce((bestIndex, currentVal, currentIndex, array) =>
          Math.abs(currentVal - val) < Math.abs(array[bestIndex] - val) ? currentIndex : bestIndex,
        0);
    }

    // Populate the measured AFR grid by averaging AFR values for each cell
    for (const ponto of testData) {
      const idx_rpm = encontrarIndiceMaisProximo(eixo_y, ponto.rpm);
      const idx_carga = encontrarIndiceMaisProximo(eixo_x, ponto.carga);
      if (idx_rpm === -1 || idx_carga === -1) continue;

      if (isNaN(afrMeasuredGrid[idx_rpm][idx_carga])) {
        afrMeasuredGrid[idx_rpm][idx_carga] = ponto.afr;
      } else {
        const totalAnterior = afrMeasuredGrid[idx_rpm][idx_carga] * contagemPontosCelula[idx_rpm][idx_carga];
        afrMeasuredGrid[idx_rpm][idx_carga] = (totalAnterior + ponto.afr) / (contagemPontosCelula[idx_rpm][idx_carga] + 1);
      }
      contagemPontosCelula[idx_rpm][idx_carga]++;
    }

    // Calculate corrections based on the difference between measured and target AFR
    for (let r_idx = 0; r_idx < eixo_y.length; r_idx++) {
      for (let c_idx = 0; c_idx < eixo_x.length; c_idx++) {
        const afrMedido = afrMeasuredGrid[r_idx][c_idx];
        const afrAlvo = afrTarget[r_idx][c_idx];

        if (!isNaN(afrMedido)) {
          const desvioAfr = afrMedido - afrAlvo;
          if (Math.abs(desvioAfr) > 0.1) {
            const valorOriginal = correctedMap[r_idx][c_idx];
            const percentualCorrecao = (afrMedido / afrAlvo) - 1;
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
      afrMeasuredGrid: afrMeasuredGrid,
    };
  }
);
