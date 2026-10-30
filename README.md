# TuneAssist

Aplicação web para visualizar e editar mapas de ECU usando arquivos BIN e definições XDF. O projeto reúne edição de tabelas, gráficos 2D/3D, análise de logs CSV e backups por usuário.

## Objetivo e funcionamento

O usuário carrega um BIN e seu XDF, seleciona os mapas e compara os valores nas tabelas e gráficos. As alterações podem ser manuais, em massa ou calculadas a partir de logs e metas de lambda. A análise de ignição compara ensaios e torque. Os cálculos presentes no código são algoritmos locais; o nome do produto não implica que cada ajuste use um modelo generativo.

## Ferramentas utilizadas

Next.js, React, TypeScript, Tailwind CSS, componentes Radix UI, React Hook Form e Zod. Plotly e Recharts exibem gráficos; Papa Parse processa CSV. Firebase oferece autenticação, Firestore, Storage e App Hosting. Mercado Pago integra o checkout.

O código foi desenvolvido com Firebase Studio. A infraestrutura descrita usa Firebase/Google Cloud; este repositório não demonstra uma implantação em AWS.

## Desenvolvimento

Use Node.js compatível com as dependências do projeto.

```sh
npm ci
npm run dev
npm run typecheck
npm run test:security
npm run build
```

Configure as credenciais somente no ambiente de execução. Consulte [a migração de segurança](docs/security-deployment.md) antes de implantar: o fluxo de pagamento depende de credenciais do servidor, permissões e regras publicadas no Firebase.

## Recursos

- Leitura de BIN/XDF e seleção de mapas.
- Tabelas editáveis, interpolação e operações em massa.
- Visualização 2D e superfícies 3D.
- Importação de logs CSV e entrada manual de ensaios.
- Cálculos de correção de combustível e comparação de ignição.
- Backups na nuvem associados à conta.
- Checkout de licença e créditos, com confirmação no servidor nesta proposta de migração.

O projeto requer validação independente dos arquivos gerados e dos resultados dos cálculos antes de uso em uma ECU real. Licenciamento, conciliação e cobrança possuem limitações descritas na documentação de segurança.

