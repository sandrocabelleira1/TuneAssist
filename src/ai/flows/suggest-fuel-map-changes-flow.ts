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
  
  if (!prompt || typeof prompt !== 'string') {
      return {
          reasoning: "Por favor, forneça um pedido válido.",
          changes: [],
      };
  }

  // 1. Prioridade Máxima: Análise de Log baseada em Lambda
  const lambdaMatch = prompt.match(/(?:lambda|alvo|sonda)\s+de\s+([\d\.,]+)/i);
  if (lambdaMatch && lambdaMatch[1] && logData && logData.length > 0) {
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
  
  // 2. Análise de Pedidos Complexos com Condições
  const complexMatch = prompt.match(/(aumente|adicione|retire|diminua|corte|defina)\s+(?:o combust.vel em\s+)?([\d\.,]+)%?\s*(?:para\s+|em\s+|acima de\s+|abaixo de\s+)?(rpm|carga|tps|map)?\s*(acima de|abaixo de|entre)?\s*([\d\.,]+)?\s*(?:e\s+)?(rpm|carga|tps|map)?\s*(acima de|abaixo de|entre)?\s*([\d\.,]+)?/i);
    if (complexMatch && currentMap && currentMap.axes) {
        try {
            const [_, action, valueStr, axis1_name, condition1, value1_str, axis2_name, condition2, value2_str] = complexMatch;
            const percentage = parseFloat(valueStr.replace(',', '.'));
            
            if (isNaN(percentage)) {
                return { reasoning: "Valor de alteração inválido.", changes: [] };
            }

            const { axes, calculatedMap } = currentMap as ProcessedMap;
            if (!axes || !calculatedMap) {
                 return { reasoning: "Os eixos ou o mapa não estão disponíveis para processar este pedido.", changes: [] };
            }

            let changes = [];
            const isSubtraction = /retire|diminua|corte/i.test(action);
            const isSetting = /defina/i.test(action);
            const multiplier = isSubtraction ? 1 - percentage / 100 : 1 + percentage / 100;
            
            const getAxisByName = (name: string) => {
                if (!name) return null;
                const lowerName = name.toLowerCase();
                if (axes.x.label.toLowerCase().includes(lowerName)) return { axis: axes.x, type: 'x' };
                if (axes.y.label.toLowerCase().includes(lowerName)) return { axis: axes.y, type: 'y' };
                return null;
            }

            const rpmAxisInfo = getAxisByName('rpm');
            const loadAxisInfo = getAxisByName('tps') || getAxisByName('map') || getAxisByName('carga');
            
            const checkCondition = (axisValue: number, condition?: string, conditionValue?: string) => {
                if (!condition || !conditionValue) return true; // No condition, always true
                const numCondValue = parseFloat(conditionValue.replace(',', '.'));
                if(isNaN(numCondValue)) return true;

                if (condition.includes('acima')) return axisValue > numCondValue;
                if (condition.includes('abaixo')) return axisValue < numCondValue;
                // "entre" não é tratado aqui, simplificação
                return true;
            };

            for (let y = 0; y < calculatedMap.length; y++) {
                for (let x = 0; x < calculatedMap[y].length; x++) {
                    
                    let condition1Met = true;
                    if (axis1_name && condition1 && value1_str) {
                         const axis1Info = getAxisByName(axis1_name);
                         if (axis1Info) {
                            const valueToCheck1 = axis1Info.type === 'x' ? axes.x.calculated[x] : axes.y.calculated[y];
                            condition1Met = checkCondition(Number(valueToCheck1), condition1, value1_str);
                         } else {
                             condition1Met = false; // Axis name provided but not found
                         }
                    }

                     let condition2Met = true;
                     if (axis2_name && condition2 && value2_str) {
                         const axis2Info = getAxisByName(axis2_name);
                         if (axis2Info) {
                            const valueToCheck2 = axis2Info.type === 'x' ? axes.x.calculated[x] : axes.y.calculated[y];
                            condition2Met = checkCondition(Number(valueToCheck2), condition2, value2_str);
                         } else {
                            condition2Met = false; // Axis name provided but not found
                         }
                    }

                    if (condition1Met && condition2Met) {
                        const originalValue = calculatedMap[y][x];
                        if (typeof originalValue === 'number') {
                            const newValue = isSetting ? percentage : originalValue * multiplier;
                            changes.push({ y, x, newValue });
                        }
                    }
                }
            }
            if (changes.length > 0) {
                 return {
                    reasoning: `A aplicar alteração de ${isSubtraction ? '-' : '+'}${percentage}% a ${changes.length} células que correspondem às suas condições.`,
                    changes: changes,
                };
            }
        } catch (e: any) {
             return { reasoning: `Ocorreu um erro ao processar o seu pedido complexo: ${e.message}`, changes: [] };
        }
    }


  // 3. Fallback para Pedidos Simples de Percentagem
  const simplePercentageMatch = prompt.match(/(aumente|adicione|retire|diminua|corte)\s+(?:em\s+)?([\d\.,]+)%?/i);
  if (simplePercentageMatch && simplePercentageMatch[1] && simplePercentageMatch[2]) {
        const percentage = parseFloat(simplePercentageMatch[2].replace(',', '.'));
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


  // 4. Fallback final se nada corresponder
  return {
    reasoning: `O seu pedido é demasiado complexo para a minha lógica atual. Forneça o contexto completo do mapa, incluindo os eixos, para que eu possa fazer uma análise mais detalhada.\n\n**Exemplo de Pedido Detalhado:**\n"Aumente o combustível em 10% para RPMs acima de 4000 e carga (TPS) acima de 80%."`,
    changes: [],
  };
}
