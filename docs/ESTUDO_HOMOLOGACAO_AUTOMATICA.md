# Estudo — homologação automática (matriz × Infosimples × IA)

> Base do estudo: matriz de documentos do cliente âncora (52 tipos de documento,
> 27 categorias, 6 fluxos), dados reais de produção de 25/09/2026, custos medidos
> da Infosimples no BC Report e tabela oficial de preços da API da Anthropic.
> Regra de sanitização do repositório: cliente referido como "cliente âncora".

## 1. Parecer

**A homologação quase 100% automática é viável, mas por dois caminhos diferentes,
e só um deles é "certeza":**

- **Metade do trabalho é determinística hoje.** 15 dos 52 tipos de documento são
  certidões e registros com fonte oficial consultável. Eles representam **54% das
  ocorrências na matriz** (Cartão CNPJ aparece em 25 categorias, Sintegra em 22).
  Aqui a plataforma consulta a fonte e o retorno é a prova — sem IA e sem upload.
  É **mais confiável que a análise humana atual**, porque o analista confere um PDF
  enviado pelo fornecedor, que pode ser adulterado; a consulta na fonte não pode.
  **11 desses 15 já têm conector pronto** no BC Report.
- **A outra metade é trabalho de IA, e IA dá precisão, não certeza.** 34 tipos
  (44% das ocorrências) são documentos técnicos enviados pelo fornecedor —
  contrato social, alvarás, licenças, calibrações, PCMSO/PGR. Com regra objetiva,
  extração estruturada e consulta cruzada quando existe, dá para decidir a maioria
  automaticamente — **mas isso precisa ser provado tipo a tipo contra o histórico**
  de análises humanas antes de a IA decidir sozinha.
- **3 tipos ficam humanos** (1,8% das ocorrências): formulário interno do próprio
  cliente, acreditação forense de toxicologia e proposta técnica.

**Custo por homologação cai de dezenas de reais de trabalho humano para
R$ 1 a R$ 7** de consultas + IA — menos de 2% do preço cobrado.
**Hospedar um modelo próprio é decisão de LGPD, não de custo:** no volume atual,
a API sai algumas vezes mais barata que uma GPU dedicada.

## 2. As quatro rotas de validação

| Rota | O que é | Tipos | Ocorrências na matriz |
| --- | --- | --- | --- |
| **A** | Consulta oficial determinística — o retorno da fonte é a prova | 10 | 54% (A + A*) |
| **A\*** | Consulta oficial com cobertura parcial (UF/município) → fallback para upload + IA | 5 | (incluído acima) |
| **B** | Upload analisado por IA contra a regra cadastrada, com consulta cruzada quando existe | 34 | 44% |
| **C** | Decisão humana (julgamento de negócio / nicho de alto risco) | 3 | 2% |

Classificação documento a documento no **Anexo A**.

Fontes da Rota A confirmadas: conectores em produção no BC Report (Receita,
Sintegra, PGFN, Caixa/FGTS, TST/CNDT, Sefaz, prefeituras, lista suja) e, no
catálogo público da Infosimples, **IBAMA — Certificado de Regularidade**,
**Polícia Federal — Regularidade de Segurança Privada**, **CFM — cadastro de
médico/estabelecimento**, **ANP** e **Junta Comercial SP** (ficha e documentos).
Não encontrados no catálogo (tratar como Rota B até confirmar com a Infosimples):
CREA/CONFEA, conselho de fonoaudiologia, SINIR/MTR, CNV de pessoa física,
alvarás municipais e licenças ambientais estaduais.

## 3. Por nível: quanto automatiza e quanto custa

Processo típico = média das categorias do nível (um fornecedor escolhe 1–2
categorias, não o nível inteiro). IA em **Batch API** (−50%): a análise não é
tempo real — o SLA é de 3 dias úteis.

| Nível | Docs PJ | Rota A | Infosimples | IA Sonnet 5 | IA Opus 5 | **Automação total** | Humano hoje | Humano depois |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Suprimentos N1 | 3,6 | 59% | R$ 0,79 | R$ 0,19 | R$ 0,47 | **R$ 0,98 – 1,26** | ~22 min (R$ 22) | ~3 min (R$ 3) |
| Suprimentos N2 | 6,7 | 42% | R$ 0,97 | R$ 0,65 | R$ 1,62 | **R$ 1,62 – 2,59** | ~48 min (R$ 48) | ~4 min (R$ 4) |
| Suprimentos N3 | 8,0 + 6,8 mob. | 92% (PJ) | R$ 2,10 | R$ 1,98 | R$ 4,94 | **R$ 4,08 – 7,04** | ~116 min (R$ 116)¹ | ~8 min (R$ 8) |

¹ N3 inclui 1 posto de mobilidade com 2 pessoas (PCMSO, PGR, arma + ASO, CNV e
curso por pessoa). A mobilidade é nova, então o "hoje" é o custo manual
equivalente. Cada pessoa a mais no posto soma ~R$ 0,30 de IA (Sonnet 5, Batch).

Onde está o custo de IA: documentos longos. PCMSO e PGR (~40 páginas) custam
~R$ 0,68 cada no Sonnet 5 e ~R$ 1,71 no Opus 5; uma certidão ou alvará custa
~R$ 0,10 / ~R$ 0,26.

Níveis de Medicina e Qualidade (menos automatizáveis: só 20–29% de Rota A e a
maior concentração de documentos **sem regra cadastrada**):

| Nível | Docs | Rota A | Infosimples | IA Sonnet 5 | IA Opus 5 | Humano hoje → depois |
| --- | --- | --- | --- | --- | --- | --- |
| Medicina N1 | 5,0 | 20% | R$ 0,60 | R$ 0,37 | R$ 0,91 | 32 → ~10 min |
| Medicina N2 | 12,0 | 29% | R$ 1,50 | R$ 0,87 | R$ 2,18 | 72 → ~13 min |
| Qualidade | 1,0 | 0% | — | R$ 0,18 | R$ 0,44 | 12 → ~1 min |

Premissas completas no **Anexo B**. O "humano depois" já considera que 20% dos
documentos de IA vão para revisão na fase inicial.

## 4. O que impede o "100%" hoje

1. **19 dos 52 documentos não têm regra de validação cadastrada.** Para 5 deles
   (certidões de resultado binário) a regra é implícita; **14 precisam de regra
   escrita antes de qualquer automação** — sem regra, a IA não tem critério.
   Concentrados em Medicina N2 (audiômetro, cabine, esfigmomanômetro,
   fonoaudiologia).
2. **Regras ambíguas já sinalizadas na própria matriz**: falência ("pelo menos um
   mês anterior"), validade divergente da ordem de serviço. Confirmar com o
   cliente antes de automatizar — uma regra ambígua vira decisão errada em escala.
3. **Duplicidades na matriz**: dois títulos de calibração com regra única;
   contrato social em dois códigos. Unificar antes.
4. **Disponibilidade das fontes**: no uso real do BC Report, a fonte de falência
   (TST) ficou pausada e a CND federal falhou 2 de 6 vezes na primeira tentativa.
   A Rota A precisa da fila com nova tentativa que o BC Report já tem, e de
   fallback para upload.
5. **Cobertura parcial (A\*)**: CND municipal só nos municípios suportados; a
   Sefaz de algumas UFs exige certificado digital.
6. **Julgamentos subjetivos dentro de regras objetivas**: "atividade compatível
   com a categoria" (licença de operação, comprovação de experiência, ART). A IA
   acerta a maioria, mas estes são os primeiros candidatos a revisão humana.

## 5. Arquitetura proposta

Um **motor de validação por tipo de documento**, com uma chave por tipo no
catálogo: `manual` → `assistido` → `automático`. A EQPI promove cada tipo
quando ele provar desempenho — nunca todos de uma vez.

- **Rota A — coletor.** Reaproveita os conectores do BC Report. O fornecedor
  **não faz upload**: a plataforma consulta, aplica a regra (situação + validade)
  e guarda o recibo da fonte como evidência. Aprova ou reprova sozinha.
- **Rota B — IA com regra.** O documento enviado vai à IA com a regra do tipo no
  prompt e saída estruturada: veredito (aprovar / reprovar / revisar), campos
  extraídos (CNPJ, razão social, nº, emissão, validade, signatário), motivo e a
  **página da evidência**. Cruza com a fonte oficial quando existe (CFM, Junta,
  ANP, QSA da Receita). "Revisar" ou baixa confiança → fila humana, com a IA já
  tendo pré-preenchido tudo (a revisão cai de minutos para segundos).
- **Rota C — humano**, com resumo da IA.
- **Adaptador de modelo único**: o motor não conhece o provedor. Trocar Claude
  por um modelo próprio é configuração por tipo de documento, não reescrita.

Hoje a IA do projeto é uma chamada direta ao Sonnet 4.6 só para extrair dados
bancários e de DRE. O motor novo deve usar o SDK oficial da Anthropic, saída
estruturada e Batch API.

## 6. LGPD e dados sensíveis

- **Documentos PJ também têm dado pessoal.** Contrato social traz CPF, RG e
  endereço dos sócios. Enviar a uma API estrangeira é **transferência
  internacional** (LGPD art. 33): exige base legal e contrato de tratamento com o
  fornecedor da IA. Minimização: **mascarar CPF/RG antes do envio** — as regras
  precisam de nomes e qualificação, não de documento de identidade.
- **Mobilidade é dado sensível.** ASO é dado de saúde (LGPD art. 11), e CNV/CNH
  identificam pessoas. **Na fase de testes com a Anthropic, usar só documentos
  sintéticos ou anonimizados**; ASO/CNV/CNH reais apenas no modelo próprio.
- **Recomendação de arquitetura**: híbrido por sensibilidade — modelo próprio
  para PF e saúde, API para documentos PJ mascarados. O adaptador único permite
  migrar tudo para o modelo próprio depois, se o jurídico exigir.
- Verificar nos termos comerciais da Anthropic a política de retenção de dados e
  a opção de retenção zero antes de enviar documentos reais.

## 7. API × modelo próprio: custo

- API, só a parte de IA (as consultas oficiais existem nos dois cenários): a 500
  homologações/mês de nível 2, **entre R$ 330 (Sonnet 5) e R$ 810 (Opus 5) por mês**
  em Batch.
- Modelo próprio (Gemma ou similar) numa GPU dedicada em nuvem: ordem de
  grandeza de **alguns milhares de reais por mês** por GPU, mais operação — e com
  qualidade inferior aos modelos de ponta em documentos complexos (a medir).
- Conclusão: o modelo próprio só se paga por custo em **milhares de homologações
  por mês**. Abaixo disso, ele se justifica por LGPD e soberania de dados — o que
  é uma razão legítima, mas deve ser decidida como tal.

Escolha de modelo: Opus 5 é a referência de qualidade; Sonnet 5 é o candidato de
custo. A decisão deve sair da medição no gabarito (seção 8), por tipo de
documento — não da tabela de preços.

## 8. Plano de trabalho no staging

1. **Rota A primeiro (maior ganho, zero risco de IA).** Ligar os 11 conectores
   existentes à homologação para os tipos A, criar os 4 novos (IBAMA CTF,
   PF segurança privada, CFM, ANP), aplicar a regra determinística e guardar o
   recibo. Metade das ocorrências da matriz deixa de passar por gente.
2. **Montar o gabarito.** Temos milhares de documentos já analisados por humanos,
   com decisão e motivo de reprovação (histórico do HOC e do ELOS). Separar uma
   amostra por tipo de documento B (aprovados e reprovados), com um conjunto de
   teste que a IA nunca vê durante o ajuste.
3. **Rota B assistida.** IA pré-analisa, o analista confirma. Medir concordância
   por tipo.
4. **Promover tipo a tipo para automático** quando bater um critério definido
   pela EQPI — sugestão: ≥ 98% de concordância com o humano nas **reprovações**
   no conjunto de teste (o erro caro é aprovar o que devia reprovar).
5. **Escrever as 14 regras faltantes** e resolver ambiguidades e duplicidades
   (seção 4) em paralelo — são pré-requisito do passo 3 para esses tipos.
6. **Modelo próprio para documentos sensíveis**, quando a infraestrutura estiver
   pronta.

## Anexo A — classificação dos 52 documentos

"Categorias" = em quantas categorias do cliente o documento é exigido (peso na
matriz). Documentos marcados SEM REGRA precisam de regra cadastrada antes da
automação.

| Doc | Documento | Categorias | Rota | Tamanho | Como validar |
| --- | --- | --- | --- | --- | --- |
| 37 | Cartão de Inscrição no CNPJ | 25 | A — consulta oficial | curto | Receita (cartão CNPJ) — situação ativa |
| 10001 | Sintegra | 22 | A — consulta oficial | curto | Sintegra/UF — habilitada; isenta+só serviços é regra determinística |
| 42 | CND Tributos Federais e Dívida Ativa da União | 5 | A — consulta oficial | curto | PGFN/RFB — conjunta negativa |
| 10002 | Lista Suja — Trabalho Escravo | 5 | A — consulta oficial | curto | base local gratuita (MTE) |
| 18 | Certificado de Regularidade - IBAMA (CTF) | 5 | A — consulta oficial | curto | IBAMA — Certificado de Regularidade (catálogo Infosimples) |
| 7 | Certidão de Regularidade do FGTS | 4 | A — consulta oficial | curto | Caixa — CRF |
| 8 | CNDT Certidão Negativa de Débitos Trabalhistas | 4 | A — consulta oficial | curto | TST — CNDT |
| 578 | Relatório Assertiva | 3 | A — consulta oficial | curto | Assertiva — gerado por API (custo próprio) |
| 166 | Registro e autorização de funcionamento emitido pela Polícia Federal | 2 | A — consulta oficial | curto | PF — Regularidade de Segurança Privada (catálogo Infosimples) |
| 10038 | Certidão negativa de dívida ativa federal | 1 | A — consulta oficial | curto | PGFN — dívida ativa federal |
| 16 | CND Tributos Estaduais | 5 | A* — consulta oficial, cobertura parcial | curto | Sefaz/UF — algumas UFs exigem e-CNPJ (ex.: RJ) |
| 150 | Certidão Negativa de Falência ou Concordata expedida pelo Ofício de Re… | 4 | A* — consulta oficial, cobertura parcial | curto | TST banco de falências instável (fonte pausada 615) + TJ por UF |
| 10039 | Certidão negativa de dívida ativa estadual | 1 | A* — consulta oficial, cobertura parcial | curto | Sefaz/UF — dívida ativa estadual (cobertura por UF) |
| 10040 | Certidão negativa de dívida ativa municipal | 1 | A* — consulta oficial, cobertura parcial | curto | Prefeitura — cobertura por município |
| 6 | CND Tributos Municipais ou Mobiliários | 1 | A* — consulta oficial, cobertura parcial | curto | Prefeitura — cobertura por município (ex.: São Luís sem retorno) |
| 40 | Alvará de Funcionamento ou Taxa de Funcionamento com Comp de Pagamento… | 10 | B — IA sobre o upload | curto | Alvará: validade, TFE, regras municipais; cruza CND municipal |
| 19 | Licença de Operação emitida pelo órgão ambiental competente e/ou Decla… | 9 | B — IA sobre o upload | médio | LO: CNAE × categoria, protocolo ≥120 dias |
| 39 | Contrato Social (último consolidado) ou Requerimento de Empresário | 6 | B — IA sobre o upload | médio | Contrato social: registro, consolidação, administradores; cruza QSA Receita/Junta SP |
| 10006 | Certificado de calibração do Instrumento utilizado para medição | 5 | B — IA sobre o upload | curto | Calibração: nº, instrumento, laboratório, data |
| 10009 | Alvará Sanitário Municipal | 4 | B — IA sobre o upload | curto | Alvará sanitário municipal |
| 10008 | Comprovação de experiência para desempenho da atividade contratada | 4 | B — IA sobre o upload | médio | Experiência: atestado/contrato/NF, período, atividade compatível |
| 10028 | Rastreabilidade do certificado de calibração do esfigmomanômetro | 3 | B — IA sobre o upload | curto | Rastreabilidade esfigmomanômetro (SEM REGRA) |
| 65 | Certificado do Conselho de Classe do Responsável (Técnico vinculado a … | 3 | B — IA sobre o upload | curto | Conselho de classe do responsável (CREA sem API no catálogo) |
| 10010 | Registro da empresa no Conselho de Classe e constatação do profissiona… | 2 | B — IA sobre o upload | curto | Registro PJ no conselho + quadro técnico |
| 67 | ART Anotação de Responsabilidade Técnica (Técnico vinculado a Empresa) | 2 | B — IA sobre o upload | curto | ART: nº, RT, objeto compatível |
| 10011 | Comprovante detalhado da execução dos serviços (ordem de serviço) | 2 | B — IA sobre o upload | médio | Ordem de serviço: função, riscos, EPIs |
| 10037 | Contrato social e última alteração contratual | 1 | B — IA sobre o upload | médio | Contrato social + alteração; cruza QSA |
| 10014 | Certificado de Calibração dos Instrumentos | 1 | B — IA sobre o upload | curto | Calibração (duplicidade com 10006 — unificar) |
| 10027 | Certificado de Calibração com cálculo de incerteza da medição | 1 | B — IA sobre o upload | curto | Calibração com incerteza |
| 10026 | Vínculo à RBC ou padrões rastreáveis (INMETRO) com acreditação da cali… | 1 | B — IA sobre o upload | curto | Vínculo RBC/INMETRO |
| 10044 | Alvará sanitário do laboratório | 1 | B — IA sobre o upload | curto | Alvará sanitário laboratório (SEM REGRA) |
| 10042 | Carteira do conselho de fonoaudiologia do profissional que realiza as … | 1 | B — IA sobre o upload | curto | Conselho de fonoaudiologia (sem API; SEM REGRA) |
| 10043 | Certificado de responsabilidade técnica do médico responsável pela clí… | 1 | B — IA sobre o upload | curto | RT médico — cruza CFM cadastro (catálogo Infosimples) |
| 10029 | Certificado de regularidade de Inscrição de Pessoa Jurídica | 1 | B — IA sobre o upload | curto | Regularidade PJ em conselho (SEM REGRA) |
| 26 | Autorização Agência Nacional de Petróleo - Registro ANP | 1 | B — IA sobre o upload | curto | ANP — cruza catálogo ANP (postos/revendas/bases) |
| 10004 | Cadastro no Sistema MTR do órgão correspondente (SINIR, FEAM, INEA, SI… | 1 | B — IA sobre o upload | curto | MTR: CNPJ no print/documento (SINIR sem API) |
| 10005 | Certificado ou Declaração de destinação final do resíduo | 1 | B — IA sobre o upload | curto | Destinação de resíduo: NF com descrição/destino |
| 10007 | Certificado de Conformidade Inmetro para Pneus Novos Rodoviários | 1 | B — IA sobre o upload | curto | INMETRO pneus: OCP acreditado |
| 239 | FISPQ - Ficha de informações de produtos químicos perigosos | 1 | B — IA sobre o upload | médio | FISPQ: 16 seções, revisão 2023 |
| 545 | PCMSO (Programa de Controle Médico de Saúde Ocupacional) conforme cron… | 1 | B — IA sobre o upload | longo | PCMSO: validade, índice completo, assinatura médico do trabalho |
| 546 | PGR (Programa de Gerenciamento de Riscos) conforme cronograma e demais… | 1 | B — IA sobre o upload | longo | PGR: validade, índice completo, assinatura |
| 157 | PMOC - Plano de manutenção e Operação e Controle de sistemas de climat… | 1 | B — IA sobre o upload | médio | PMOC: campos obrigatórios, RT |
| 10013 | Histórico de Manutenção ou Último Registro de Manutenção | 1 | B — IA sobre o upload | curto | Histórico de manutenção |
| 10030 | Certificado Esfigmomanômetro | 1 | B — IA sobre o upload | curto | Certificado esfigmomanômetro (SEM REGRA) |
| 10032 | Certificado da Cabine Audiométrica | 1 | B — IA sobre o upload | curto | Certificado cabine audiométrica (SEM REGRA) |
| 10033 | Rastreabilidade Cabine Audiométrica | 1 | B — IA sobre o upload | curto | Rastreabilidade cabine (SEM REGRA) |
| 10034 | Certificado do Audiômetro | 1 | B — IA sobre o upload | curto | Certificado audiômetro (SEM REGRA) |
| 10035 | Rastreabilidade do Audiômetro | 1 | B — IA sobre o upload | curto | Rastreabilidade audiômetro (SEM REGRA) |
| 10036 | Declaração Fonoaudiólogo | 1 | B — IA sobre o upload | curto | Declaração fonoaudiólogo (SEM REGRA) |
| 10015 | Laudo Técnico da GETEC (formulário interno do cliente) | 1 | C — decisão humana | médio | Formulário interno do cliente (GETEC): a aprovação é do próprio cliente |
| 10025 | Acreditação CAP-FDT ou Acreditação INMETRO (ISO/IEC 17025 — toxicologi… | 1 | C — decisão humana | médio | Acreditação forense CAP-FDT/INMETRO: nicho, alto risco |
| 10041 | Proposta técnica | 1 | C — decisão humana | médio | Proposta técnica: julgamento comercial |

## Anexo B — premissas do cálculo

| Premissa | Valor | Origem |
| --- | --- | --- |
| Consulta Infosimples | R$ 0,30 | medido no BC Report: R$ 0,24 a 0,40, só cobra quando retorna dado |
| Preço IA (US$ por 1M tokens entrada/saída) | Opus 5: 5/25 · Sonnet 5: 2/10 · Haiku 4.5: 1/5 | tabela oficial Anthropic, set/2026 |
| Batch API | −50% | análise assíncrona (SLA 3 dias úteis) |
| Câmbio | R$ 5,50 / US$ | premissa |
| Tokens por página de PDF | 2.500 | conservador (texto + imagem da página); medir com contagem de tokens |
| Páginas | curto 2 · médio 6 · longo 40 | estimativa por tipo |
| Prompt com a regra | 2.000 tokens | estimativa |
| Saída + raciocínio | curto 2.400 · médio 3.000 · longo 4.500 tokens | estimativa com raciocínio adaptativo |
| Custo do analista | R$ 60/hora com encargos | premissa |
| Tempo de análise hoje | A 4 min · curto 6 · médio 12 · longo 25 · C 15 | premissa — medir no histórico |
| Documentos de IA que vão a revisão | 20% na fase inicial | premissa — cai conforme os tipos são promovidos |
| Posto de mobilidade típico | 2 pessoas | mediana da importação dos postos |

As premissas de tempo humano e de tokens são estimativas: devem ser medidas no
staging (tempo real de análise no histórico e contagem de tokens de documentos
reais) antes de virar orçamento.
