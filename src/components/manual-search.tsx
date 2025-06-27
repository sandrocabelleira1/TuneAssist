'use client';

import { useState } from 'react';
import Link from 'next/link';
import { searchForManuals, generateManualContent } from '@/app/actions';
import type { MotorcycleManualFlowOutput } from '@/ai/flows/motorcycle-manual-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Wrench, Sparkles, BookUser } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Manual = MotorcycleManualFlowOutput[0];

export default function ManualSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [results, setResults] = useState<Manual[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState<number | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setIsLoading(true);
    setResults([]);
    
    const brandForSearch = brand === 'any-brand' ? '' : brand;

    const result = await searchForManuals({ query, brand: brandForSearch });
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

  const handleGenerateContent = async (manual: Manual, index: number) => {
    setIsGenerating(index);
    setGeneratedContent(null);

    const result = await generateManualContent({
        title: manual.title,
        brand: manual.brand,
        model: manual.model,
        year: manual.year,
    });

    setIsGenerating(null);

    if (result.success && result.data) {
        setGeneratedContent(result.data.content);
        setIsContentModalOpen(true);
    } else {
        toast({
            variant: 'destructive',
            title: "Erro na Geração",
            description: result.error || "Não foi possível gerar o conteúdo do manual.",
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
          Encontre e gere exemplos de manuais do proprietário e de serviço para qualquer marca e modelo.
        </p>
      </header>

      <form onSubmit={handleSearch}>
        <Card className="mb-8">
            <CardHeader>
              <CardTitle>Procurar Manual</CardTitle>
              <CardDescription>Insira detalhes do modelo e, opcionalmente, filtre por marca para refinar a sua pesquisa.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="sm:col-span-2 space-y-2">
                      <Label htmlFor="query">Pesquisa (Modelo, Ano, etc.)</Label>
                      <Input
                          id="query"
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Ex: Ninja ZX-10R 2024"
                          className="w-full"
                          disabled={isLoading}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="brand-select">Marca</Label>
                      <Select value={brand} onValueChange={setBrand} disabled={isLoading}>
                          <SelectTrigger id="brand-select">
                              <SelectValue placeholder="Qualquer Marca" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="any-brand">Qualquer Marca</SelectItem>
                              <SelectItem value="Yamaha">Yamaha</SelectItem>
                              <SelectItem value="Honda">Honda</SelectItem>
                              <SelectItem value="Suzuki">Suzuki</SelectItem>
                              <SelectItem value="Kawasaki">Kawasaki</SelectItem>
                              <SelectItem value="BMW">BMW</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6 justify-end">
              <Button type="submit" disabled={isLoading || !query}>
                  {isLoading ? (
                      <Loader2 className="mr-2 animate-spin" />
                  ) : (
                      <Search className="mr-2" />
                  )}
                  Pesquisar
              </Button>
            </CardFooter>
        </Card>
      </form>
      
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
                    <Button 
                        onClick={() => handleGenerateContent(manual, index)} 
                        disabled={isLoading || isGenerating !== null}
                        className="w-full"
                    >
                        {isGenerating === index ? (
                            <Loader2 className="mr-2 animate-spin" />
                        ) : (
                            <Sparkles className="mr-2" />
                        )}
                        Gerar Exemplo de Conteúdo
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

      <Dialog open={isContentModalOpen} onOpenChange={setIsContentModalOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
                  <DialogTitle>Conteúdo Gerado do Manual</DialogTitle>
                  <DialogDescription>
                      Este é um exemplo de conteúdo gerado por IA. Não é um manual real.
                  </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4 mt-4 border rounded-lg p-4 bg-muted/50">
                  <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="prose dark:prose-invert max-w-none"
                      components={{
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 border-b pb-2" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-3" {...props} />,
                          p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-primary" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc list-inside mb-4 space-y-1" {...props} />,
                          li: ({node, ...props}) => <li className="mb-1" {...props} />,
                          table: ({node, ...props}) => <table className="w-full my-4 text-sm" {...props} />,
                          thead: ({node, ...props}) => <thead className="font-semibold" {...props} />,
                          tbody: ({node, ...props}) => <tbody {...props} />,
                          tr: ({node, ...props}) => <tr className="border-b" {...props} />,
                          td: ({node, ...props}) => <td className="p-2" {...props} />,
                          th: ({node, ...props}) => <th className="p-2 text-left" {...props} />,
                      }}
                  >
                      {generatedContent || ''}
                  </ReactMarkdown>
              </ScrollArea>
          </DialogContent>
      </Dialog>
    </div>
  );
}
