'use client';

import { useState } from 'react';
import Link from 'next/link';
import { searchForManuals } from '@/app/actions';
import type { MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Wrench, ExternalLink, BookUser } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type Manual = MotorcycleManualFlowOutput[0];

export default function ManualSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manual[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setIsLoading(true);
    setResults([]);

    const result = await searchForManuals({ query });
    setIsLoading(false);

    if (result.success && result.data) {
      setResults(result.data);
      if (result.data.length === 0) {
        toast({
          title: "Nenhum resultado",
          description: "Não foram encontrados manuais para a sua pesquisa.",
        });
      }
    } else {
      toast({
        variant: 'destructive',
        title: "Erro na Pesquisa",
        description: result.error || "Ocorreu um erro ao procurar os manuais.",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center justify-center gap-3">
          <Wrench className="text-primary w-8 h-8" /> Pesquisa de Manuais de Motocicleta
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Encontre manuais do proprietário e de serviço para qualquer marca e modelo.
        </p>
      </header>

      <Card className="mb-8">
        <form onSubmit={handleSearch}>
          <CardHeader>
            <CardTitle>Procurar Manual</CardTitle>
            <CardDescription>Insira a marca e modelo da moto (ex: Honda CB 500F, Yamaha MT-07 2022)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Kawasaki Ninja ZX-10R 2024"
                className="flex-grow"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !query}>
                {isLoading ? (
                  <Loader2 className="mr-2 animate-spin" />
                ) : (
                  <Search className="mr-2" />
                )}
                Pesquisar
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
      
      <div className="space-y-4">
        {isLoading && (
            <div className="text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2"/>
                <p>A procurar...</p>
            </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {results.map((manual, index) => (
            <Card key={index}>
                <CardHeader>
                    <CardTitle className="flex items-start gap-3">
                        <BookUser className="text-primary w-7 h-7 mt-1"/>
                        <span>{manual.title}</span>
                    </CardTitle>
                    <CardDescription>Marca: {manual.brand} | Modelo: {manual.model} | Ano: {manual.year}</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button asChild className="w-full">
                        <a href={manual.url} target="_blank" rel="noopener noreferrer">
                            Ver Manual <ExternalLink className="ml-2"/>
                        </a>
                    </Button>
                </CardFooter>
            </Card>
            ))}
        </div>
      </div>

      <div className="text-center mt-12">
        <Button variant="outline" asChild>
            <Link href="/">Voltar à Afinação de ECU</Link>
        </Button>
      </div>

    </div>
  );
}
