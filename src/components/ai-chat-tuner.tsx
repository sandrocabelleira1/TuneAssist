
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wand2, Sparkles, Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { type ProcessedMap, type AiFuelSuggestion, type ChatMessage } from '@/lib/types';
import { suggestFuelMapChanges } from '@/ai/flows/suggest-fuel-map-changes-flow';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';

interface AiChatTunerProps {
    processedMap: ProcessedMap;
    targetLambda: number | '';
    onApplySuggestion: (suggestion: AiFuelSuggestion) => void;
    disabled?: boolean;
}

const SYSTEM_MESSAGE: ChatMessage = {
    role: 'system',
    content: 'Olá! Sou o seu co-piloto de afinação. Descreva o comportamento do motor, os dados do dinamómetro ou os seus objetivos, e eu irei sugerir alterações ao mapa de combustível atual. Por exemplo: "O carro hesita com carga parcial a 3000 RPM e o lambda está em 0.95. Quero um lambda de 0.87 nessa zona."'
};

export default function AiChatTuner({ processedMap, targetLambda, onApplySuggestion, disabled }: AiChatTunerProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([SYSTEM_MESSAGE]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages]);

    const handleSendMessage = async () => {
        if (!userInput.trim() || isLoading || !processedMap) return;

        const userMessage: ChatMessage = { role: 'user', content: userInput };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsLoading(true);

        try {
            const suggestion = await suggestFuelMapChanges({
                userRequest: userInput,
                currentMap: processedMap.calculatedMap!,
                xAxis: processedMap.axes.x,
                yAxis: processedMap.axes.y,
                targetLambda: Number(targetLambda) || undefined,
            });

            const assistantMessage: ChatMessage = { role: 'assistant', content: suggestion };
            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            const errorMessage: ChatMessage = {
                role: 'system',
                content: `Desculpe, ocorreu um erro ao contactar a IA: ${(error as Error).message}`
            };
            setMessages(prev => [...prev, errorMessage]);
            toast({
                title: "Erro de IA",
                description: (error as Error).message,
                variant: "destructive"
            })
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleApplyClick = (suggestion: AiFuelSuggestion) => {
        if(disabled) {
            toast({ title: "Mapa Não Selecionado", description: "Por favor, selecione um mapa para aplicar as alterações.", variant: "destructive" });
            return;
        }
        onApplySuggestion(suggestion);
    }

    const renderMessageContent = (message: ChatMessage) => {
        if (typeof message.content === 'string') {
            return <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{message.content}</ReactMarkdown>;
        }

        const suggestion = message.content as AiFuelSuggestion;
        return (
            <div className="space-y-2">
                <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{suggestion.reasoning}</ReactMarkdown>
                <div className="p-2 border rounded-md bg-background/50">
                    <p className="text-xs font-semibold mb-2">Sugestão de Alteração ({suggestion.changes.length} células):</p>
                    <Button size="sm" onClick={() => handleApplyClick(suggestion)}>
                        <Wand2 className="mr-2" />Aplicar Alterações Sugeridas
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col gap-2">
            <ScrollArea className="flex-1 border rounded-lg p-2" viewportRef={scrollAreaRef}>
                <div className="space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={cn("flex items-start gap-2", {
                            'justify-end': msg.role === 'user'
                        })}>
                            {msg.role !== 'user' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                </div>
                            )}
                            <div className={cn("max-w-[85%] p-3 rounded-lg text-sm", {
                                'bg-primary text-primary-foreground': msg.role === 'user',
                                'bg-muted': msg.role !== 'user',
                            })}>
                                {renderMessageContent(msg)}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                         <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-primary" />
                            </div>
                             <div className="bg-muted p-3 rounded-lg">
                                 <Loader2 className="w-5 h-5 animate-spin" />
                             </div>
                         </div>
                    )}
                </div>
            </ScrollArea>
            <div className="flex items-center gap-2">
                <Textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder={disabled ? "Selecione um mapa para ativar o chat..." : "Descreva o seu problema..."}
                    className="min-h-[40px] max-h-24 flex-1"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                    }}
                    disabled={isLoading || disabled}
                />
                <Button onClick={handleSendMessage} disabled={isLoading || !userInput.trim() || disabled}>
                    <Send className="mr-2" /> Enviar
                </Button>
            </div>
        </div>
    );
}
