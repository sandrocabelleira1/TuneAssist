'use server';
/**
 * @fileOverview A tool for searching for Yamaha motorcycle manuals.
 * - searchYamahaManuals - A Genkit tool that searches for manuals.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Mock data - in a real application, this would come from a database or an API call.
const MOCK_MANUALS = [
  { title: "Manual do Proprietário YZF-R1 2023", url: "https://www.yamaha-motor.com.br/manuais/2023-YZF-R1.pdf", model: "YZF-R1", year: 2023 },
  { title: "Manual de Serviço YZF-R1 2022", url: "https://www.yamaha-motor.com.br/manuais/2022-YZF-R1-servico.pdf", model: "YZF-R1", year: 2022 },
  { title: "Manual do Proprietário MT-09 2024", url: "https://www.yamaha-motor.com.br/manuais/2024-MT-09.pdf", model: "MT-09", year: 2024 },
  { title: "Manual de Serviço MT-09 2024", url: "https://www.yamaha-motor.com.br/manuais/2024-MT-09-servico.pdf", model: "MT-09", year: 2024 },
  { title: "Manual do Proprietário MT-07 2023", url: "https://www.yamaha-motor.com.br/manuais/2023-MT-07.pdf", model: "MT-07", year: 2023 },
  { title: "Manual do Proprietário XTZ 250 Lander 2024", url: "https://www.yamaha-motor.com.br/manuais/2024-Lander-250.pdf", model: "XTZ 250 Lander", year: 2024 },
  { title: "Manual do Proprietário NMAX 160 2024", url: "https://www.yamaha-motor.com.br/manuais/2024-NMAX-160.pdf", model: "NMAX 160", year: 2024 },
  { title: "Manual de Serviço Fazer FZ25 2023", url: "https://www.yamaha-motor.com.br/manuais/2023-FZ25-servico.pdf", model: "Fazer FZ25", year: 2023 },
];

export const searchYamahaManuals = ai.defineTool(
  {
    name: 'searchYamahaManuals',
    description: 'Procura manuais oficiais de motos da Yamaha. Pode procurar por manuais do proprietário ou de serviço.',
    input: z.object({
      model: z.string().describe('O modelo da moto a procurar. Ex: "R1", "MT-07", "Lander"'),
      type: z.enum(['proprietario', 'servico', 'todos']).optional().describe('O tipo de manual a procurar. O padrão é "todos".'),
      year: z.number().optional().describe('O ano do modelo a procurar.'),
    }),
    output: z.array(
        z.object({
            title: z.string(),
            url: z.string().url(),
            model: z.string(),
            year: z.number(),
        })
    ),
  },
  async (input) => {
    console.log(`Searching for Yamaha manuals with input:`, input);
    // This is a mock implementation. In a real app, you would query a database or an external API.
    const results = MOCK_MANUALS.filter(manual => {
      const modelMatch = manual.model.toLowerCase().includes(input.model.toLowerCase());
      const yearMatch = !input.year || manual.year === input.year;
      const typeMatch = !input.type || input.type === 'todos' || manual.title.toLowerCase().includes(input.type);
      return modelMatch && yearMatch && typeMatch;
    });
    return results;
  }
);
