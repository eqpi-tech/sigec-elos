# Plano de Continuidade de Infraestrutura — ELOS

> Versão para circulação mantida como documento vivo (link distribuído pelo
> team lead). Este arquivo é a cópia de referência no repositório, seguindo a
> regra de sanitização do CLAUDE.md: sem nomes de clientes, credenciais ou
> identificadores de infraestrutura (esses vivem no runbook de DR).

## 1. Contexto

Pergunta respondida: *o HOC roda em ambiente AWS próprio; o ELOS depende de
terceiros (Supabase e Netlify) — ficamos na mão deles para sempre? Qual o
plano se precisarmos sair?*

Resposta em três linhas: o ELOS já roda em AWS (região São Paulo), com
terceiros operando a camada de gestão; os dados são soberanos — backup diário
completo em bucket S3 próprio da EQPI; e existem dois caminhos de saída
documentados, um deles sem mudar uma linha de código, porque a plataforma é
construída sobre software open source e Postgres padrão.

## 2. Arquitetura atual — quem opera o quê

| Camada | Tecnologia | Onde roda | Quem opera |
| --- | --- | --- | --- |
| Banco, Auth, Storage | Supabase (Postgres 15) | AWS sa-east-1 (São Paulo) | Supabase |
| Front-end (SPA) + CDN | Netlify | CDN global | Netlify |
| Funções de servidor (39, Node.js) | Netlify Functions | AWS Lambda (sob o Netlify) | Netlify |
| Código, CI/CD, rotinas | GitHub + Actions | GitHub | EQPI |
| Backups do banco | pg_dump diário | Bucket S3 da conta AWS da EQPI | EQPI |

A infraestrutura física é AWS de ponta a ponta; Supabase e Netlify são
operadores, não donos dos dados.

## 3. Soberania dos dados — garantido hoje

- Backup diário completo (`pg_dump`) para bucket S3 próprio — RPO 24h,
  retenção 30 dias (workflow `db-backup.yml`).
- O backup inclui usuários e credenciais (hashes de senha e fatores MFA no
  mesmo Postgres) — restauração preserva logins.
- Schema 100% versionado no repositório (patches SQL sequenciais).
- Todo o código no GitHub da EQPI.
- Arquivos em storage S3-compatível, sincronizáveis via API.
- Lacuna conhecida: arquivos do Storage ainda fora do backup diário (§9).

## 4. Por que não há prisão de plataforma

| Componente | Tecnologia por baixo | Portabilidade |
| --- | --- | --- |
| Banco | Postgres padrão | pg_dump/restore em qualquer Postgres |
| Autenticação | GoTrue (open source, dados no Postgres) | Migra com o banco |
| API de dados | PostgREST (open source) + SQL padrão | Migra com o banco |
| Storage | S3-compatível | Sincroniza para S3 próprio |
| Funções | Node.js puro (`exports.handler`) | Lambda ou container |
| Front-end | SPA estático | Qualquer CDN (S3+CloudFront) |

O Supabase é um produto open source auto-hospedável: contratá-lo é escolha de
hospedagem, não dependência de tecnologia fechada.

## 5. Saída — Caminho A: Supabase self-hosted na conta AWS própria

Zero mudança de código. Estimativa: 2 a 5 dias úteis.

1. EC2/EKS na conta da EQPI + Supabase self-hosted (Docker Compose/Helm).
2. Restore do último pg_dump (dados, usuários, policies).
3. Sincronizar Storage para S3 próprio.
4. Apontar variáveis de ambiente do front e das funções.
5. Trocar DNS.

Quando usar: exigência de compliance/conta própria ou descontinuação do
serviço gerenciado. Custo: a operação de banco/servidores passa a ser nossa.

## 6. Saída — Caminho B: AWS "nativo" (padrão HOC/SIGEC-WEB)

Estimativa: 3 a 6 semanas, com testes.

| Hoje | Vira | Esforço |
| --- | --- | --- |
| Postgres Supabase | Amazon RDS | Restore direto — baixo |
| Auth (GoTrue) | GoTrue em container ou Cognito | Container: baixo · Cognito: alto |
| PostgREST | Container | Baixo |
| Netlify Functions | Lambda + API Gateway | Médio |
| SPA + CDN | S3 + CloudFront | Baixo |
| Storage | S3 próprio | Baixo |

## 7. O que não temos fora da conta AWS corporativa

- VPC compartilhada com sistemas internos — mitigação: o sync HOC→ELOS já
  opera por sincronização diária segura, somente leitura, sem VPC.
- Governança centralizada (IAM corporativo, faturamento único) — mitigação:
  acessos restritos ao time, segredos fora do repo, auditoria na aplicação.
- Tuning fino de infra — na prática, os ganhos vêm de índice/consulta.

Em troca: operação 24×7 de banco, auth e CDN sem equipe dedicada de infra.

## 8. Riscos de terceiros e mitigações

| Risco | Prob. | Mitigação |
| --- | --- | --- |
| Aumento de preço | Média | Caminhos A/B prontos; custo de troca limitado |
| Indisponibilidade prolongada | Baixa | Backup próprio; restore testável em horas |
| Descontinuação do serviço | Baixa | Open source — auto-hospedagem independe do fornecedor |
| Mudança de termos/região | Baixa | Dados em São Paulo; migração de região é padrão Postgres |
| Perda de acesso à conta | Baixa | Credenciais segregadas; backup e código fora da conta |

Risco que NÃO temos: aprisionamento tecnológico.

## 9. Recomendações

- [ ] Teste de restauração do backup num Postgres vazio, com tempo medido
      (repetir trimestralmente) — a prova prática deste plano.
- [ ] Incluir arquivos do Storage no backup diário.
- [ ] Habilitar PITR no plano do Supabase (RPO de 24h → minutos).
- [ ] Revisar este plano a cada 12 meses ou mudança de fornecedor/contrato.
