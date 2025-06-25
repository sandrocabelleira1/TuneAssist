'use server';
/**
 * @fileOverview A tool for searching for motorcycle manuals.
 * - searchMotorcycleManuals - A Genkit tool that searches for manuals.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Mock data - in a real application, this would come from a database or an API call.
const MOCK_MANUALS = [
  // Yamaha
  { title: "Manual do Proprietário YZF-R1 2023", url: "https://www.example-manuals.com/yamaha/2023-YZF-R1.pdf", model: "YZF-R1", year: 2023, brand: "Yamaha" },
  { title: "Manual de Serviço YZF-R1 2022", url: "https://www.example-manuals.com/yamaha/2022-YZF-R1-servico.pdf", model: "YZF-R1", year: 2022, brand: "Yamaha" },
  { title: "Manual do Proprietário MT-09 2024", url: "https://www.example-manuals.com/yamaha/2024-MT-09.pdf", model: "MT-09", year: 2024, brand: "Yamaha" },
  { title: "Manual de Serviço MT-09 2024", url: "https://www.example-manuals.com/yamaha/2024-MT-09-servico.pdf", model: "MT-09", year: 2024, brand: "Yamaha" },
  { title: "Manual do Proprietário MT-07 2023", url: "https://www.example-manuals.com/yamaha/2023-MT-07.pdf", model: "MT-07", year: 2023, brand: "Yamaha" },
  { title: "Manual do Proprietário XTZ 250 Lander 2024", url: "https://www.example-manuals.com/yamaha/2024-Lander-250.pdf", model: "XTZ 250 Lander", year: 2024, brand: "Yamaha" },
  { title: "Manual do Proprietário NMAX 160 2024", url: "https://www.example-manuals.com/yamaha/2024-NMAX-160.pdf", model: "NMAX 160", year: 2024, brand: "Yamaha" },
  { title: "Manual de Serviço Fazer FZ25 2023", url: "https://www.example-manuals.com/yamaha/2023-FZ25-servico.pdf", model: "Fazer FZ25", year: 2023, brand: "Yamaha" },
  // Honda
  { title: "Manual do Proprietário Honda CBR1000RR-R 2023", url: "https://www.example-manuals.com/honda/2023-CBR1000RR-R.pdf", model: "CBR1000RR-R", year: 2023, brand: "Honda" },
  { title: "Manual de Serviço Honda CB 650R 2022", url: "https://www.example-manuals.com/honda/2022-CB-650R-servico.pdf", model: "CB 650R", year: 2022, brand: "Honda" },
  { title: "Manual do Proprietário Honda Africa Twin 2024", url: "https://www.example-manuals.com/honda/2024-Africa-Twin.pdf", model: "Africa Twin", year: 2024, brand: "Honda" },
  { title: "Manual do Proprietário Honda PCX 150 2023", url: "https://www.example-manuals.com/honda/2023-PCX-150.pdf", model: "PCX 150", year: 2023, brand: "Honda" },
  // Suzuki
  { title: "Manual de Serviço Suzuki GSX-R1000 2023", url: "https://www.example-manuals.com/suzuki/2023-GSX-R1000-servico.pdf", model: "GSX-R1000", year: 2023, brand: "Suzuki" },
  { title: "Manual do Proprietário Suzuki V-Strom 650 2024", url: "https://www.example-manuals.com/suzuki/2024-V-Strom-650.pdf", model: "V-Strom 650", year: 2024, brand: "Suzuki" },
  // Kawasaki
  { title: "Manual do Proprietário Kawasaki Ninja ZX-10R 2024", url: "https://www.example-manuals.com/kawasaki/2024-Ninja-ZX-10R.pdf", model: "Ninja ZX-10R", year: 2024, brand: "Kawasaki" },
  { title: "Manual de Serviço Kawasaki Z900 2023", url: "https://www.example-manuals.com/kawasaki/2023-Z900-servico.pdf", model: "Z900", year: 2023, brand: "Kawasaki" },
];

export const searchMotorcycleManuals = ai.defineTool(
  {
    name: 'searchMotorcycleManuals',
    description: 'Procura manuais oficiais de motos. Pode procurar por manuais do proprietário ou de serviço para qualquer marca e modelo.',
    input: z.object({
      brand: z.string().optional().describe('A marca da moto a procurar. Ex: "Yamaha", "Honda", "Suzuki"'),
      model: z.string().describe('O modelo da moto a procurar. Ex: "R1", "CB 500F", "GSX-R1000"'),
      type: z.enum(['proprietario', 'servico', 'todos']).optional().describe('O tipo de manual a procurar. O padrão é "todos".'),
      year: z.number().optional().describe('O ano do modelo a procurar.'),
    }),
    output: z.array(
        z.object({
            title: z.string(),
            url: z.string().url(),
            model: z.string(),
            year: z.number(),
            brand: z.string(),
        })
    ),
  },
  async (input) => {
    console.log(`Searching for motorcycle manuals with input:`, input);
    // This is a mock implementation. In a real app, you would query a database or an external API.
    const results = MOCK_MANUALS.filter(manual => {
      const brandMatch = !input.brand || manual.brand.toLowerCase() === input.brand.toLowerCase();
      const modelMatch = manual.model.toLowerCase().includes(input.model.toLowerCase());
      const yearMatch = !input.year || manual.year === input.year;
      const typeMatch = !input.type || input.type === 'todos' || manual.title.toLowerCase().includes(input.type);
      return brandMatch && modelMatch && yearMatch && typeMatch;
    });
    return results;
  }
);
