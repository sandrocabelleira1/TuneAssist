
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2, Download, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

function SuccessContent() {
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [message, setMessage] = useState('A processar o seu pedido...');

    useEffect(() => {
        const paymentType = searchParams.get('type');
        
        const processPayment = async () => {
            if (paymentType === 'credits') {
                const userId = searchParams.get('userId');
                if (userId && firestore) {
                    try {
                        setMessage('A adicionar créditos à sua conta...');
                        const userDocRef = doc(firestore, 'users', userId);
                        await updateDoc(userDocRef, {
                            credits: increment(10)
                        });
                        setStatus('success');
                        setMessage('10 créditos foram adicionados com sucesso à sua conta!');
                        setTimeout(() => router.push('/tuner'), 3000);
                    } catch (error) {
                        console.error("Error updating credits:", error);
                        setStatus('error');
                        setMessage('Ocorreu um erro ao adicionar os créditos. Por favor, contacte o suporte.');
                    }
                }
            } else if (paymentType === 'download') {
                setMessage('A preparar o seu ficheiro...');
                const pendingFileString = localStorage.getItem('pendingBinFile');
                const pendingFileName = localStorage.getItem('pendingBinFileName');
                const userId = localStorage.getItem('pendingBinFileUserId');
                const creditsToDeduct = 3;

                if (pendingFileString && pendingFileName && userId && firestore) {
                    try {
                        // Deduct credits
                        const userDocRef = doc(firestore, 'users', userId);
                        await updateDoc(userDocRef, {
                            credits: increment(-creditsToDeduct)
                        });

                        // Trigger download
                        const bufferArray = JSON.parse(pendingFileString);
                        const newBinBuffer = new Uint8Array(bufferArray).buffer;
                        
                        const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = pendingFileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        
                        setStatus('success');
                        setMessage(`Download iniciado! ${creditsToDeduct} créditos foram deduzidos.`);

                    } catch (e) {
                         console.error("Error processing download or deducting credits:", e);
                         setStatus('error');
                         setMessage('Ocorreu um erro ao processar o seu download. Os créditos não foram deduzidos.');
                    } finally {
                        localStorage.removeItem('pendingBinFile');
                        localStorage.removeItem('pendingBinFileName');
                        localStorage.removeItem('pendingBinFileUserId');
                    }
                } else {
                     setStatus('error');
                     setMessage('Não foi possível encontrar os dados do ficheiro para download.');
                }
            } else {
                 setStatus('success');
                 setMessage('O seu pagamento foi processado com sucesso.');
            }
        };

        processPayment();
    }, [searchParams, firestore, router]);


    const renderStatus = () => {
        switch (status) {
            case 'processing':
                return <Loader2 className="h-10 w-10 text-primary animate-spin" />;
            case 'success':
                return <CheckCircle2 className="h-10 w-10 text-green-600" />;
            case 'error':
                return <AlertTriangle className="h-10 w-10 text-destructive" />;
        }
    }

    return (
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    {renderStatus()}
                </div>
                <CardTitle className="mt-4 text-2xl font-bold">Pagamento Aprovado!</CardTitle>
                <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button asChild className="w-full">
                    <Link href="/tuner">Voltar para a Ferramenta</Link>
                </Button>
            </CardContent>
        </Card>
    );
}


export default function PaymentSuccessPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <Suspense fallback={<Loader2 className="h-16 w-16 animate-spin" />}>
                <SuccessContent />
            </Suspense>
        </div>
    );
}

