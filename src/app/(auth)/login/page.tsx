import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { UserAuthForm } from '@/components/auth/user-auth-form';
import { Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Login',
  description: 'Faça login na sua conta',
};

export default function LoginPage() {
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Bem-vindo ao TuneAssist AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre para gerir os seus projetos de tuning
          </p>
        </div>
        <UserAuthForm />
      </div>
    </div>
  );
}
