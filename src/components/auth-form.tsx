'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

const authSchema = z.object({
  email: z.string().email({ message: 'Por favor, insira um email válido.' }),
  password: z
    .string()
    .min(6, { message: 'A palavra-passe deve ter pelo menos 6 caracteres.' }),
});

type AuthFormValues = z.infer<typeof authSchema>;

interface AuthFormProps {
    onAuthSuccess: () => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  });

  const [authAction, setAuthAction] = useState<'login' | 'register' | null>(null);

  useEffect(() => {
    if (!isUserLoading && user && authAction) {
        setIsLoading(false);
        if (authAction === 'register') {
            toast({
                title: 'Registo bem-sucedido!',
                description: 'A sua conta foi criada.',
            });
        } else {
            toast({ title: 'Login bem-sucedido!', description: 'Bem-vindo de volta.' });
        }
        onAuthSuccess();
        setAuthAction(null);
    }
  }, [user, isUserLoading, authAction, onAuthSuccess, toast]);

  const handleAuth = (data: AuthFormValues, isRegister: boolean) => {
    setIsLoading(true);
    setError(null);
    setAuthAction(isRegister ? 'register' : 'login');

    try {
      if (isRegister) {
        createUserWithEmailAndPassword(auth, data.email, data.password)
            .catch(handleAuthError);
      } else {
        signInWithEmailAndPassword(auth, data.email, data.password)
            .catch(handleAuthError);
      }
    } catch (err) {
        // Catch synchronous errors if any, though unlikely with firebase auth
        handleAuthError(err);
    }
  };

  const handleAuthError = (err: any) => {
      let friendlyMessage = 'Ocorreu um erro. Por favor, tente novamente.';
      if (err.code) {
        switch (err.code) {
          case 'auth/email-already-in-use':
            friendlyMessage = 'Este email já está em uso.';
            break;
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
             friendlyMessage = 'Email ou palavra-passe incorretos.';
             break;
          case 'auth/invalid-email':
            friendlyMessage = 'O email fornecido não é válido.';
            break;
          default:
             friendlyMessage = `Erro: ${err.message}`;
        }
      }
      setError(friendlyMessage);
      toast({
        title: 'Erro de Autenticação',
        description: friendlyMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
      setAuthAction(null);
  }

  return (
    <Tabs defaultValue="login" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">Login</TabsTrigger>
        <TabsTrigger value="register">Registar</TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <form onSubmit={form.handleSubmit((data) => handleAuth(data, false))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" {...form.register('email')} />
             {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Palavra-passe</Label>
            <Input id="login-password" type="password" {...form.register('password')} />
             {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
           {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </TabsContent>
      <TabsContent value="register">
        <form onSubmit={form.handleSubmit((data) => handleAuth(data, true))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input id="register-email" type="email" {...form.register('email')} />
             {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Palavra-passe</Label>
            <Input id="register-password" type="password" {...form.register('password')} />
            {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
           {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Conta
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
