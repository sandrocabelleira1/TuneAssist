'use client';

import { useState } from 'react';
import Link from 'next/link';
import { searchForManuals } from '@/app/actions';
import type { MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Wrench, ExternalLink, BookUser } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type Manual = MotorcycleManualFlowOutput[0];

export default function ManualSearch() {
  const { toast } = useToast();
  const [model, setModel] = useState('');
  const [results, setResults] = useState<Manual[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model) return;

    setIsLoading(true);
    setResults([]);

    const result = await searchForManuals({ model });
    setIsLoading(false);

    if (result.success && result.data) {
      setResults(result.data);
      if (result.data.length === 0) {
        toast({
          title: "Nenhum resultado",
          description: "Não foram encontrados manuais para o modelo especificado.",
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
          <Wrench className="text-primary w-8 h-8" /> Pesquisa de Manuais Yamaha
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Encontre manuais do proprietário e de serviço para a sua moto.
        </p>
      </header>

      <Card className="mb-8">
        <form onSubmit={handleSearch}>
          <CardHeader>
            <CardTitle>Procurar Manual</CardTitle>
            <CardDescription>Insira o modelo da moto (ex: R1, MT-07, Lander)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: MT-09"
                className="flex-grow"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !model}>
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
                    <CardDescription>Modelo: {manual.model} | Ano: {manual.year}</CardDescription>
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
