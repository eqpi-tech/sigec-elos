# Runbook — go-live de cliente (execução automática e acompanhamento)

Para quem cobre a TI durante um go-live. Sem segredos aqui: as credenciais
(banco, Resend, CRON_SECRET) ficam nos secrets do GitHub e no `.env` local,
fornecidos pelo líder do time. `<CAMP>` é o código da campanha em
`scripts/comunicados_golive/enviar.py` (`CAMPANHAS`).

## O que acontece sozinho

| Quando | O quê | Onde |
|---|---|---|
| Dias de comunicado (calendário `CALENDARIO`) | e-mails informativos aos fornecedores, 09:00 BRT | `comunicados-golive.yml` → `enviar.py --agendado` |
| Dia do go-live (calendário `EXECUCAO`) | convites + pré-cadastros + usuários Operacionais + e-mails de acesso, a partir de 09:00 BRT, em rodadas até zerar a fila | `golive-execucao.yml` → `execucao.py --agendado` → função `golive-run-background` |
| Todo dia da janela `RESUMO`, 18:00 BRT | resumo do dia aos e-mails de `alertas` | `golive-execucao.yml` → `execucao.py --resumo-agendado` |
| Qualquer falha do job | e-mail "ALERTA — o job do GitHub falhou" com o link do log | passo "Alerta de falha" do workflow |

O GitHub atrasa agendamentos em até ~4h30: os jobs disparam de madrugada e
esperam o horário; há disparos de reserva. Tudo é idempotente — rodar de novo
só completa o que faltou (ninguém recebe e-mail duas vezes).

## As duas travas

- `app_settings 'golive_lista_<CAMP>'` — lista de comunicados validada com o cliente (`enviar.py --validar <CAMP>`).
- `app_settings 'golive_execucao_<CAMP>'` — execução aprovada (`execucao.py --aprovar <CAMP>`).
  Sem ela, o dia do go-live só manda um aviso "NÃO executado" e não faz nada.

## Comandos (da raiz do repositório, com o `.env` de produção)

```bash
python3 scripts/comunicados_golive/execucao.py --status <CAMP>     # fila por modo/status, trava, últimas rodadas
python3 scripts/comunicados_golive/execucao.py --pausar <CAMP>     # PARAR: nenhuma rodada nova começa
python3 scripts/comunicados_golive/execucao.py --aprovar <CAMP>    # religar
python3 scripts/comunicados_golive/execucao.py --executar <CAMP>   # rodar agora (só o que está PENDENTE)
python3 scripts/comunicados_golive/execucao.py --resumo-diario --para voce@empresa  # resumo agora, só para você
```

Pelo GitHub (sem máquina local): Actions → "Go-live de cliente — execução e
resumo diário" → Run workflow → `executar` ou `resumo`. "Run workflow" no
dia/horário errado não faz nada (respeita o calendário) — para forçar fora do
calendário use o comando local `--executar`.

## Status de cada empresa (`golive_suppliers`)

| Status | Significa | Ação |
|---|---|---|
| PENDENTE | ainda não processada | a próxima rodada pega |
| ENVIADO | convite enviado (modo convite) | nada — o fornecedor conclui o cadastro pelo link |
| CADASTRADO | empresa cadastrada pela EQPI (modo pré-cadastro) | nada — a pessoa recebe o e-mail de acesso |
| ERRO | falhou (motivo na coluna `erro`) | corrigir a causa e voltar para PENDENTE (abaixo) |
| SUSPENSO | fica para depois, por decisão do cliente | não mexer sem pedido |

Reprocessar uma empresa com erro, depois de corrigir a causa:

```sql
update golive_suppliers set status = 'PENDENTE', erro = null where campanha = '<CAMP>' and cnpj = '<14 dígitos>';
```

e então `--executar <CAMP>`. Erros comuns: fluxo ou categoria com nome
diferente do cadastrado no cliente; CNPJ sem retorno da Receita (tentar de
novo mais tarde); limite de 4 usuários por empresa (Operacional não incluído —
avisar o fornecedor para liberar um lugar na Equipe).

## Perguntas que vão chegar

- **"Não recebi o e-mail"** → conferir a caixa de spam; reenviar o convite pelo
  backoffice (Convites). No pré-cadastro o login já existe: a pessoa entra
  pelo "Esqueci minha senha" na tela de login com o e-mail da planilha.
- **"O link de criar senha expirou"** → vale 21 dias; usar "Esqueci minha senha" no login.
- **"Tenho várias empresas"** → todas aparecem no seletor de empresa do topo;
  os termos do cliente são aceitos uma vez só e valem para todas.
- **"Não quero receber os lembretes"** → os lembretes de documentos chegam
  agrupados (um e-mail por pessoa com a lista das empresas); não há opção de
  desligar durante a homologação.

## Não fazer

- Nunca escrever no MySQL do HOC.
- Nunca apagar linhas de `golive_suppliers`, `invitations` ou `suppliers` — pausar e perguntar.
- Nunca reenviar comunicado em lote "para garantir": o envio já é idempotente.
