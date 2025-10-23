
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Send, User, AlertTriangle, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { type ProcessedMap, type AiFuelSuggestion, type ChatMessage } from '@/lib/types';
// import { suggestFuelMapChanges } from '@/ai/flows/suggest-fuel-map-changes-flow';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';

interface AiChatTunerProps {
  processedMap: ProcessedMap;
  targetLambda: number;
  onApplySuggestion: (suggestion: AiFuelSuggestion) => void;
}

export default function AiChatTuner({ processedMap, targetLambda, onApplySuggestion }: AiChatTunerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !processedMap) {
        toast({
            title: "Dados Insuficientes",
            description: "Por favor, escreva uma mensagem e certifique-se de que um mapa está carregado.",
            variant: "destructive"
        });
      return;
    }
    
    // TEMPORARILY DISABLED TO PREVENT BUILD ERRORS
    toast({
        title: "Funcionalidade em Desenvolvimento",
        description: "A funcionalidade de sugestões de IA está atualmente em desenvolvimento.",
        variant: "default"
    });
    return;
    // END TEMPORARY
    

    /*
    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const mapData = {
        map: processedMap.calculatedMap,
        xAxis: processedMap.axes.x,
        yAxis: processedMap.axes.y,
      };

      const aiResponse = await suggestFuelMapChanges({
        userRequest: input,
        currentMap: mapData,
        targetLambda: targetLambda,
        chatHistory: messages
      });
      
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);

    } catch (error) {
      console.error("Error calling AI flow:", error);
      const errorMessage: ChatMessage = {
          role: 'assistant',
          content: {
              reasoning: "Ocorreu um erro ao comunicar com a IA. Por favor, tente novamente.",
              changes: []
          }
      };
      setMessages(prev => [...prev, errorMessage]);
      toast({
        title: "Erro de IA",
        description: (error as Error).message || "Não foi possível obter uma sugestão da IA.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
    */
  }, [input, processedMap, messages, targetLambda, toast]);
  
  const renderMessageContent = (message: ChatMessage) => {
    if (typeof message.content === 'string') {
      return <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-full">{message.content}</ReactMarkdown>;
    }

    const suggestion = message.content as AiFuelSuggestion;
    return (
      <div className="space-y-2">
        <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-full">{suggestion.reasoning}</ReactMarkdown>
        {suggestion.changes.length > 0 && (
          <div className="space-y-2">
            <Badge variant="secondary">{suggestion.changes.length} célula(s) para alterar</Badge>
            <Button size="sm" onClick={() => onApplySuggestion(suggestion)}>
              <Wand2 className="mr-2" /> Aplicar Sugestões
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
        { !processedMap ? (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
                <div className="space-y-2">
                    <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                    <h3 className="font-semibold">Nenhum Mapa Ativo</h3>
                    <p className="text-sm">Por favor, carregue e selecione um mapa para usar o co-piloto.</p>
                </div>
            </div>
        ) : (
            <>
                <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                    <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground p-8">
                            <Sparkles className="mx-auto h-10 w-10 mb-2" />
                            <p>Descreva as suas metas ou problemas. <br/> Ex: "A mistura está pobre em alta rotação" ou "Quero um alvo de 0.85 lambda em WOT".</p>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} className={cn("flex items-start gap-3", msg.role === 'user' ? 'justify-end' : '')}>
                        {msg.role === 'assistant' && (
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                                <Sparkles className="h-5 w-5" />
                            </div>
                        )}
                        <Card className={cn("max-w-[85%]", msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                            <CardContent className="p-3">
                                {renderMessageContent(msg)}
                            </CardContent>
                        </Card>
                        {msg.role === 'user' && (
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
                                <User className="h-5 w-5" />
                            </div>
                        )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <Card className="bg-muted">
                                <CardContent className="p-3 flex items-center gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm">A pensar...</span>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                    </div>
                </ScrollArea>
                <div className="p-4 border-t">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Descreva o seu problema ou objetivo..."
                        className="flex-1 resize-none"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                            }
                        }}
                        disabled={isLoading || !processedMap}
                    />
                    <Button type="submit" disabled={isLoading || !input.trim() || !processedMap}>
                        <Send className="h-4 w-4" />
                    </Button>
                    </form>
                </div>
            </>
        )}
    </div>
  );
}
