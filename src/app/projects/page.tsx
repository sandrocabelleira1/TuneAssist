'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { PlusCircle, Loader2 } from 'lucide-react';

const auth = getAuth(app);

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/login');
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]);

  // A mock project ID for demonstration
  const mockProjectId = "demo-project-123";

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-theme(height.14))] items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null; // Redirect is handled by useEffect
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Meus Projetos</h1>
        <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Novo Projeto
        </Button>
      </div>

      <div className="grid gap-4">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
                <CardTitle>Projeto de Demonstração</CardTitle>
                <CardDescription>Kawasaki ZX636 - Use este projeto para explorar a interface de tuning.</CardDescription>
            </CardHeader>
            <CardFooter>
                <Button asChild>
                    <Link href={`/tuning/${mockProjectId}`}>Abrir Projeto</Link>
                </Button>
            </CardFooter>
          </Card>
          {/* This is where a list of projects would be mapped */}
      </div>
    </div>
  );
}
