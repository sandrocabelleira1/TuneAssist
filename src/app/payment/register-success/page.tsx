'use client';

import { useEffect, useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { add } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RegisterSuccessPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const finalizeRegistration = async () => {
            const pendingRegString = localStorage.getItem('pendingRegistration');
            if (!pendingRegString) {
                setErrorMessage('Nenhuma informação de registo pendente encontrada.');
                setStatus('error');
                return;
            }

            try {
                const { email, password } = JSON.parse(pendingRegString);
                
                // 1. Create user in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                if (!user) {
                    throw new Error("Falha ao obter os dados do utilizador após a criação.");
                }
                
                // 2. Create user profile in Firestore
                const userDocRef = doc(firestore, 'users', user.uid);
                const expiryDate = add(new Date(), { months: 6 });

                await setDoc(userDocRef, {
                    id: user.uid,
                    email: user.email,
                    credits: 0,
                    licenseExpiryDate: expiryDate.toISOString(),
                });

                // 3. Clean up and redirect
                localStorage.removeItem('pendingRegistration');
                setStatus('success');

                setTimeout(() => {
                    router.push('/tuner');
                }, 3000);

            } catch (error: any) {
                let friendlyMessage = 'Ocorreu um erro desconhecido ao finalizar o seu registo.';
                if (error.code) {
                    switch (error.code) {
                        case 'auth/email-already-in-use':
                            friendlyMessage = 'Este email já foi registado. Por favor, faça login.';
                            break;
                        default:
                            friendlyMessage = `Erro: ${error.message} (código: ${error.code})`;
                    }
                }
                setErrorMessage(friendlyMessage);
                setStatus('error');
                localStorage.removeItem('pendingRegistration');
            }
        };

        finalizeRegistration();
    }, [auth, firestore, router]);

    const renderContent = () => {
        switch (status) {
            case 'processing':
                return (
                    <>
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <CardTitle className="mt-4 text-2xl font-bold">A Finalizar o seu Registo...</CardTitle>
                        <CardDescription>O seu pagamento foi aprovado! Estamos a criar a sua conta.</CardDescription>
                    </>
                );
            case 'success':
                return (
                    <>
                        <CheckCircle className="h-10 w-10 text-green-500" />
                        <CardTitle className="mt-4 text-2xl font-bold">Conta Criada com Sucesso!</CardTitle>
                        <CardDescription>Bem-vindo ao TuneAssist AI! Será redirecionado em breve.</CardDescription>
                    </>
                );
            case 'error':
                 return (
                    <>
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                        <CardTitle className="mt-4 text-2xl font-bold">Erro ao Criar Conta</CardTitle>
                        <CardDescription>{errorMessage}</CardDescription>
                        <Button onClick={() => router.push('/')} className="mt-4">Voltar à Página Principal</Button>
                    </>
                );
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    {renderContent()}
                </CardHeader>
            </Card>
        </div>
    );
}
