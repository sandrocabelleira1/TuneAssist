'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';

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
  React.useEffect(() => { localStorage.removeItem('pendingRegistration'); }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  });

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
             friendlyMessage = `Erro de autenticação.`;
        }
      }
      toast({
        title: 'Erro de Autenticação',
        description: friendlyMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
  }

  const handleRegistrationPayment = async (data: AuthFormValues) => {
    setIsLoading(true);
    try {
        localStorage.removeItem('pendingRegistration');
        const availability = await fetch('/api/payment-status', { cache: 'no-store' });
        if (!availability.ok || !(await availability.json()).available) {
            throw new Error('Novos pagamentos estão temporariamente indisponíveis. Tente novamente mais tarde.');
        }
        const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const token = await credential.user.getIdToken();

        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
                type: 'license',
                title: 'Licença TuneAssist AI (6 Meses)',
                unit_price: 149.00,
                quantity: 1,
                payerEmail: data.email
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Conta criada. Entre na conta e tente renovar a licença para concluir o pagamento.');
        }

        const paymentData = await response.json();
        if (paymentData.init_point) {
            window.location.href = paymentData.init_point;
        } else {
            throw new Error('Ponto de inicialização do Mercado Pago não recebido.');
        }
    } catch (error) {
        toast({
            title: 'Erro de Pagamento',
            description: (error as Error).message || 'Não foi possível iniciar o processo de pagamento.',
            variant: 'destructive',
        });
        localStorage.removeItem('pendingRegistration');
        setIsLoading(false);
    }
  };

  const handleAuth = async (data: AuthFormValues) => {
    setIsLoading(true);
    
    if (activeTab === 'register') {
      await handleRegistrationPayment(data);
      return;
    }

    // Handle Login
    signInWithEmailAndPassword(auth, data.email, data.password)
      .then((userCredential) => {
        if (userCredential.user) {
          toast({
            title: 'Login bem-sucedido!',
            description: 'Bem-vindo de volta.',
          });
          onAuthSuccess();
        }
      })
      .catch(handleAuthError)
      .finally(() => {
        setIsLoading(false);
      });
  };

  const onTabChange = (value: string) => {
      setActiveTab(value as 'login' | 'register');
      form.reset();
  }

  const togglePasswordVisibility = () => setShowPassword(prev => !prev);

  return (
    <Tabs defaultValue="login" className="w-full" onValueChange={onTabChange} value={activeTab}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">Login</TabsTrigger>
        <TabsTrigger value="register">Registar</TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <form onSubmit={form.handleSubmit(handleAuth)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" {...form.register('email')} />
             {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2 relative">
            <Label htmlFor="login-password">Palavra-passe</Label>
            <Input id="login-password" type={showPassword ? 'text' : 'password'} {...form.register('password')} />
            <Button type="button" variant="ghost" size="icon" className="absolute bottom-1 right-1 h-7 w-7" onClick={togglePasswordVisibility}>
                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
             {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </TabsContent>
      <TabsContent value="register">
        <form onSubmit={form.handleSubmit(handleAuth)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input id="register-email" type="email" {...form.register('email')} />
             {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2 relative">
            <Label htmlFor="register-password">Palavra-passe</Label>
            <Input id="register-password" type={showPassword ? 'text' : 'password'} {...form.register('password')} />
            <Button type="button" variant="ghost" size="icon" className="absolute bottom-1 right-1 h-7 w-7" onClick={togglePasswordVisibility}>
                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
            {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pagar e Criar Conta
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

