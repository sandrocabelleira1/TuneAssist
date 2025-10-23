

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Sparkles, Wand2, User, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { type ProcessedMap, type AiFuelSuggestion, type ChatMessage } from '@/lib/types';
// import { suggestFuelMapChanges } from '@/ai/flows/suggest-fuel-map-changes-flow';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';


interface AiChatTunerProps {
    processedMap: ProcessedMap;
    onApplySuggestion: (suggestion: AiFuelSuggestion) => void;
    targetLambda: number | '';
}

export default function AiChatTuner({ processedMap, onApplySuggestion, targetLambda }: AiChatTunerProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !processedMap || isLoading) return;
        
        toast({
            title: 'Funcionalidade em Desenvolvimento',
            description: 'A lógica de back-end para o co-piloto de IA ainda não está implementada.',
            variant: 'destructive',
        });
        return;

        /*
        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const mapData = {
                map: processedMap.calculatedMap,
                xAxis: processedMap.axes.x.calculated,
                yAxis: processedMap.axes.y.calculated,
            };

            const result = await suggestFuelMapChanges({
                map: mapData,
                userRequest: input,
                targetLambda: typeof targetLambda === 'number' ? targetLambda : 0.85
            });

            setMessages(prev => [...prev, { role: 'assistant', content: result }]);

        } catch (error) {
            console.error("Error calling AI flow:", error);
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: "Desculpe, ocorreu um erro ao contactar a IA. Por favor, tente novamente mais tarde."
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
        */
    };
    
    const renderMessageContent = (message: ChatMessage) => {
        if (typeof message.content === 'string') {
            return <p>{message.content}</p>;
        }

        const suggestion = message.content as AiFuelSuggestion;
        return (
            <div className="space-y-3">
                <p>{suggestion.reasoning}</p>
                <Card className="bg-background/50">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                           <Wand2 className="h-5 w-5 text-primary" />
                           <h4 className="font-semibold">Sugestão de Alterações ({suggestion.changes.length} células)</h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            A IA sugere as seguintes modificações. Pode aplicá-las diretamente no mapa.
                        </p>
                        <Button size="sm" onClick={() => onApplySuggestion(suggestion)}>
                            Aplicar Sugestão ao Mapa
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-card rounded-lg">
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
                            <Sparkles className="h-10 w-10 mb-4" />
                            <h3 className="font-semibold text-lg">Co-piloto de Afinação IA</h3>
                            <p className="text-sm">
                                Descreva o que pretende alcançar ou o problema que está a enfrentar.
                                <br/>
                                Por exemplo: <br />
                                <Badge variant="outline" className="mt-2">"Aumentar combustível em 10% entre 2000 e 4000 RPM sob carga total"</Badge>
                            </p>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} className={cn('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : '')}>
                             {msg.role === 'assistant' && (
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                            )}
                            <div className={cn(
                                'p-3 rounded-lg max-w-[85%]', 
                                msg.role === 'assistant' ? 'bg-muted' : 'bg-primary text-primary-foreground'
                            )}>
                                {renderMessageContent(msg)}
                            </div>
                              {msg.role === 'user' && (
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="h-5 w-5" />
                                </div>
                            )}
                        </div>
                    ))}
                     {isLoading && (
                        <div className="flex items-start gap-3">
                             <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div className="p-3 rounded-lg bg-muted flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>A pensar...</span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>
            <div className="p-4 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={processedMap ? "Descreva a sua alteração..." : "Selecione um mapa para ativar o chat."}
                        disabled={!processedMap || isLoading}
                        className="flex-1"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                            }
                        }}
                    />
                    <Button type="submit" disabled={!processedMap || isLoading || !input.trim()}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        <span className="sr-only">Enviar</span>
                    </Button>
                </form>
            </div>
        </div>
    );
}