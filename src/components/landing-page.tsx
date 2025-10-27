
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BrainCircuit, Cpu, Wand2 } from 'lucide-react';
import Header from '@/components/header';
import Image from 'next/image';
import placeholderImages from '@/app/lib/placeholder-images.json';


export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative w-full h-[60vh] md:h-[70vh] flex flex-col items-center justify-center text-center px-4">
            <div 
                className="absolute inset-0 bg-grid-pattern opacity-10"
                style={{
                    maskImage: 'radial-gradient(ellipse 80% 50% at 50% 40%, black, transparent)'
                }}
            ></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-2/3 bg-primary/20 rounded-full blur-[120px] -z-10"></div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-foreground/80 to-foreground">
                A Afinação de ECU do Futuro, Hoje.
            </h1>
            <p className="max-w-2xl mx-auto mb-8 text-md md:text-lg text-muted-foreground">
                Potencie o seu motor com a nossa plataforma de afinação assistida por Inteligência Artificial. Precisão, velocidade e performance na ponta dos seus dedos.
            </p>
            <div className="flex gap-4">
                <Button asChild size="lg" className="group">
                    <Link href="/tuner">
                        Aceder ao Assistente <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                    <Link href="#features">
                        Saber Mais
                    </Link>
                </Button>
            </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 md:py-32 px-4 md:px-6">
          <div className="container mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Funcionalidades Principais</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 overflow-hidden group">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <Wand2 className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Ajuste Assistido por IA</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Carregue os seus logs de ensaio e deixe a nossa IA calcular as correções ótimas para o seu mapa de combustível com base no seu Lambda Alvo.
                  </p>
                   <Image
                        src={placeholderImages.feature1.src}
                        alt="AI Tuning Feature"
                        width={600}
                        height={400}
                        data-ai-hint={placeholderImages.feature1['data-ai-hint']}
                        className="mt-4 rounded-lg group-hover:scale-105 transition-transform duration-300"
                    />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 overflow-hidden group">
                <CardHeader>
                  <div className="flex items-center gap-4">
                     <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <Cpu className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Análise de Mapas Avançada</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Visualize os seus mapas de ECU em tabelas interativas, gráficos 2D e superfícies 3D. Edite células em massa e salve as suas modificações com precisão.
                  </p>
                   <Image
                        src={placeholderImages.feature2.src}
                        alt="Advanced Map Analysis Feature"
                        width={600}
                        height={400}
                        data-ai-hint={placeholderImages.feature2['data-ai-hint']}
                        className="mt-4 rounded-lg group-hover:scale-105 transition-transform duration-300"
                    />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 overflow-hidden group">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <BrainCircuit className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Análise de Ignição</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Compare ensaios com diferentes avanços de ignição para encontrar o ponto de binário máximo (MBT) e otimizar a performance do seu motor.
                  </p>
                   <Image
                        src={placeholderImages.feature3.src}
                        alt="Ignition Timing Analysis Feature"
                        width={600}
                        height={400}
                        data-ai-hint={placeholderImages.feature3['data-ai-hint']}
                        className="mt-4 rounded-lg group-hover:scale-105 transition-transform duration-300"
                    />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 md:py-32 px-4 md:px-6 bg-primary/5">
            <div className="container mx-auto text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para Desbloquear a Performance Máxima?</h2>
                <p className="max-w-2xl mx-auto mb-8 text-muted-foreground">
                    Chega de adivinhações. Comece a usar o TuneAssist AI hoje e sinta a diferença que a afinação de precisão pode fazer.
                </p>
                <Button asChild size="lg" className="group">
                    <Link href="/tuner">
                        Começar a Afinar Agora <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                </Button>
            </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border/20">
        <div className="container mx-auto flex justify-between items-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} TuneAssist AI. Todos os direitos reservados.</p>
           <div className="flex items-center gap-4">
                <Link href="#" className="hover:text-primary transition-colors">Termos de Serviço</Link>
                <Link href="#" className="hover:text-primary transition-colors">Política de Privacidade</Link>
            </div>
        </div>
      </footer>
    </div>
  );
}
