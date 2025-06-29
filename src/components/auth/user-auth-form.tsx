'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from '@/lib/firebase/auth';

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {}

const userAuthSchema = z.object({
  email: z.string().email({ message: 'Por favor, insira um e-mail válido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
});

type FormData = z.infer<typeof userAuthSchema>;

export function UserAuthForm({ className, ...props }: UserAuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(userAuthSchema),
    defaultValues: {
      email: 'test@example.com',
      password: 'password',
    },
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(data: FormData) {
    setIsLoading(true);

    try {
      // Try to sign in first
      await signIn(data.email, data.password);
      toast({
        title: 'Login bem-sucedido!',
        description: 'A redirecionar para os seus projetos...',
      });
      router.push('/projects');
    } catch (signInError: any) {
      // If sign in fails because the user doesn't exist, try to sign them up.
      // This is for the convenience of the test user.
      if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential') {
        try {
          await signUp(data.email, data.password);
          toast({
            title: 'Conta de teste criada!',
            description: 'Login efetuado com sucesso. A redirecionar...',
          });
          router.push('/projects');
        } catch (signUpError: any) {
          toast({
            title: 'Erro de Autenticação',
            description: 'Não foi possível criar a conta de teste.',
            variant: 'destructive',
          });
        }
      } else {
         toast({
            title: 'Erro de Login',
            description: 'Verifique o seu e-mail e senha.',
            variant: 'destructive',
          });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn('grid gap-6', className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="nome@exemplo.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={isLoading}
              {...register('email')}
            />
            {errors?.email && (
              <p className="px-1 text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
           <div className="grid gap-1">
            <Label htmlFor="password">
              Senha
            </Label>
            <Input
              id="password"
              placeholder="Senha"
              type="password"
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect="off"
              disabled={isLoading}
              {...register('password')}
            />
            {errors?.password && (
              <p className="px-1 text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <button className={cn(buttonVariants())} disabled={isLoading}>
            {isLoading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Entrar ou Criar Conta
          </button>
        </div>
      </form>
    </div>
  );
}
