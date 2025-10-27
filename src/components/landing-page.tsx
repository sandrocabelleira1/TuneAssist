
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Header from '@/components/header';
import { ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex items-center justify-center text-center">
          <div className="relative px-4">
            <div className="mb-4 inline-block">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
                    Potenciado por Inteligência Artificial
                </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
              Desbloqueie o Potencial<br />Máximo da Sua ECU
            </h1>
            <p className="max-w-xl mx-auto mt-6 text-lg text-muted-foreground">
              A única ferramenta que utiliza IA para analisar, otimizar e visualizar os mapas da sua ECU, dando-lhe a performance que você procura com a precisão que você precisa.
            </p>
            <div className="mt-10">
              <Button asChild size="lg" className="group transition-shadow duration-300 hover:neon-glow">
                <Link href="/tuner">
                  Aceder ao TuneAssist AI <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <footer className="py-8">
            <div className="container mx-auto text-center">
                <p className="text-muted-foreground">
                Uma Ferramenta Completa para o Remapeador Moderno
                </p>
            </div>
        </footer>
      </main>
    </div>
  );
}
