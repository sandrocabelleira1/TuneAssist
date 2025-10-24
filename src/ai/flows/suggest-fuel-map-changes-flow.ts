"use server";

import { z } from 'zod';
import { AiFuelSuggestionSchema, type ProcessedMap } from '@/lib/types';
import { calculateCorrections } from '@/lib/ecu';

// Mock AI object to avoid dependency issues for now.
const ai = {
  definePrompt: (config: any) => {
    // This is a simplified mock. In a real scenario, this would interact with a GenAI model.
    return async (input: SuggestFuelMapChangesInput): Promise<{ output: any }> => {
      // 1. Handle datalog-based corrections if a target is specified.
      const lambdaMatch = input.prompt.match(/(?:lambda|sonda|alvo de)\s*([\d\.,]+)/i);
      if (input.logData.length > 0 && lambdaMatch) {
          const targetLambda = parseFloat(lambdaMatch[1].replace(',', '.'));
          if (!isNaN(targetLambda)) {
              try {
                  const { correctedMap, modifiedIndices } = calculateCorrections(input.map, input.logData, targetLambda, 100);
                  const changes = modifiedIndices.map(mod => ({
                      y: mod.y,
                      x: mod.x,
                      newValue: correctedMap[mod.y][mod.x] ?? input.map.calculatedMap[mod.y][mod.x],
                  }));
                  return {
                      output: {
                          reasoning: `Com base na sua análise de log e no Lambda alvo de ${targetLambda}, foram calculadas ${changes.length} correções.`,
                          changes: changes,
                      }
                  };
              } catch (error) {
                  return {
                      output: {
                          reasoning: `Erro ao processar o ensaio: ${(error as Error).message}`,
                          changes: [],
                      }
                  };
              }
          }
      }

      // 2. Handle generic percentage changes
      const percentMatch = input.prompt.match(/(?:adicione|aumente|remova|diminua|mais|menos)\s*([\d\.,]+)%/i);
      if (percentMatch) {
          const percent = parseFloat(percentMatch[1].replace(',', '.'));
          const isAdding = /adicione|aumente|mais/i.test(input.prompt);
          const multiplier = isAdding ? (1 + percent / 100) : (1 - percent / 100);
          
          const changes = input.map.calculatedMap.flatMap((row: (number | null)[], y: number) => 
            row.map((cell: number | null, x: number) => {
              if (cell !== null) {
                return { y, x, newValue: cell * multiplier };
              }
              return null;
            })
          ).filter(Boolean);
          
          return {
              output: {
                  reasoning: `A aplicar uma ${isAdding ? 'adição' : 'redução'} de ${percent}% a todas as ${changes.length} células do mapa.`,
                  changes: changes,
              }
          };
      }

      // 3. Fallback for complex requests that we can't parse with simple logic.
      return {
        output: {
          reasoning: "Desculpe, ocorreu um erro ao processar o seu pedido complexo. Por favor, tente um pedido mais simples como 'adicionar 10% de combustível' ou use a funcionalidade de ajuste por log com um alvo de lambda explícito.",
          changes: [],
        }
      };
    };
  }
};

const SuggestFuelMapChangesInputSchema = z.object({
  prompt: z.string(),
  map: z.any(), // Using any for simplicity, should be a Zod schema for ProcessedMap
  logData: z.array(z.any()),
});

type SuggestFuelMapChangesInput = z.infer<typeof SuggestFuelMapChangesInputSchema>;


const prompt = ai.definePrompt(
    {
      name: 'fuelMapChanger',
      input: { schema: SuggestFuelMapChangesInputSchema },
      output: { schema: AiFuelSuggestionSchema },
      prompt: `You are an expert ECU tuner. Your goal is to modify a fuel map based on user requests and datalogs.

User's goal: "{{prompt}}"

The current fuel map has {{map.calculatedMap.length}} rows and {{map.calculatedMap[0].length}} columns.
The axes are:
Y-Axis (rows): {{map.axes.y.label}} with values from {{map.axes.y.calculated[0]}} to {{map.axes.y.calculated[map.axes.y.calculated.length - 1]}}
X-Axis (columns): {{map.axes.x.label}} with values from {{map.axes.x.calculated[0]}} to {{map.axes.x.calculated[map.axes.x.calculated.length - 1]}}

{{#if logData.length}}
The user has provided a datalog with {{logData.length}} entries.
The available data columns are: {{Object.keys logData.[0]}}

Analyze the user's prompt. 
- If the user provides a target Lambda or AFR, use the 'calculateCorrections' logic. Your reasoning should state the target and the number of corrections calculated.
- If the user asks for a percentage change (e.g., "add 5% fuel"), calculate a percentage-based modification for all cells. Your reasoning should state the percentage applied.
- If the prompt is complex and refers to specific conditions (e.g., "add fuel only above 4000 RPM and 80% load"), identify the relevant cells based on the axis values and apply the change. Your reasoning should explain the conditions you used to select the cells.
- If no datalog is provided and the prompt is ambiguous, provide a default example modification and explain how the user can be more specific.

Always return a 'reasoning' text explaining your action and a 'changes' array.
If no changes are needed, return an empty 'changes' array and explain why.
If an error occurs, provide a helpful error message in the 'reasoning' and an empty 'changes' array.
Generate the JSON output.
{{/if}}
{{#unless logData.length}}
The user has NOT provided a datalog. Base your suggestion solely on the user's prompt.
- If the user asks for a percentage change (e.g., "add 10% fuel everywhere"), calculate that change for all cells in the map.
- If the prompt is complex and refers to specific conditions (e.g., "add fuel only above 4000 RPM and 80% load"), identify the relevant cells based on the axis values and apply the change. Your reasoning should explain the conditions you used to select the cells.
- If the prompt is ambiguous, provide a default example modification (e.g., a 2% increase to a specific cell) and explain in your 'reasoning' how the user can be more specific (e.g., "add 5% fuel above 4000 RPM and 80% load").
Generate the JSON output.
{{/unless}}
`,
    },
);

export async function suggestFuelMapChanges(input: SuggestFuelMapChangesInput): Promise<z.infer<typeof AiFuelSuggestionSchema>> {

  // The 'prompt' function is now our mock/hybrid AI logic from above.
  try {
     const { output } = await prompt(input);
     if (!output) {
        throw new Error("A IA não conseguiu gerar uma sugestão.");
     }
     return output;
  } catch (error) {
      console.error("Erro ao chamar o fluxo de IA:", error);
      return {
        reasoning: "Desculpe, ocorreu um erro ao processar o seu pedido. Por favor, tente um pedido mais simples como 'adicionar 10% de combustível' ou use a funcionalidade de ajuste por log.",
        changes: [],
      };
  }

}
