'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Send, User, AlertTriangle, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { type ProcessedMap, type AiFuelSuggestion, type ChatMessage } from '@/lib/types';
import { suggestFuelMapChanges } from '@/ai/flows/suggest-fuel-map-changes-flow';
import { useToast } from '@/hooks/use-toast';

interface AiChatTunerProps {
    processedMap: ProcessedMap | null;
    logData: any[];
    onSuggestion: (suggestion: AiFuelSuggestion) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
    isProcessing: boolean;
    setIsProcessing: (isProcessing: boolean) => void;
}

const SuggestionCard = ({ suggestion, onApply }: { suggestion: AiFuelSuggestion, onApply: () => void }) => {
    return (
        <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-2">
                    <Wand2 className="h-5 w-5 text-primary mt-1" />
                    <div>
                        <h4 className="font-semibold">Sugestão da IA</h4>
                        <ReactMarkdown className="text-sm prose prose-sm prose-neutral dark:prose-invert max-w-full">
                            {suggestion.reasoning}
                        </ReactMarkdown>
                    </div>
                </div>

                <p className="text-xs text-muted-foreground mt-2 mb-2">
                    {suggestion.changes.length} célula(s) a ser(em) modificada(s).
                </p>
                <Button onClick={onApply} size="sm" disabled={suggestion.changes.length === 0}>Aplicar {suggestion.changes.length > 0 ? `${suggestion.changes.length} Alterações` : 'Alterações'}</Button>
            </CardContent>
        </Card>
    );
};


export default function AiChatTuner({
    processedMap,
    logData,
    onSuggestion,
    addLog,
    isProcessing,
    setIsProcessing
}: AiChatTunerProps) {
    const { toast } = useToast();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const scrollAreaRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);
        addLog(`Enviando pedido para a IA: "${input}"`, 'info');

        try {
            if (!processedMap) {
                throw new Error("Nenhum mapa de combustível está ativo. Carregue e selecione um mapa primeiro.");
            }

            const result = await suggestFuelMapChanges({
                prompt: input,
                map: processedMap,
                logData: logData,
            });

            const assistantMessage: ChatMessage = { role: 'assistant', content: result };
            setMessages(prev => [...prev, assistantMessage]);
            addLog("IA respondeu com sugestões.", 'success');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido da IA.";
            addLog(`Erro da IA: ${errorMessage}`, 'error');
            toast({
                title: "Erro do Co-piloto de IA",
                description: errorMessage,
                variant: 'destructive',
            });
            const assistantErrorMessage: ChatMessage = { role: 'assistant', content: `Desculpe, ocorreu um erro: ${errorMessage}` };
            setMessages(prev => [...prev, assistantErrorMessage]);
        } finally {
            setIsProcessing(false);
        }
    };


    if (!processedMap) {
        return (
            <div className="flex flex-col h-full items-center justify-center text-center text-muted-foreground p-4">
                <AlertTriangle className="h-10 w-10 text-amber-500 mb-2" />
                <p className="font-semibold">Nenhum Mapa Ativo</p>
                <p className="text-sm">Selecione um mapa de combustível para ativar o co-piloto.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 -mx-6" viewportRef={scrollAreaRef}>
                <div className="px-6 py-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className="flex items-start gap-3">
                             <span className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                {msg.role === 'user' ? <User size={18} /> : <Sparkles size={18} className="text-primary" />}
                            </span>
                            <div className="flex-1">
                                {typeof msg.content === 'string' ? (
                                    <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-full">
                                        {msg.content}
                                    </ReactMarkdown>
                                ) : (
                                    <SuggestionCard 
                                        suggestion={msg.content}
                                        onApply={() => onSuggestion(msg.content as AiFuelSuggestion)}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-8">
                            <p>Pode pedir, por exemplo: <br />"O meu Lambda alvo é 0.85, por favor ajusta o mapa."<br/>"Quero mais 5% de combustível na zona de alta carga e alta rotação."</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
            <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Descreva o que pretende fazer..."
                    className="flex-1"
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                    disabled={isProcessing}
                />
                <Button type="submit" disabled={isProcessing || !input.trim()}>
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="sr-only">Enviar</span>
                </Button>
            </form>
        </div>
    );
}
