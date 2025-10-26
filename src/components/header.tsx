'use client';

import Link from 'next/link';
import { Sparkles, User, Loader2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';


export default function Header() {
  const { user, isUserLoading } = useUser();

  const renderUserStatus = () => {
    if (isUserLoading) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }

    if (user) {
      return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Avatar className="h-8 w-8">
                        {user.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                        <AvatarFallback>
                            <User className="h-5 w-5" />
                        </AvatarFallback>
                    </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Sessão anónima ativa</p>
                    <p className="text-xs text-muted-foreground">ID: {user.uid}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
      );
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Avatar className="h-8 w-8 border-2 border-dashed border-muted-foreground">
                        <AvatarFallback>
                            <User className="h-5 w-5 text-muted-foreground" />
                        </AvatarFallback>
                    </Avatar>
                </TooltipTrigger>
                 <TooltipContent>
                    <p>Sem sessão iniciada</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold sm:inline-block">TuneAssist AI</span>
        </Link>
        <div className="flex flex-1 items-center justify-end">
            {renderUserStatus()}
        </div>
      </div>
    </header>
  );
}
