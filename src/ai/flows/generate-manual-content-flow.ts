'use server';
/**
 * @fileOverview A flow for generating fictional motorcycle manual content.
 *
 * - generateManualContent - The flow function.
 * - GenerateManualContentInput - The input type for the function.
 * - GenerateManualContentOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { 
    GenerateManualContentInputSchema, 
    GenerateManualContentOutputSchema,
    type GenerateManualContentInput,
    type GenerateManualContentOutput,
} from '@/ai/schemas';

// Re-exporting types for consumers of this flow file
export type { GenerateManualContentInput, GenerateManualContentOutput };


const prompt = ai.definePrompt({
    name: 'generateManualContentPrompt',
    input: { schema: GenerateManualContentInputSchema },
    output: { schema: GenerateManualContentOutputSchema },
    prompt: `Você é um redator técnico especialista em motocicletas. Sua tarefa é gerar um capítulo de exemplo para um manual de motocicleta com base nas informações fornecidas.

    **Informações do Manual:**
    - Título: {{{title}}}
    - Marca: {{{brand}}}
    - Modelo: {{{model}}}
    - Ano: {{{year}}}

    **Instruções:**
    1.  Gere um capítulo relevante para este manual. Por exemplo, "Agenda de Manutenção Periódica" ou "Verificações Diárias de Segurança". O capítulo deve ser informativo e bem estruturado.
    2.  O conteúdo deve ser **plausível e bem escrito**, mas você DEVE indicar claramente que é **fictício e apenas para fins de demonstração**.
    3.  Use formatação Markdown (cabeçalhos, listas, negrito) para tornar o conteúdo legível.
    4.  **OBRIGATÓRIO:** Inclua um aviso proeminente no início do conteúdo. O aviso deve estar em negrito e dizer: "**AVISO: Este conteúdo é gerado por IA para fins de demonstração e é puramente fictício. NÃO o utilize para manutenção ou operação real do veículo. Consulte sempre o manual oficial do fabricante.**"
    5.  O conteúdo deve ter um tamanho razoável, como 2 a 4 parágrafos e, talvez, uma lista ou tabela.
    6.  Sua saída deve ser um objeto JSON contendo apenas a chave "content" com o texto gerado em Markdown.
    `,
});

const generateManualContentFlow = ai.defineFlow(
  {
    name: 'generateManualContentFlow',
    inputSchema: GenerateManualContentInputSchema,
    outputSchema: GenerateManualContentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
        throw new Error("A IA não conseguiu gerar o conteúdo do manual.");
    }
    return output;
  }
);

export async function generateManualContent(input: GenerateManualContentInput): Promise<GenerateManualContentOutput> {
  return generateManualContentFlow(input);
}
