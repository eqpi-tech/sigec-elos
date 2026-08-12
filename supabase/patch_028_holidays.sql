-- ============================================================
-- PATCH 028 — Cadastro de Feriados
-- Feriados ajustam o cálculo de prazos do farol: vencimentos e
-- datas-limite que caem em feriado/fim de semana rolam para o
-- próximo dia útil.
-- Executar no SQL Editor do Supabase Dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao   TEXT NOT NULL,
  data        DATE NOT NULL UNIQUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Leitura para qualquer usuário autenticado (o farol é calculado no frontend)
DROP POLICY IF EXISTS holidays_read ON holidays;
CREATE POLICY holidays_read ON holidays
  FOR SELECT TO authenticated USING (true);

-- Escrita apenas para ADMIN
DROP POLICY IF EXISTS holidays_admin_write ON holidays;
CREATE POLICY holidays_admin_write ON holidays
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
  ));

-- Seed: feriados nacionais fixos de 2026 (ajustar/complementar pelo backoffice)
INSERT INTO holidays (descricao, data) VALUES
  ('Ano Novo',                 '2026-01-01'),
  ('Tiradentes',               '2026-04-21'),
  ('Dia do Trabalhador',       '2026-05-01'),
  ('Independência do Brasil',  '2026-09-07'),
  ('Nossa Senhora Aparecida',  '2026-10-12'),
  ('Finados',                  '2026-11-02'),
  ('Proclamação da República', '2026-11-15'),
  ('Natal',                    '2026-12-25')
ON CONFLICT (data) DO NOTHING;
