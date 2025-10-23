"use server";

import { z } from 'zod';
import { AiFuelSuggestionSchema, type ProcessedMap } from '@/lib/types';
import { calculateCorrections } from '@/lib/ecu';

// Mock AI object to avoid dependency issues for now.
const ai = {
  definePrompt: (config: any) => {
    return async (input: any): Promise<{ output: any }> => {
      console.warn("AI prompt não está totalmente implementado. A usar lógica de fallback.");
      // Fallback behavior for complex prompts when genkit is not fully wired
      return {
        output: {
          reasoning: "Este é um pedido complexo. Como a IA avançada está a ser integrada, aqui está um exemplo de modificação: um aumento de 2% na célula (10, 10). Para resultados precisos, por favor use pedidos diretos como 'adicionar 10% de combustível' ou use a funcionalidade de ajuste por log.",
          changes: [
            { y: 10, x: 10, newValue: (input.map.calculatedMap?.[10]?.[10] ?? 50) * 1.02 }
          ].filter(() => input.map.calculatedMap?.[10]?.[10] !== undefined) // Filter if the cell doesn't exist
        }
      };
    };
  }
};

const SuggestFuelMapChangesInputSchema = z.object({
  prompt: z.string(),
  map: z.any(), // Using any for simplicity, in real life should be a Zod schema for ProcessedMap
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

The current fuel map has ${'{{map.calculatedMap.length}}'} rows and ${'{{map.calculatedMap[0].length}}'} columns.
The axes are:
Y-Axis (rows): ${'{{map.axes.y.label}}'}
X-Axis (columns): ${'{{map.axes.x.label}}'}

${'{{#if logData.length}}'}
The user has provided a datalog with ${'{{logData.length}}'} entries.
The available data columns are: ${'{{Object.keys logData.[0]}}'}

Analyze the user's prompt. 
- If the user provides a target Lambda or AFR, use the 'calculateCorrections' logic. Your reasoning should state the target and the number of corrections calculated.
- If the user asks for a percentage change (e.g., "add 5% fuel"), calculate a percentage-based modification for all cells. Your reasoning should state the percentage applied.
- If the prompt is complex (e.g., "add fuel only above 4000 RPM and 80% load"), identify the relevant cells and apply the change. Your reasoning should explain the conditions you used.
- If no datalog is provided and the prompt is ambiguous, provide a default example modification and explain how the user can be more specific.

Always return a 'reasoning' text explaining your action and a 'changes' array.
If no changes are needed, return an empty 'changes' array and explain why.
If an error occurs, provide a helpful error message in the 'reasoning' and an empty 'changes' array.
Generate the JSON output.
${'{{/if}}'}
${'{{#unless logData.length}}'}
The user has NOT provided a datalog. Base your suggestion solely on the user's prompt.
- If the user asks for a percentage change (e.g., "add 10% fuel everywhere"), calculate that change for all cells in the map.
- If the prompt is ambiguous, provide a default example modification (e.g., a 2% increase to a specific cell) and explain in your 'reasoning' how the user can be more specific (e.g., "add 5% fuel above 4000 RPM and 80% load").
Generate the JSON output.
${'{{/unless}}'}
`,
    },
);

export async function suggestFuelMapChanges(input: SuggestFuelMapChangesInput): Promise<z.infer<typeof AiFuelSuggestionSchema>> {

  const { prompt, map, logData } = input;
  
  // 1. Handle datalog-based corrections
  if (logData.length > 0) {
    const lambdaMatch = prompt.match(/(?:lambda|alvo)\s+([\d\.]+)/i);
    const targetLambda = lambdaMatch ? parseFloat(lambdaMatch[1]) : null;

    if (targetLambda) {
      try {
        const { correctedMap, modifiedIndices } = calculateCorrections(map, logData, targetLambda, 100);
        
        const changes = modifiedIndices.map(mod => ({
          y: mod.y,
          x: mod.x,
          newValue: correctedMap[mod.y][mod.x] ?? map.calculatedMap[mod.y][mod.x],
        }));

        if (changes.length > 0) {
          return {
            reasoning: `Com base na sua análise de log e no Lambda alvo de ${targetLambda}, foram calculadas ${changes.length} correções para atingir o seu objetivo.`,
            changes: changes,
          };
        } else {
          return {
            reasoning: `A sua análise de log foi processada, mas nenhuma célula necessitou de correção para atingir o Lambda alvo de ${targetLambda}. O mapa já parece estar otimizado para estas condições.`,
            changes: [],
          };
        }
      } catch (error) {
         return {
          reasoning: `Ocorreu um erro ao analisar os seus dados de ensaio: ${(error as Error).message}. Verifique os cabeçalhos do seu ficheiro .csv (precisa de 'RPM', 'Lambda'/'AFR' e uma coluna de carga correspondente ao seu mapa) e tente novamente.`,
          changes: []
        };
      }
    }
  }

  // 2. Handle generic percentage-based requests if no datalog logic was triggered
  const percentMatch = prompt.match(/(?:adicione|aumente|remova|diminua|mais|menos)\s*([\d\.]+)%/i);
  if (percentMatch) {
      const percent = parseFloat(percentMatch[1]);
      const isAdding = /adicione|aumente|mais/i.test(prompt);
      const multiplier = isAdding ? (1 + percent / 100) : (1 - percent / 100);
      
      const changes = map.calculatedMap.flatMap((row: (number | null)[], y: number) => 
        row.map((cell: number | null, x: number) => {
          if (cell !== null) {
            return { y, x, newValue: cell * multiplier };
          }
          return null;
        })
      ).filter((c): c is { y: number; x: number; newValue: number; } => c !== null);
      
      return {
        reasoning: `A aplicar uma ${isAdding ? 'adição' : 'redução'} de ${percent}% a todas as ${changes.length} células do mapa.`,
        changes: changes,
      };
  }


  // 3. Fallback to a mock AI for complex prompts or as a default
  try {
     const { output } = await prompt(input);
     if (!output) {
        throw new Error("A IA não conseguiu gerar uma sugestão.");
     }
     return output;
  } catch (error) {
      console.error("Erro ao chamar o fluxo de IA:", error);
      return {
        reasoning: "Desculpe, ocorreu um erro ao processar o seu pedido complexo. Por favor, tente um pedido mais simples como 'adicionar 10% de combustível' ou use a funcionalidade de ajuste por log.",
        changes: [],
      };
  }

}
