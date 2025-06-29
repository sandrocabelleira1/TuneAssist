'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Power, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { signOut } from '@/lib/firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function Header() {
  const router = useRouter();
  const { toast } = useToast();
  
  const handleSignOut = async () => {
    try {
        await signOut();
        toast({
            title: 'Sessão terminada',
            description: 'Você foi desconectado com sucesso.',
        });
        router.push('/login');
    } catch (error) {
        toast({
            title: 'Erro ao sair',
            description: 'Não foi possível terminar a sessão. Tente novamente.',
            variant: 'destructive',
        });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/projects" className="mr-6 flex items-center space-x-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold sm:inline-block">TuneAssist AI</span>
        </Link>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-1">
             <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <Power className="mr-2 h-4 w-4" />
                Sair
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
