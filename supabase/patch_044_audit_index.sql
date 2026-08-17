-- ============================================================
-- PATCH 044 — Índice para o Log do Processo
-- A aba "Log do Processo" consulta audit_log por entity_id; com a
-- importação do log humano do HOC (~1,2M linhas) o índice é
-- obrigatório. Também cobre a ordenação por data.
-- ============================================================

CREATE INDEX IF NOT EXISTS audit_log_entity_created_idx
  ON audit_log (entity_id, created_at DESC);
