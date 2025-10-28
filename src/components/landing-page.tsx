
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Header from '@/components/header';
import { ArrowRight, Cpu, BarChart3, Wand2, FolderClock } from 'lucide-react';
import Image from 'next/image';
import placeholderImages from '@/app/lib/placeholder-images.json';

const features = [
  {
    icon: <Wand2 className="h-8 w-8 text-primary" />,
    title: 'Análise Potenciada por IA',
    description: 'A nossa IA analisa os seus mapas e logs, identificando áreas para otimização de combustível e ignição que passariam despercebidas.',
    image: placeholderImages.feature1,
  },
  {
    icon: <Cpu className="h-8 w-8 text-primary" />,
    title: 'Otimização de Mapas',
    description: 'Receba sugestões de ajuste precisas ou deixe que a nossa IA aplique automaticamente as correções para atingir os seus alvos de performance.',
    image: placeholderImages.feature2,
  },
  {
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
    title: 'Visualização Avançada',
    description: 'Explore os seus mapas em 2D e 3D. Compare o antes e o depois das alterações e analise dados de forma intuitiva.',
    image: placeholderImages.feature3,
  },
  {
    icon: <FolderClock className="h-8 w-8 text-primary" />,
    title: 'Remapeamento Acelerado',
    description: 'Reduza horas de trabalho manual a minutos. O TuneAssist AI automatiza a análise e correção de dados, permitindo-lhe entregar mais projetos em menos tempo.',
    image: placeholderImages.feature4,
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex items-center justify-center text-center pt-32">
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
              <Button asChild size="lg" className="group transition-shadow duration-300 neon-glow">
                <Link href="/tuner">
                  Experimentar o TuneAssist AI <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
             <div className="mt-16 mb-8">
                <Image
                    src="https://firebasestorage.googleapis.com/v0/b/tuneassist-ai-3-32994972-ce581.firebasestorage.app/o/logo%20tune%20transparente1.png?alt=media&token=f3dfc6f4-bc1e-4b9d-a28a-1be56950ff55"
                    alt="TuneAssist AI Logo"
                    width={200}
                    height={200}
                    className="mx-auto"
                    priority
                />
            </div>
          </div>
        </section>

        <section id="features" className="py-20 sm:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Uma Ferramenta, Potencial Ilimitado</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Desde a análise de logs à otimização automática, o TuneAssist AI tem tudo o que precisa.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="bg-accent/50 p-8 rounded-lg border border-border/20 shadow-sm hover:border-primary/50 hover:shadow-primary/10 transition-all group">
                  <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 mb-6">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-muted-foreground">{feature.description}</p>
                   <div className="mt-6 aspect-video overflow-hidden rounded-md border border-border/20">
                     <Image
                        src={feature.image.src}
                        alt={feature.title}
                        width={600}
                        height={400}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        {...feature.image['data-ai-hint'] && { 'data-ai-hint': feature.image['data-ai-hint'] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="py-8">
            <div className="container mx-auto text-center px-4">
                <p className="text-muted-foreground">
                Uma Ferramenta Completa para o Remapeador Moderno
                </p>
            </div>
        </footer>
      </main>
    </div>
  );
}
