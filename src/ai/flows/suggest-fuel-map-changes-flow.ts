"use server";

import { z } from 'zod';
import { AiFuelSuggestionSchema, type ProcessedMap } from '@/lib/types';
import { calculateCorrections } from '@/lib/ecu';

const SuggestFuelMapChangesInputSchema = z.object({
  prompt: z.string(),
  map: z.any(), // Using any for simplicity, in real life should be a Zod schema for ProcessedMap
  logData: z.array(z.any()),
});

type SuggestFuelMapChangesInput = z.infer<typeof SuggestFuelMapChangesInputSchema>;

export async function suggestFuelMapChanges(input: SuggestFuelMapChangesInput): Promise<z.infer<typeof AiFuelSuggestionSchema>> {

  const { prompt, map, logData } = input;
  
  console.log("Simulating AI call with prompt:", prompt);
  console.log("Map data:", map.calculatedMap.length, "rows");
  console.log("Log data:", logData.length, "entries");

  // Attempt to parse a target lambda from the prompt
  const lambdaMatch = prompt.match(/lambda\s+([\d\.]+)/i);
  const targetLambda = lambdaMatch ? parseFloat(lambdaMatch[1]) : 0.85; // Default if not found

  // If log data is present and a target lambda can be determined, use the calculation logic
  if (logData.length > 0 && map && map.calculatedMap) {
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

  // Fallback to simple percentage modification if no log data is present
  if (prompt.toLowerCase().includes('mais') || prompt.toLowerCase().includes('aumentar')) {
    const percentMatch = prompt.match(/([\d\.]+)%/);
    const percent = percentMatch ? parseFloat(percentMatch[1]) : 10; // Default 10%
    
    const changes = map.calculatedMap.flatMap((row: (number | null)[], y: number) => 
      row.map((cell: number | null, x: number) => ({
        y,
        x,
        newValue: cell !== null ? cell * (1 + percent / 100) : 0
      }))
    );
    
    return {
      reasoning: `A aplicar um aumento de ${percent}% a todas as células do mapa.`,
      changes: changes.filter(c => c.newValue !== 0)
    };
  }

  // Default mock response if no other condition is met
  return {
    reasoning: "Esta é uma sugestão de exemplo. Não consegui interpretar completamente o seu pedido, mas aqui está uma alteração para começar. Tente ser mais específico, como 'otimizar para lambda 0.85' ou 'adicionar 5% de combustível acima de 4000 RPM e 80% de carga'.",
    changes: [
      { y: 5, x: 5, newValue: map.calculatedMap[5][5] * 1.02 }
    ]
  };
}
