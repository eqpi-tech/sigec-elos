-- ============================================================
-- PATCH 046 — Estado da sincronização diária HOC → ELOS
-- Uma linha por entidade: watermark incremental + relatório da
-- última execução (auditável pela equipe no backoffice/SQL).
-- Escritas apenas via service role (script de sync).
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_state (
  entity       TEXT PRIMARY KEY,
  watermark    TEXT,             -- max(update_date) do HOC já processado (naive, horário do MySQL)
  last_id      BIGINT,           -- para entidades incrementais por id (log_processo)
  last_run_at  TIMESTAMPTZ,
  rows_read    INTEGER,
  rows_written INTEGER,
  status       TEXT,             -- ok | error
  error        TEXT,
  duration_s   NUMERIC
);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_state_admin_read ON sync_state;
CREATE POLICY sync_state_admin_read ON sync_state
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));
