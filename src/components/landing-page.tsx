
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Header from '@/components/header';
import { ArrowRight, Cpu, BarChart3, Wand2, FolderClock, UploadCloud, Edit, Save, Flame, ClipboardList } from 'lucide-react';
import Image from 'next/image';
import placeholderImages from '@/app/lib/placeholder-images.json';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const features = [
  {
    icon: <ClipboardList className="h-8 w-8 text-primary" />,
    title: 'Análise de Combustível por Lambda',
    description: 'Carregue um log do dinamómetro, defina o seu Lambda Alvo e deixe a IA calcular e aplicar as correções de combustível com precisão cirúrgicca, otimizando a mistura em minutos, não em horas.',
    image: placeholderImages.feature1,
  },
  {
    icon: <Flame className="h-8 w-8 text-primary" />,
    title: 'Busca pelo Avanço de Ignição Ideal (MBT)',
    description: 'Compare logs de ensaios com diferentes avanços. A ferramenta analisa o ganho de torque e sugere ou aplica incrementos seguros para encontrar o ponto de ignição perfeito (MBT), extraindo a máxima potência.',
    image: placeholderImages['ignition-analysis'],
  },
  {
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
    title: 'Visualização e Edição Intuitiva',
    description: 'Navegue pelos mapas com tabelas de dados, gráficos 2D e superfícies 3D interativas. Selecione e edite células em massa, adicione percentagens ou interpole valores com facilidade.',
    image: placeholderImages.feature3,
  },
  {
    icon: <FolderClock className="h-8 w-8 text-primary" />,
    title: 'Backups Seguros e Foco na Eficiência',
    description: 'Guarde os seus ficheiros modificados em segurança na nuvem com um clique. A nossa ferramenta foi desenhada para acelerar o seu fluxo de trabalho, permitindo-lhe focar-se no que realmente importa: a performance.',
    image: placeholderImages.feature4,
  },
];

const howItWorksSteps = [
    {
        icon: <UploadCloud className="w-10 h-10 mb-4 text-primary" />,
        title: "1. Carregue os Ficheiros",
        description: "Faça o upload do .BIN original da ECU e do ficheiro de definição .XDF."
    },
    {
        icon: <Wand2 className="w-10 h-10 mb-4 text-primary" />,
        title: "2. Analise e Otimize",
        description: "Use a IA para analisar logs de combustível e ignição ou faça edições manuais."
    },
    {
        icon: <Save className="w-10 h-10 mb-4 text-primary" />,
        title: "3. Salve e Programe",
        description: "Guarde o .BIN modificado, pague e descarregue-o, pronto para a ECU."
    }
]

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="text-center pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="container px-4">
             <div className="mb-6 inline-block">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
                    A Ferramenta Definitiva para Preparadores de ECU
                </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
              Remapeamento Inteligente. <br/> Performance Incomparável.
            </h1>
            <p className="max-w-2xl mx-auto mt-6 text-lg text-muted-foreground">
              Poupe tempo, maximize a potência e otimize cada mapa com a precisão da inteligência artificial. O TuneAssist AI é o seu novo parceiro de negócios na reprogramação de ECUs.
            </p>
            <div className="mt-10">
              <Button asChild size="lg" className="group transition-shadow duration-300 neon-glow">
                <Link href="/tuner">
                  Começar a Otimizar Agora <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* How it works Section */}
        <section className="py-20 sm:py-24 bg-accent/30">
            <div className="container mx-auto px-4">
                 <div className="max-w-2xl mx-auto text-center mb-16">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">O Seu Fluxo de Trabalho, Acelerado</h2>
                    <p className="mt-4 text-lg text-muted-foreground">
                        Em apenas três passos simples, você transforma dados brutos em performance otimizada.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                    {howItWorksSteps.map((step, index) => (
                        <div key={step.title} className="flex flex-col items-center">
                           {step.icon}
                           <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                           <p className="text-muted-foreground max-w-xs">{step.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>


        {/* Features Section */}
        <section id="features" className="py-20 sm:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Funcionalidades Desenhadas para o Profissional</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Desde a análise automática de logs à edição precisa, o TuneAssist AI foi construído para resolver os desafios do dia a dia do remapeador moderno.
              </p>
            </div>

            <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map((feature) => (
                <Card key={feature.title} className="bg-accent/50 hover:border-primary/50 hover:shadow-primary/10 transition-all group flex flex-col">
                    <CardHeader className="flex-shrink-0">
                        <div className="flex items-start gap-4">
                            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 flex-shrink-0">
                                {feature.icon}
                            </div>
                            <div>
                                <CardTitle className="text-xl">{feature.title}</CardTitle>
                                <CardDescription className="mt-2">{feature.description}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-end mt-4">
                       <div className="aspect-video overflow-hidden rounded-md border border-border/20">
                         <Image
                            src={feature.image.src}
                            alt={feature.title}
                            width={600}
                            height={400}
                            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                            data-ai-hint={feature.image['data-ai-hint']}
                        />
                      </div>
                    </CardContent>
                </Card>
              ))}
            </div>
             <div className="text-center mt-20">
                 <Button asChild size="lg" variant="outline">
                    <Link href="/guide">
                       Ver Guia de Funcionamento Completo <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t">
            <div className="container mx-auto text-center px-4">
                 <Image 
                    src="https://firebasestorage.googleapis.com/v0/b/tuneassist-ai-3-32994972-ce581.firebasestorage.app/o/logo%20tuneassit%20preto(1200%20x%20300%20px).png?alt=media&token=8a0f0693-d576-4532-98ce-4c9d791f03e8"
                    alt="TuneAssist AI Logo"
                    width={180}
                    height={45}
                    className="mx-auto mb-4"
                />
                <p className="text-muted-foreground">
                    O Futuro do Remapeamento de ECUs.
                </p>
            </div>
        </footer>
      </main>
    </div>
  );
}
