# Runbook de Recuperação de Desastre (DR) — SIGEC-ELOS

**Versão:** 1.0  
**Data:** 2026-07-06  
**Classificação:** Interno — Uso Operacional  
**Atende:** INF.01.008, INF.03.002-005 (Questionário VIX) / P1-5 IMPLEMENTACAO_VIX_ELOS.md

---

## 1. Objetivos e Métricas

| Métrica | Alvo |
|---------|------|
| RPO (Recovery Point Objective) | 24 horas |
| RTO (Recovery Time Objective) | 4 horas |

**Fontes de backup disponíveis:**

| Fonte | Tipo | Retenção | Responsável |
|-------|------|----------|-------------|
| **Supabase Dashboard** | PITR / Snapshot gerenciado | Conforme plano contratado | Supabase Inc. |
| **S3 VIX** (`s3://eqpi-vix-db-backups/elos/`) | Dump lógico diário (`pg_dump -Fc`) | 30 dias (lifecycle automático) | EQPI Tech (workflow GitHub Actions) |

---

## 2. Papéis e Responsáveis

| Papel | Nome | Contato |
|-------|------|---------|
| Responsável Técnico (DR Coordinator) | _[preencher]_ | _[preencher]_ |
| DBA / Operador de Restore | _[preencher]_ | _[preencher]_ |
| Gestor de Incidentes | _[preencher]_ | _[preencher]_ |
| Ponto de Contato Cliente VIX | _[preencher]_ | _[preencher]_ |

---

## 3. Procedimento de Restauração

### 3.1 Fonte A — Painel Supabase (recomendada para falhas de dados recentes)

> Use quando o problema for corrupção parcial de dados ou necessidade de restore point-in-time.

1. Acesse [app.supabase.com](https://app.supabase.com) → selecione o projeto SIGEC-ELOS.
2. Vá em **Settings → Database → Backups**.
3. Selecione o ponto de restauração mais próximo anterior ao incidente.
4. Clique em **Restore** e confirme. O Supabase irá provisionar um novo banco.
5. Atualize a variável `SUPABASE_DB_URL` / connection string nas integrações (Netlify, GitHub Secrets) para apontar para o novo projeto, se necessário.
6. Valide com as queries de sanidade (Seção 5).

### 3.2 Fonte B — Dump S3 VIX (fallback ou auditoria externa)

> Use quando o painel Supabase estiver indisponível ou for necessária auditoria independente.

**Pré-requisitos:**
- `postgresql-client` instalado (`sudo apt-get install postgresql-client` / `brew install libpq`)
- Credencial IAM com permissão de leitura no bucket (`elos-backup-reader` — solicitar ao admin AWS VIX)
- Banco de staging/destino provisionado e acessível

**Passo a passo:**

```bash
# 1. Baixar o dump desejado do S3
aws s3 cp s3://eqpi-vix-db-backups/elos/elos_YYYYMMDD_HHMMSS.dump ./elos_restore.dump \
  --region sa-east-1

# 2. Executar o restore test (valida e restaura em staging)
./scripts/restore-test.sh elos_restore.dump "postgresql://user:pass@staging-host/dbname"

# 3. Para restore em PRODUÇÃO (apenas em cenário de DR real, após aprovação do gestor):
pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  --dbname="$SUPABASE_DB_URL" \
  elos_restore.dump
```

> **Atenção:** O script `restore-test.sh` possui proteção que bloqueia execução direta contra o banco de produção. Em cenário de DR real, use `pg_restore` diretamente conforme o passo 3 acima, somente após aprovação formal.

---

## 4. Validação Pós-Restore

Execute as seguintes queries no banco restaurado e registre os resultados:

```sql
-- Contagens de sanidade
SELECT count(*) FROM suppliers;
SELECT count(*) FROM audit_log;
SELECT count(*) FROM documents;
SELECT count(*) FROM user_roles;
SELECT count(*) FROM clients;
SELECT count(*) FROM seals;

-- Verificar integridade de dados recentes
SELECT created_at, status FROM suppliers ORDER BY created_at DESC LIMIT 5;
SELECT created_at, action FROM audit_log ORDER BY created_at DESC LIMIT 5;
```

O sistema está operacional quando:
- [ ] Contagens estão dentro do esperado (comparar com última snapshot conhecida)
- [ ] Login de usuário admin funciona via SIGEC-ELOS
- [ ] Pelo menos 1 fornecedor com seal ACTIVE listado

---

## 5. Template de Teste Trimestral

Preencher e arquivar a cada exercício (mínimo trimestral, conforme INF.03.005):

```
DATA DO TESTE         : ____/____/________
EXECUTOR              : ___________________________
FONTE USADA           : [ ] Supabase Dashboard   [ ] Dump S3 VIX
ARQUIVO/PONTO USADO   : ___________________________
AMBIENTE DE DESTINO   : [ ] Staging dedicado     [ ] Banco temporário
DURAÇÃO TOTAL         : ____ minutos

CONTAGENS VALIDADAS:
  suppliers   : ________
  audit_log   : ________
  documents   : ________
  user_roles  : ________
  clients     : ________
  seals       : ________

RESULTADO             : [ ] SUCESSO   [ ] FALHA
OBSERVAÇÕES           : _______________________________________________
                        _______________________________________________

APROVADO POR          : ___________________________
ASSINATURA/RUBRICA    : ___________________________
```

---

## 6. Procedimento de Comunicação de Incidente

### Critérios de acionamento deste runbook

| Evento | Ação |
|--------|------|
| Indisponibilidade total do banco > 15 min | Acionar DR Coordinator imediatamente |
| Corrupção ou perda de dados confirmada | Acionar DR Coordinator + Gestor de Incidentes |
| Falha consecutiva de 2+ backups diários | Investigar em até 4h; notificar cliente se > 24h |

### Roteiro de comunicação

1. **T+0** — DR Coordinator confirma o incidente e abre ticket interno (tag `DR`).
2. **T+30min** — Primeira comunicação ao Gestor de Incidentes: natureza do problema, impacto estimado, RPO/RTO projetados.
3. **T+1h** — Comunicação ao Ponto de Contato VIX se houver impacto em dados do cliente ou indisponibilidade do ambiente.
4. **T+RTO** — Comunicação de resolução: data/hora de retorno, dados validados, causa raiz preliminar.
5. **T+48h** — Post-mortem e relatório de incidente (template abaixo).

### Template de notificação (e-mail / ticket)

```
Assunto: [SIGEC-ELOS] Incidente DR — [DATA] — [STATUS: Em andamento / Resolvido]

Descrição do incidente:
  Data/hora início : ____/____/________ __:__
  Data/hora fim    : ____/____/________ __:__  (se resolvido)
  Impacto          : [descrever quais funcionalidades/dados afetados]

Ação tomada:
  Fonte de restore  : [ ] Supabase   [ ] S3 VIX
  Dump utilizado    : ___________________________
  RTO efetivo       : ____ horas
  RPO efetivo       : ____ horas

Dados validados pós-restore:
  suppliers  : ________  |  audit_log : ________  |  documents : ________

Causa raiz: [preencher]
Medidas preventivas: [preencher]

Responsável técnico: ___________________________
```

---

## 7. Referências e Links Úteis

| Recurso | Link / Localização |
|---------|--------------------|
| Workflow de backup | `.github/workflows/db-backup.yml` |
| Script de restore-test | `scripts/restore-test.sh` |
| Bucket S3 | `s3://eqpi-vix-db-backups/elos/` (região `sa-east-1`) |
| Painel Supabase | [app.supabase.com](https://app.supabase.com) |
| GitHub Actions | `https://github.com/eqpi-tech/sigec-elos/actions` |
| Documento VIX | `IMPLEMENTACAO_VIX_ELOS.md` |
