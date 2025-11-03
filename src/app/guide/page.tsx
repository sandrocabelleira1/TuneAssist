'use client';

import Header from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Binary, BrainCircuit, ClipboardList, Cpu, Download, Eraser, FileCog, Flame, HardDriveDownload, LineChart, Play, Plus, Save, Search, Settings2, Star, Table2, Trash2, UploadCloud, Wand2, X, BarChart3 } from 'lucide-react';
import Link from 'next/link';

const SectionTitle = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <div className="flex items-start gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-primary/10 flex-shrink-0">
            {icon}
        </div>
        <div>
            <h3 className="text-xl font-bold">{title}</h3>
            <p className="text-muted-foreground mt-1">{description}</p>
        </div>
    </div>
);

const FeatureDetail = ({ icon, name, action, note }: { icon: React.ReactNode, name: string, action: string, note?: string }) => (
    <div className="flex items-start gap-4 py-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-accent flex-shrink-0">
            {icon}
        </div>
        <div className="flex-1">
            <p className="font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">{action}</p>
            {note && <p className="text-xs text-amber-400/80 mt-1"><strong>Observação:</strong> {note}</p>}
        </div>
    </div>
);


export default function GuidePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header className="print:hidden" />
      <main className="flex-1 flex flex-col items-center py-12 px-4">
        <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 print-black-text">
                Manual de Utilizador do TuneAssist AI
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
                Um guia completo para todas as funcionalidades, botões e ações disponíveis na ferramenta.
            </p>
            <Button onClick={() => window.print()} className="mt-6 print:hidden">
              <Download className="mr-2 h-4 w-4" />
              Descarregar Manual (PDF)
            </Button>
        </div>

        <div className="mt-16 w-full max-w-5xl">
            <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
                {/* Painel de Controlo */}
                <AccordionItem value="item-1">
                    <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                        <Cpu className="mr-4 text-primary" /> Painel de Controlo
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                        <Card>
                            <CardHeader>
                                <SectionTitle
                                    icon={<UploadCloud size={24} className="text-primary"/>}
                                    title="Gestão de Ficheiros e Mapas"
                                    description="O ponto de partida. Carregue os seus ficheiros e selecione os mapas que deseja modificar."
                                />
                            </CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<Binary/>} name="Carregar .BIN" action="Abre uma janela para selecionar o ficheiro .BIN original da sua ECU. Este é o ficheiro que será lido e, posteriormente, modificado." note="Carregar um novo .BIN irá limpar todos os dados de mapas e logs carregados anteriormente."/>
                                <FeatureDetail icon={<FileCog/>} name="Carregar .XDF" action="Abre uma janela para selecionar o ficheiro de definição .XDF. Este ficheiro funciona como um 'mapa' que diz ao software como ler e interpretar os dados do ficheiro .BIN." note="Carregar um novo .XDF irá limpar a seleção de mapas atual."/>
                                <FeatureDetail icon={<Search/>} name="Seleção de Mapa" action="Após carregar os ficheiros, clique aqui para abrir uma lista de todos os mapas disponíveis no .XDF. Pode selecionar um ou mais mapas para trabalhar."/>
                                <FeatureDetail icon={<X className="h-3 w-3"/>} name="Badge de Mapa Ativo" action="Os mapas selecionados aparecem como 'badges'. Clique num badge para o tornar o mapa ativo (visualizado nas tabelas e gráficos). Clique no 'X' para o remover da seleção."/>
                            </CardContent>
                        </Card>
                         <Card className="mt-4">
                            <CardHeader>
                                <SectionTitle
                                    icon={<BrainCircuit size={24} className="text-primary"/>}
                                    title="Ações Principais e Logs"
                                    description="As ações finais do seu fluxo de trabalho e a monitorização de todas as operações."
                                />
                            </CardHeader>
                             <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<Save/>} name="Salvar .BIN Modificado" action="Gera e inicia o download de um novo ficheiro .BIN contendo todas as modificações feitas nos mapas selecionados." note="Esta ação é desativada se nenhuma modificação tiver sido feita."/>
                                <FeatureDetail icon={<HardDriveDownload/>} name="Salvar Backup na Nuvem" action="Guarda a versão atual do seu .BIN modificado na sua conta Firebase, permitindo-lhe restaurar o seu trabalho mais tarde." note="Requer que esteja autenticado."/>
                                <FeatureDetail icon={<Trash2/>} name="Resetar Tudo" action="Limpa completamente o estado da aplicação, removendo todos os ficheiros carregados, seleções de mapas, logs e modificações. Use com cuidado."/>
                                <FeatureDetail icon={<Download/>} name="Descarregar Log de Processamento" action="Faz o download de um ficheiro de texto (.txt) com o histórico de todas as ações, erros e sucessos registados na janela de 'Log de Processamento'."/>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

                 {/* Visualização e Edição de Mapas */}
                <AccordionItem value="item-2">
                    <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                        <Table2 className="mr-4 text-primary" /> Visualização e Edição
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                       <Card>
                            <CardHeader><CardTitle>Abas de Visualização</CardTitle></CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<Table2/>} name="Tabela de Dados" action="Apresenta o mapa ativo numa grelha 2D. Pode editar cada célula individualmente ou selecionar múltiplas células para edição em massa."/>
                                <FeatureDetail icon={<BarChart3/>} name="Gráfico 3D" action="Mostra uma superfície 3D interativa do mapa ativo, permitindo uma análise visual da forma e transições do mapa."/>
                                <FeatureDetail icon={<LineChart/>} name="Gráfico 2D" action="Exibe um gráfico de linhas 2D. Pode selecionar uma linha de um eixo para ver os seus valores plotados no gráfico. Permite edição de pontos diretamente no gráfico."/>
                            </CardContent>
                        </Card>
                         <Card className="mt-4">
                            <CardHeader><CardTitle>Edição na Tabela de Dados</CardTitle></CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<Plus/>} name="Edição em Massa" action="Clique e arraste para selecionar múltiplas células. Uma janela de 'Edição em Massa' aparecerá, permitindo adicionar/subtrair uma percentagem, definir um valor fixo ou interpolar os valores entre os cantos da seleção."/>
                                <FeatureDetail icon={<Eraser/>} name="Reverter para Original" action="Na janela de 'Edição em Massa', a opção 'Bin Original' reverte os valores das células selecionadas para o estado original do ficheiro .BIN carregado."/>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

                 {/* Análise de Combustível */}
                <AccordionItem value="item-3">
                    <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                        <ClipboardList className="mr-4 text-primary" /> Análise de Combustível
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                        <Card>
                            <CardHeader><CardTitle>Ajuste por Lambda</CardTitle></CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<UploadCloud/>} name="Carregar Log de Ensaio (.csv)" action="Carregue o seu ficheiro de log de dinamómetro. O sistema irá procurar automaticamente as colunas de RPM e Lambda/Sonda."/>
                                <FeatureDetail icon={<Settings2/>} name="Condição de Carga do Log" action="Indique ao sistema como interpretar a carga durante o ensaio. Pode selecionar uma coluna de carga do seu log (ex: TPS, MAP) ou, se o ensaio foi feito numa carga fixa, pode selecionar o valor de carga correspondente do eixo do seu mapa."/>
                                <FeatureDetail icon={<Flame/>} name="Lambda Alvo" action="Defina o valor de Lambda que deseja atingir. Ex: 0.85."/>
                                <FeatureDetail icon={<Wand2/>} name="Ajustar Mapa(s)" action="Com base no log, condição de carga e Lambda Alvo, a IA irá calcular e aplicar as correções necessárias a todos os mapas selecionados. As células modificadas pela IA serão destacadas na tabela."/>
                                <FeatureDetail icon={<Plus/>} name="Entrada Manual de Tabela" action="Se não tiver um ficheiro .csv, pode adicionar pontos de RPM e Lambda manualmente numa tabela para usar na análise."/>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

                 {/* Análise de Ignição */}
                <AccordionItem value="item-4">
                    <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                        <Flame className="mr-4 text-primary" /> Análise de Ignição
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                         <Card>
                            <CardHeader><CardTitle>Busca pelo MBT (Maximum Brake Torque)</CardTitle></CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<UploadCloud/>} name="Carregar Ensaio de Base" action="Carregue o log do seu ensaio inicial. Se o log não tiver uma coluna de avanço, pode pré-carregar os valores do mapa de ignição ativo."/>
                                <FeatureDetail icon={<UploadCloud/>} name="Carregar Ensaio Modificado" action="Após alterar o avanço (ex: adicionar 2 graus) e fazer um novo ensaio, carregue o novo log aqui."/>
                                <FeatureDetail icon={<Wand2/>} name="Otimizar Mapa" action="A IA compara os dois ensaios, analisa o ganho/perda de torque (ou tempo) em cada faixa de RPM e aplica pequenas correções (ex: +0.5 ou -0.5 graus) ao seu mapa de ignição para se aproximar do MBT de forma segura."/>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

                {/* Substituição Manual */}
                <AccordionItem value="item-5">
                    <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                        <Settings2 className="mr-4 text-primary" /> Substituição Manual
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                         <Card>
                             <CardHeader>
                                <CardTitle>Controlo Avançado</CardTitle>
                                <CardDescription>Esta secção permite substituir as configurações lidas do ficheiro XDF. Útil para depuração ou para trabalhar com ficheiros XDF incorretos.</CardDescription>
                            </CardHeader>
                            <CardContent className="divide-y divide-border">
                                <FeatureDetail icon={<Settings2/>} name="Equações e Passos (Stride)" action="Pode alterar as equações matemáticas (ex: 'x * 0.1') ou os 'strides' (o número de bytes entre cada valor) para os eixos X, Y e para os dados do mapa (Z)."/>
                                <FeatureDetail icon={<Play/>} name="Aplicar e Recalcular" action="Aplica as suas substituições manuais e força o software a reler e recalcular o mapa ativo com base nas novas configurações."/>
                                <FeatureDetail icon={<Star/>} name="Usar como Padrão" action="Guarda a configuração manual atual como um padrão para todos os mapas que tenham a mesma dimensão (ex: 16x20). Isto é útil se vários mapas no seu .XDF partilharem a mesma estrutura de leitura incorreta."/>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

            </Accordion>
        </div>
        
        <div className="mt-16 print:hidden">
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
