# Manual do Backoffice — SIGEC-ELOS

**Para quem é este manual:** a equipe da EQPI que opera a plataforma — analistas de documentos, atendimento, financeiro e gestão de clientes.

> As telas deste manual mostram empresas e pessoas **fictícias** (Mineradora Exemplo, Construtora Modelo, etc.). Nas telas que listam dados de toda a plataforma, as linhas que não são do exemplo aparecem borradas.

---

## Sumário

1. [Regras que valem para tudo](#1-regras-que-valem-para-tudo)
2. [Início e Farol de Análise](#2-início-e-farol-de-análise)
3. [Análise de Documentos (a fila)](#3-análise-de-documentos-a-fila)
4. [Ficha do processo](#4-ficha-do-processo)
5. [Automação: coleta nas fontes oficiais e pré-análise por IA](#5-automação-coleta-nas-fontes-oficiais-e-pré-análise-por-ia)
6. [Decisão de homologação](#6-decisão-de-homologação)
7. [Processos](#7-processos)
8. [Homologados](#8-homologados)
9. [Convites](#9-convites)
10. [Questionários](#10-questionários)
11. [Financeiro](#11-financeiro)
12. [Relatórios, BC Report e Comunicados](#12-relatórios-bc-report-e-comunicados)
13. [Clientes: cadastro, fluxos, portais e termos](#13-clientes-cadastro-fluxos-portais-e-termos)
14. [Usuários e perfis de acesso](#14-usuários-e-perfis-de-acesso)
15. [Configurações gerais](#15-configurações-gerais)
16. [Dúvidas frequentes](#16-dúvidas-frequentes)

---

## 1. Regras que valem para tudo

**Processos do HOC x processos do ELOS.** Enquanto o HOC estiver em operação, os clientes migrados continuam sendo espelhados todas as noites do HOC para o ELOS:

- Tudo o que vem do HOC (clientes, processos, documentos e convites marcados **HOC**) é **mantido pelo HOC**. Uma alteração feita no ELOS nesses registros é **sobrescrita** na sincronização da madrugada. Corrija no HOC.
- A **automação** (coleta nas fontes oficiais, pré-análise por IA e renovação automática) roda **apenas em processos originados no ELOS**.
- Convites do HOC são **histórico**: o ELOS não manda lembretes nem reenvia — o HOC cuida disso.

**Trava de pagamento.** O fornecedor só usa a plataforma depois do pagamento confirmado (cartão ou PIX na hora; boleto após a compensação). Convites **subsidiados** entram liberados. Um processo sem pagamento não pode ser homologado — a tela mostra **Aguardando pagamento**.

**Dados pessoais (LGPD).** O CPF de sócios aparece sempre mascarado. Os contatos de fornecedores são abertos para clientes, para a equipe EQPI, para fornecedores com selo vigente e para compradores Pro; compradores Free veem mascarado.

**Prazo de análise.** O padrão é de **3 dias úteis** contados do envio, considerando os feriados cadastrados (veja [Feriados](#15-configurações-gerais)). Só entram na fila os fornecedores que já completaram a parte deles: documentos enviados, questionário respondido e pagamento confirmado.

---

## 2. Início e Farol de Análise

A tela **Início** traz os indicadores gerais e o **Farol de Análise**: quantos documentos estão com a data limite ultrapassada, no limite hoje ou com prazo futuro, e a lista dos que pedem atenção.

![Início](img/backoffice/01-inicio.jpg)

---

## 3. Análise de Documentos (a fila)

Menu **Análise → Análise de Docs**. É a bancada principal: a fila de documentos de **todos** os fornecedores, para trabalhar documento por documento.

![Análise de documentos](img/backoffice/02-analise-documentos.jpg)

**Filtros** (ficam salvos enquanto a aba estiver aberta):

- **Tipo de documento** e **Fornecedor** (nome ou CNPJ, inclusive CNPJ com letras);
- **Cliente** (ou **ELOS** — processo próprio, sem cliente);
- **Limite de análise:** fila completa, data limite ultrapassada, hoje, futura — ou "fora da fila também";
- **Prioridade:** só os que o cliente pediu para priorizar (**⚡ Prioritária**);
- **Status** do documento;
- **Sugestão** da automação: fonte oficial (Rota A), IA (Rota B), sugere aprovar, sugere reprovar, revisar, sem sugestão;
- **Vencimento até** e **ordenação**.

**Exportar página** / **Exportar tudo** geram planilha com a data limite de cada análise.

### Analisar um documento

Na linha do documento:

- **👁** abre o arquivo; **🕓** mostra o histórico.
- **✓/✕ Aceitar sugestão** abre a decisão já preenchida com a sugestão da automação.
- **✏️ Editar** abre a janela completa:

![Editar documento](img/backoffice/03-editar-documento.jpg)

Na janela **Editar Documento**:

- **Sugestão** da fonte oficial ou da IA, com o motivo — aceitar com um clique ou decidir diferente.
- **Como validar este documento** — a regra do catálogo para aquele tipo.
- **Substituir documento** — quando a própria equipe obteve a versão nova; o documento fica aprovado.
- **Data de vencimento** — o botão **análise + 1 ano** preenche o padrão; a validade sugerida pela fonte aparece quando existe.
- **Status:** Aprovado, Reprovado (motivo obrigatório, com busca nos motivos padrão), Não se aplica, ou **Voltar para análise** (reverter uma decisão, com motivo).
- Reprovar documento de um fornecedor **já homologado** pede confirmação, porque **suspende** a homologação vigente.

Ao reprovar, o vencimento é preenchido com a **nova checagem em 4 meses**.

**Casos especiais:**

- **Análise de CNAEs** abre antes a validação dos vínculos entre as atividades e as categorias.
- **Comprovante bancário e DRE/balanço:** o botão 🤖 extrai os dados com IA (banco, agência, conta; receita, ativo…) para revisar e salvar.

---

## 4. Ficha do processo

Abra pelo nome do fornecedor (ou em **Processos**). A ficha reúne:

- Faixas de alerta: **análise prioritária** pedida pelo cliente (com a observação) e **sanções** ativas;
- **Inteligência CNPJ** (Receita + Portal da Transparência), quadro societário e sanções registradas manualmente (**+ Nova Sanção**);
- **Categorias de atuação** e **Análise Assertiva** (relatório de crédito — consulta paga, só para processo liberado);
- Abas **Documentos**, **Questionário**, **Dados Bancários**, **DRE / Financeiro**, **Log do Processo** e **Convites**;
- **Arquivar cadastro** (com motivo) / **Desarquivar**.

![Ficha do processo](img/backoffice/05-ficha-processo.jpg)

Na aba **Documentos**, escolha o **Processo** (cliente) no seletor para ver só o que aquele fluxo exige. Ações: **Aprovar**, **Rejeitar** / **Revogar**, **Reverter decisão**, **Ver**, histórico.

O **Log do Processo** registra tudo: análise iniciada, aprovações e reprovações (inclusive automáticas), reversões, substituições, mudanças de vencimento, reaberturas por reenvio.

---

## 5. Automação: coleta nas fontes oficiais e pré-análise por IA

Ambas rodam **só em processos de origem ELOS, liberados** (pagos ou subsidiados), e **nada é aprovado sozinho** — a decisão é sempre do analista.

### Coleta nas fontes oficiais (Rota A)

Assim que o processo é liberado, a plataforma busca nas fontes oficiais os documentos públicos que o fluxo exige: Cartão CNPJ, Simples Nacional, Sintegra, CND Federal, FGTS, CNDT, CND estadual e municipal, Dívida Ativa, Lista Suja, falência, IBAMA e alvará da Polícia Federal. O documento entra **Em análise** com o comprovante e uma **sugestão** (aprovar, reprovar ou revisar).

Na ficha, o painel **Coleta automática nas fontes oficiais** mostra, por documento, a fonte consultada, a situação (obtido, com o fornecedor, nova tentativa, na fila), o resultado, as tentativas e o custo.

![Coleta automática](img/backoffice/06-ficha-coleta-automatica.jpg)

Quando a fonte não emite (pendência do fornecedor, praça sem serviço), o documento volta para o fornecedor enviar.

**Renovação automática:** documento obtido na fonte oficial que vence em até 7 dias é consultado de novo e volta para a fila com a nova sugestão.

### Pré-análise por IA (Rota B)

Para documentos **enviados pelo fornecedor**, a IA lê o arquivo e sugere aprovar, reprovar ou revisar, com a confiança e o checklist conferido (titularidade, validade, regra do documento). O painel **Pré-análise por IA** mostra as análises, a concordância do analista e o custo. Há um **teto diário de gasto**. Em cada documento, **Pré-analisar com IA** ou **↻ reanalisar** pede uma nova leitura.

---

## 6. Decisão de homologação

No painel **Decisão de Homologação** da ficha:

- **Documentação completa** ou a contagem de pendentes;
- o selo que será emitido (ELOS Verificado ou Homologado — nome do cliente);
- **Cartas de exceção** enviadas pelo cliente;
- **Aprovar Homologação**, **Rejeitar** ou **Solicitar Documentos** (e-mail ao fornecedor com o que falta).

**Finalização automática:** quando o **último documento** do processo é analisado, o processo fecha sozinho:

- tudo aprovado → selo **Ativo** e e-mail de homologação com o certificado;
- algum reprovado → processo **Reprovado** e e-mail com as pendências. Quando o fornecedor reenvia, o processo reabre.

Selo já emitido: **Reverter Análise** devolve o processo para a fila e revoga o selo.

---

## 7. Processos

Menu **Análise → Processos**: busca geral de fornecedores por CNPJ ou razão social, com filtro de **cliente** (ou ELOS) e de **situação**: Prioritários, Homologado, Em análise, Aguardando pagamento, Suspenso, Reprovado, Cadastro (sem processo) e Convidado (sem cadastro). **Mostrar inativos e arquivados** inclui os arquivados.

![Processos](img/backoffice/04-processos.jpg)

---

## 8. Homologados

Menu **Análise → Homologados**: fornecedores com selo, com contadores de ativos, suspensos e reprovados. **Ver Ficha**, **Inativar** (o selo é suspenso e o fornecedor sai do marketplace; motivo obrigatório) e **Reativar**.

![Homologados](img/backoffice/07-homologados.jpg)

---

## 9. Convites

Menu **Análise → Convites**: todos os convites da plataforma, com filtros de status, origem (ELOS ou histórico do HOC) e cliente. **Detalhes** mostra quem enviou, quando foi visualizado, os lembretes e a mensagem. **Copiar link**, **Reenviar**, **Cancelar** e **Ver processo**.

![Convites](img/backoffice/08-convites.jpg)

---

## 10. Questionários

Menu **Análise → Questionários**: crie e mantenha os questionários dos clientes. **+ Novo Questionário** (cliente, título, descrição), depois **+ Adicionar Pergunta** com o tipo (Sim/Não, texto, opções) e se é obrigatória.

**Alerta de compliance:** em cada pergunta, defina a resposta que acende um alerta (por exemplo, "dispara quando responder SIM"). Os alertas aparecem para o cliente no menu Compliance.

![Questionários](img/backoffice/09-questionarios.jpg)

---

## 11. Financeiro

Menu **Financeiro**:

- **Visão Geral** — assinaturas, receita recorrente, homologações subsidiadas, selos por status;
- **Assinaturas** — pagamentos do Stripe, renovações, repasse previsto e nota fiscal;
- **Subsidiados** — homologações pagas pelos clientes, para faturar (filtro por cliente e período, exportação para o financeiro);
- **Custos BC**, **Custos Captura** (coleta nas fontes oficiais: custo do mês, por fonte e por cliente) e **Custos IA** (pré-análise: custo do mês, gasto do dia, concordância do analista) — visíveis para quem tem a permissão de custos.

![Financeiro](img/backoffice/10-financeiro.jpg)

![Custos de captura](img/backoffice/11-custos-captura.jpg)

---

## 12. Relatórios, BC Report e Comunicados

- **Relatórios** — painel executivo e funil da campanha de primeiro acesso dos migrados.
- **BC Report** — emissão do relatório de background check (Light ou Full) por CNPJ; consome créditos e exige permissão.
- **Comunicados** — banners exibidos na tela de login (novidades, manutenção, feriados), com período de exibição.

---

## 13. Clientes: cadastro, fluxos, portais e termos

**Lista de Clientes** — todos os clientes, com o preço da homologação e quem paga (subsidiado ou fornecedor). **Editar** e **Convidar fornecedor**.

![Lista de clientes](img/backoffice/13-clientes.jpg)

**Novo Cliente** — assistente em 4 etapas: empresa (com consulta do CNPJ), precificação, portal de fornecedores e revisão. No fim, mostra o acesso do usuário master.

**Fluxo de Homologação** — por cliente:

- **Fluxos de categorias:** os pacotes (níveis) de homologação, cada um com o preço **não subsidiado** e **subsidiado** e as categorias que inclui; um fluxo é o **padrão**;
- **Matriz de documentos:** os documentos exigidos por categoria, e quais são **desclassificatórios** (suspendem o selo se vencidos);
- **Mobilização:** postos de trabalho e documentos por pessoa e por posto.

![Fluxos](img/backoffice/14-fluxos.jpg)

> Para clientes do HOC, matrizes e categorias vêm do HOC — altere lá.

**Portais White-label** — a página de cadastro com a marca do cliente (mesmo editor que o cliente usa).

![Portais](img/backoffice/15-portais.jpg)

**Termos de Aceite** — os documentos que o fornecedor aceita no cadastro, por cliente.

---

## 14. Usuários e perfis de acesso

**Lista de Usuários** — busca por nome, e-mail ou CNPJ e filtros por papel. Ações: **Editar**, **Reset Senha**, **Reset MFA** (para quem perdeu o celular da verificação em duas etapas), **Bloquear** / **Desbloquear**.

![Usuários](img/backoffice/16-usuarios.jpg)

**Novo Usuário** — crie comprador, cliente, fornecedor ou backoffice, escolhendo o **perfil de acesso**. A senha gerada é mostrada uma vez e enviada por e-mail.

**Perfis de Usuário** — defina, para clientes, fornecedores, compradores e backoffice, quais **módulos** (menus) e **ações** cada perfil libera. Usuário sem perfil, ou com perfil sem ações marcadas, tem acesso total.

![Perfis](img/backoffice/17-perfis.jpg)

---

## 15. Configurações gerais

- **Preços ELOS** — os valores dos planos ELOS Verificado e ELOS Homologado (precisam coincidir com os preços cadastrados no Stripe).
- **Feriados** — datas que ajustam os prazos de análise.
- **Catálogo de Docs** — os tipos de documento, a responsabilidade (fornecedor ou cliente), o prazo de análise e a **regra de validação** que aparece para o analista.

![Catálogo de documentos](img/backoffice/18-catalogo.jpg)

---

## 16. Dúvidas frequentes

**Corrigi um dado de um fornecedor do HOC e voltou ao valor antigo.**
Registros do HOC são sobrescritos pela sincronização da madrugada. Corrija no HOC.

**Um processo não aparece na fila.**
Só entram na fila os fornecedores que completaram a parte deles (documentos, questionário e pagamento). Use o limite de análise **— Fora da fila também —** para ver todos.

**Aprovei o último documento e o processo não foi homologado.**
Verifique se há documento reprovado ou de mobilização pendente — o aviso depois de salvar diz o que falta. Processo sem pagamento confirmado também não pode ser homologado.

**Um fornecedor perdeu o celular da verificação em duas etapas.**
Em **Usuários**, use **Reset MFA**.

**A sugestão da automação está errada.**
Decida diferente: a sugestão nunca aprova sozinha. Discordâncias ficam registradas e aparecem em Custos IA (concordância do analista).
