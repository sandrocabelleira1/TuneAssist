"use server";

import { z } from 'zod';
import { AiFuelSuggestionSchema, type ProcessedMap } from '@/lib/types';
// This is a placeholder for the actual AI call.
// In a real scenario, you would use Genkit or another AI library here.

const SuggestFuelMapChangesInputSchema = z.object({
  prompt: z.string(),
  map: z.any(), // Using any for simplicity, in real life should be a Zod schema for ProcessedMap
  logData: z.array(z.any()),
});

type SuggestFuelMapChangesInput = z.infer<typeof SuggestFuelMapChangesInputSchema>;

export async function suggestFuelMapChanges(input: SuggestFuelMapChangesInput): Promise<z.infer<typeof AiFuelSuggestionSchema>> {

  const { prompt, map, logData } = input;
  
  // This is a mocked response to simulate an AI call without the genkit dependency.
  // It demonstrates the expected output structure.
  console.log("Simulating AI call with prompt:", prompt);
  console.log("Map data:", map.calculatedMap.length, "rows");
  console.log("Log data:", logData.length, "entries");

  // Simple mock logic: If prompt asks for more fuel, add 5% to a few cells.
  if (prompt.toLowerCase().includes('mais') && prompt.toLowerCase().includes('combustível')) {
    return {
      reasoning: "Com base no seu pedido para 'mais combustível', estou a sugerir um aumento de 5% em algumas células de alta carga/rotação como ponto de partida.",
      changes: [
        { y: map.calculatedMap.length - 1, x: map.calculatedMap[0].length - 1, newValue: map.calculatedMap[map.calculatedMap.length - 1][map.calculatedMap[0].length - 1] * 1.05 },
        { y: map.calculatedMap.length - 1, x: map.calculatedMap[0].length - 2, newValue: map.calculatedMap[map.calculatedMap.length - 1][map.calculatedMap[0].length - 2] * 1.05 },
        { y: map.calculatedMap.length - 2, x: map.calculatedMap[0].length - 1, newValue: map.calculatedMap[map.calculatedMap.length - 2][map.calculatedMap[0].length - 1] * 1.05 },
      ]
    }
  }

  // Simple mock logic: if log data exists and prompt mentions lambda
  if (logData.length > 0 && prompt.toLowerCase().includes('lambda')) {
     return {
      reasoning: "Analisei os seus dados de ensaio. A mistura parece estar um pouco pobre em alta rotação. Estou a sugerir um aumento de 3% de combustível nas células correspondentes para corrigir e aproximar-se do seu Lambda alvo.",
      changes: [
        { y: map.calculatedMap.length - 3, x: map.calculatedMap[0].length - 3, newValue: map.calculatedMap[map.calculatedMap.length - 3][map.calculatedMap[0].length - 3] * 1.03 },
      ]
    }
  }

  // Default mock response
  return {
    reasoning: "Esta é uma sugestão de exemplo. Não consegui interpretar completamente o seu pedido, mas aqui está uma alteração para começar. Tente ser mais específico, como 'otimizar para lambda 0.85' ou 'adicionar 5% de combustível acima de 4000 RPM e 80% de carga'.",
    changes: [
      { y: 5, x: 5, newValue: map.calculatedMap[5][5] * 1.02 }
    ]
  };
}
