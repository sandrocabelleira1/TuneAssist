
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Header from '@/components/header';
import { UploadCloud, Table2, Wand2, Flame, Edit, Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import placeholderImages from '@/app/lib/placeholder-images.json';

const steps = [
  {
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
    title: 'Passo 1: Carregar Ficheiros',
    description: 'Comece por carregar os ficheiros essenciais no Painel de Controlo. O ficheiro .BIN contém os dados originais da sua ECU. O ficheiro .XDF é o "mapa" que nos diz como ler o .BIN. Ambos são necessários para começar.',
    image: placeholderImages.feature2,
  },
  {
    icon: <Table2 className="h-8 w-8 text-primary" />,
    title: 'Passo 2: Selecionar e Visualizar',
    description: 'Use o menu "Seleção de Mapa" para escolher os mapas que deseja analisar. Pode selecionar vários. Os mapas ativos são mostrados como badges. Clique num badge para tornar esse mapa ativo e visualize os seus dados na Tabela de Dados, Gráfico 3D ou Gráfico 2D.',
    image: placeholderImages.feature3,
  },
  {
    icon: <Wand2 className="h-8 w-8 text-primary" />,
    title: 'Passo 3: Análise de Combustível (Ajuste por Lambda)',
    description: 'Vá para a aba "Análise de Combustível". Carregue um ficheiro de log (.csv) do seu ensaio em dinamómetro, defina o seu Lambda Alvo e a agressividade. A IA irá calcular e aplicar as correções necessárias para atingir o seu alvo, destacando as células alteradas na tabela.',
    image: placeholderImages.feature1,
  },
  {
    icon: <Flame className="h-8 w-8 text-primary" />,
    title: 'Passo 4: Análise de Ignição (Busca pelo MBT)',
    description: 'Na aba "Análise de Ignição", carregue dois logs: um do seu ensaio "Base" e outro de um ensaio "Modificado" (com mais avanço). A ferramenta irá comparar os dois, mostrar o ganho/perda de torque e permitir que a IA otimize o mapa com pequenos incrementos para encontrar o ponto de ignição ideal (MBT) de forma segura.',
    image: { src: "https://firebasestorage.googleapis.com/v0/b/tuneassist-ai-3-32994972-ce581.firebasestorage.app/o/Captura%20de%20tela%202025-10-27%20170044.png?alt=media&token=e91c781d-f8d2-430c-99d8-967f6c382f7a", "data-ai-hint": "ignition analysis" }
  },
  {
    icon: <Edit className="h-8 w-8 text-primary" />,
    title: 'Passo 5: Edição Manual e Ajustes Finos',
    description: 'Para um controlo total, pode editar qualquer valor diretamente na "Tabela de Dados". Também pode selecionar múltiplas células para fazer edições em massa (adicionar/subtrair percentagem, definir valor fixo ou interpolar). Se a leitura do mapa estiver incorreta, use as opções de "Substituir Manualmente" para corrigir as equações ou strides.',
     image: { src: "https://firebasestorage.googleapis.com/v0/b/tuneassist-ai-3-32994972-ce581.firebasestorage.app/o/Captura%20de%20tela%202025-10-27%20170425.png?alt=media&token=c1995e86-353d-4c33-87a3-e29124430c44", "data-ai-hint": "manual editing" }
  },
  {
    icon: <Save className="h-8 w-8 text-primary" />,
    title: 'Passo 6: Salvar e Exportar',
    description: 'Quando estiver satisfeito com as suas modificações, clique no botão "Salvar .BIN Modificado" no Painel de Controlo. Isto irá iniciar o processo de pagamento e, após a conclusão, o download do seu novo ficheiro .BIN, pronto para ser escrito na ECU, começará automaticamente.',
    image: placeholderImages.feature4,
  }
];

export default function GuidePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center py-12 px-4">
        <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
                Guia de Funcionamento
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
                Aprenda a utilizar todas as funcionalidades do TuneAssist AI, desde o básico até às análises mais avançadas, para extrair a máxima performance da sua ECU.
            </p>
        </div>

        <div className="mt-16 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8">
            {steps.map((step) => (
                <Card key={step.title} className="flex flex-col bg-accent/50 hover:border-primary/50 hover:shadow-primary/10 transition-all group">
                    <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                        <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-primary/10 flex-shrink-0">
                            {step.icon}
                        </div>
                        <div>
                            <CardTitle className="text-xl">{step.title}</CardTitle>
                             <CardDescription className="mt-2">{step.description}</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 mt-4">
                       <div className="aspect-video overflow-hidden rounded-md border border-border/20">
                         <Image
                            src={step.image.src}
                            alt={step.title}
                            width={600}
                            height={400}
                            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                            {...step.image['data-ai-hint'] && { 'data-ai-hint': step.image['data-ai-hint'] }}
                        />
                      </div>
                    </CardContent>
                </Card>
            ))}
        </div>
        
        <div className="mt-16">
            <Button asChild size="lg" className="group">
                <Link href="/tuner">
                    <ArrowLeft className="mr-2 h-5 w-5 transition-transform group-hover:-translate-x-1" />
                    Voltar para a Ferramenta
                </Link>
            </Button>
        </div>

      </main>
    </div>
  );
}
