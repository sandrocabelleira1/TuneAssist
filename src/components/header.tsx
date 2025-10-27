'use client';

import Link from 'next/link';
import { Sparkles, User, Loader2, LogIn, LogOut, Wrench } from 'lucide-react';
import { useUser, useAuth } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import AuthForm from './auth-form';
import { useState } from 'react';
import { usePathname } from 'next/navigation';


export default function Header() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);


  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao terminar a sessão", error);
    }
  };

  const renderUserStatus = () => {
    if (isUserLoading) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }

    if (user) {
      return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Avatar className="h-8 w-8 cursor-pointer">
                    {user.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                    <AvatarFallback>
                        <User className="h-5 w-5" />
                    </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.displayName || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Terminar Sessão</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
              <LogIn className="mr-2 h-4 w-4" />
              Login
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Autenticação</DialogTitle>
            <DialogDescription>
              Inicie a sessão ou registe-se para salvar os seus backups na nuvem.
            </DialogDescription>
          </DialogHeader>
          <AuthForm onAuthSuccess={() => setIsAuthDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    )
  };


  return (
    <header className="absolute top-0 z-50 w-full bg-transparent">
      <div className="container mx-auto flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold sm:inline-block">TuneAssist AI</span>
        </Link>
        
        <div className="flex items-center gap-4">
            {pathname !== '/tuner' && (
                <Button asChild variant="ghost" size="sm">
                    <Link href="/tuner">
                        Ferramenta de Afinação
                    </Link>
                </Button>
            )}
            {renderUserStatus()}
        </div>
      </div>
    </header>
  );
}
