'use server';
import { z } from 'zod';
import { calculateCorrections } from '@/lib/ecu';
import { type ProcessedMap, AiFuelSuggestionSchema } from '@/lib/types';

const SuggestFuelMapChangesInputSchema = z.object({
  prompt: z.string(),
  currentMap: z.any(),
  mapDefinition: z.any(),
  logData: z.any().optional(),
});

type SuggestFuelMapChangesInput = z.infer<typeof SuggestFuelMapChangesInputSchema>;

export async function suggestFuelMapChanges(
  input: SuggestFuelMapChangesInput
): Promise<z.infer<typeof AiFuelSuggestionSchema>> {
  const { prompt, currentMap, mapDefinition, logData } = input;

  if (!prompt) {
      return {
          reasoning: "Por favor, forneça um pedido.",
          changes: [],
      };
  }

  const lambdaMatch = prompt.match(/lambda\s+de\s+([\d\.,]+)/i);

  if (lambdaMatch && logData && logData.length > 0) {
    const targetLambda = parseFloat(lambdaMatch[1].replace(',', '.'));
    if (!isNaN(targetLambda)) {
      try {
        const { correctedMap, modifiedIndices } = calculateCorrections(
          currentMap as ProcessedMap,
          logData,
          targetLambda,
          100 // Default aggressiveness to 100% for AI suggestions
        );

        if (modifiedIndices.length === 0) {
          return {
            reasoning: `Não foram encontrados pontos de dados de ensaio que correspondam ao mapa atual. Nenhuma correção automática foi aplicada.`,
            changes: [],
          };
        }

        const changes = modifiedIndices.map(({ y, x }) => ({
          y,
          x,
          newValue: correctedMap[y][x] as number,
        }));

        return {
          reasoning: `Com base na sua análise de log e no Lambda alvo de ${targetLambda}, foram calculadas ${changes.length} correções para alinhar o mapa com o seu objetivo.`,
          changes: changes,
        };
      } catch (error: any) {
        return {
          reasoning: `Ocorreu um erro ao calcular as correções com base no seu ensaio: ${error.message}`,
          changes: [],
        };
      }
    }
  }
  
  const simplePercentageMatch = prompt.match(/aumente|adicione|retire|diminua|corte\s+em\s+([\d\.,]+)%?/i);
  if (simplePercentageMatch) {
        const percentage = parseFloat(simplePercentageMatch[1].replace(',', '.'));
        const isSubtraction = /retire|diminua|corte/i.test(prompt);

        if(!isNaN(percentage) && currentMap && currentMap.calculatedMap) {
            const multiplier = isSubtraction ? 1 - percentage / 100 : 1 + percentage / 100;
            const changes = [];
            for(let y = 0; y < currentMap.calculatedMap.length; y++) {
                for (let x = 0; x < currentMap.calculatedMap[y].length; x++) {
                    const originalValue = currentMap.calculatedMap[y][x];
                    if(typeof originalValue === 'number') {
                        changes.push({ y, x, newValue: originalValue * multiplier });
                    }
                }
            }
            return {
                reasoning: `Aplicando uma alteração de ${isSubtraction ? '-' : '+'}${percentage}% a todas as ${changes.length} células do mapa.`,
                changes: changes,
            };
        }
    }


  // Fallback for more complex prompts - This is where the real "AI" part comes in.
  // This is a placeholder for a call to a real Large Language Model.
  // In a real scenario, we would pass the prompt, map, and axes definitions to the LLM.
  const { axes, calculatedMap } = currentMap as ProcessedMap;
  
  // This is a placeholder response.
  return {
    reasoning: `O seu pedido é demasiado complexo para a minha lógica atual. Forneça o contexto completo do mapa, incluindo os eixos, para que eu possa fazer uma análise mais detalhada.\n\n**Exemplo de Pedido Detalhado:**\n"Aumente o combustível em 10% para RPMs acima de 4000 e carga (TPS) acima de 80%."`,
    changes: [],
  };
}
