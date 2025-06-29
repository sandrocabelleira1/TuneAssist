'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default function ProjectsPage() {
  // A mock project ID for demonstration
  const mockProjectId = "demo-project-123";

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
