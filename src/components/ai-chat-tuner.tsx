'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Send, User, AlertTriangle, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { type ProcessedMap, type AiFuelSuggestion, type ChatMessage, type XDFinition } from '@/lib/types';
import { suggestFuelMapChanges } from '@/ai/flows/suggest-fuel-map-changes-flow';

interface AiChatTunerProps {
    processedMap: ProcessedMap;
    logData: any[];
    selectedMapDefinition: XDFinition | undefined;
    onSuggestion: (suggestion: AiFuelSuggestion) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export default function AiChatTuner({ 
    processedMap, 
    logData, 
    selectedMapDefinition, 
    onSuggestion,
    addLog,
    messages,
    setMessages,
}: AiChatTunerProps) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !processedMap) return;

        const newUserMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, newUserMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const suggestion = await suggestFuelMapChanges({
                prompt: input,
                currentMap: processedMap,
                mapDefinition: selectedMapDefinition,
                logData: logData,
            });
            
            const newAssistantMessage: ChatMessage = { role: 'assistant', content: suggestion };
            setMessages(prev => [...prev, newAssistantMessage]);
            if (suggestion.changes.length > 0) {
                addLog(`Co-piloto IA sugeriu ${suggestion.changes.length} alterações.`, 'info');
            }

        } catch (error) {
            const errorMessage = `Erro ao comunicar com a IA: ${(error as Error).message}`;
            addLog(errorMessage, 'error');
            const newErrorAssistantMessage: ChatMessage = { 
                role: 'assistant', 
                content: { reasoning: `Desculpe, ocorreu um erro: ${errorMessage}`, changes: [] }
            };
            setMessages(prev => [...prev, newErrorAssistantMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!processedMap || !selectedMapDefinition) {
        return (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground p-4 bg-card rounded-lg border">
                <div>
                    <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
                    <h3 className="mt-4 text-lg font-medium">Co-piloto Indisponível</h3>
                    <p className="mt-1 text-sm">Por favor, carregue um ficheiro BIN/XDF e selecione um mapa para ativar o co-piloto de afinação IA.</p>
                </div>
            </div>
        );
    }
    

    return (
        <div className="h-full flex flex-col gap-4">
            <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/20" viewportRef={scrollAreaRef}>
                <div className="space-y-6">
                    {messages.length === 0 && (
                        <Card className="bg-background/70 backdrop-blur-sm">
                            <CardContent className="p-6 text-center">
                                <Sparkles className="mx-auto h-10 w-10 text-primary mb-4" />
                                <h3 className="text-lg font-semibold mb-1">Co-piloto de Afinação IA</h3>
                                <p className="text-muted-foreground text-sm">
                                    Bem-vindo! Peça-me para analisar e modificar o seu mapa de combustível. <br/>
                                    Pode pedir, por exemplo: <br />
                                    <em className="font-medium">"Aumente o combustível em 5% acima de 4000 RPM"</em> <br/>
                                    ou, se tiver um log carregado: <br/>
                                    <em className="font-medium">"Ajuste para um lambda alvo de 0.85 com base no meu ensaio."</em>
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && (
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                            )}
                            <div className={`rounded-lg p-3 max-w-xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}>
                                {typeof msg.content === 'string' ? (
                                    <p>{msg.content}</p>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="prose prose-sm prose-invert text-foreground">
                                            <ReactMarkdown
                                                components={{ 
                                                    p: ({node, ...props}) => <p className="text-sm" {...props} />,
                                                    strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                                                }}
                                            >
                                                {(msg.content as AiFuelSuggestion).reasoning}
                                            </ReactMarkdown>
                                        </div>
                                        {(msg.content as AiFuelSuggestion).changes.length > 0 && (
                                            <Button onClick={() => onSuggestion(msg.content as AiFuelSuggestion)} size="sm">
                                                <Wand2 className="mr-2 h-4 w-4" />
                                                Aplicar { (msg.content as AiFuelSuggestion).changes.length } Alterações
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                             {msg.role === 'user' && (
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center">
                                    <User className="h-5 w-5" />
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                         <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div className="rounded-lg p-3 bg-background border">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>A pensar...</span>
                                </div>
                            </div>
                         </div>
                    )}
                </div>
            </ScrollArea>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`A modificar "${selectedMapDefinition.name}". Peça uma alteração...`}
                    className="flex-1"
                    rows={1}
                    onKeyDown={(e) => {
                        if(e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                    disabled={isLoading}
                />
                <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="h-auto w-10">
                    <Send className="h-5 w-5" />
                </Button>
            </form>
        </div>
    );
}
