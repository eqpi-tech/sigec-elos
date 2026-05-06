-- patch_008_questionarios.sql
-- Módulo de Questionários por Cliente
-- Tabelas: questionnaires, questionnaire_questions, questionnaire_answers

-- ── 1. Questionários (template por cliente) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionnaires (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES clients NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "questionnaires_admin" ON questionnaires
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Cliente: somente os seus próprios questionários
CREATE POLICY "questionnaires_client_own" ON questionnaires
  FOR ALL USING (
    client_id IN (SELECT client_id FROM user_roles WHERE user_id = auth.uid() AND role = 'CLIENT')
  );

-- ── 2. Perguntas do Questionário ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID REFERENCES questionnaires NOT NULL,
  text             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'boolean' CHECK (type IN ('boolean', 'text', 'select')),
  options          JSONB,          -- Para tipo 'select': ["Opção A", "Opção B"]
  required         BOOLEAN DEFAULT true,
  order_index      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "qq_admin" ON questionnaire_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Cliente: somente perguntas dos seus questionários
CREATE POLICY "qq_client_own" ON questionnaire_questions
  FOR ALL USING (
    questionnaire_id IN (
      SELECT q.id FROM questionnaires q
      WHERE q.client_id IN (SELECT client_id FROM user_roles WHERE user_id = auth.uid() AND role = 'CLIENT')
    )
  );

-- Fornecedor: leitura das perguntas de questionários dos clientes que o convidaram
CREATE POLICY "qq_supplier_read" ON questionnaire_questions
  FOR SELECT USING (
    questionnaire_id IN (
      SELECT q.id FROM questionnaires q
      INNER JOIN invitations i ON i.client_id = q.client_id
      WHERE i.supplier_id IN (
        SELECT supplier_id FROM profiles WHERE id = auth.uid()
      )
      AND q.active = true
    )
  );

-- ── 3. Respostas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      UUID REFERENCES questionnaire_questions NOT NULL,
  supplier_id      UUID REFERENCES suppliers NOT NULL,
  answer_boolean   BOOLEAN,
  answer_text      TEXT,
  answered_at      TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (question_id, supplier_id)
);

ALTER TABLE questionnaire_answers ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "qa_admin" ON questionnaire_answers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Fornecedor: somente as suas próprias respostas
CREATE POLICY "qa_supplier_own" ON questionnaire_answers
  FOR ALL USING (
    supplier_id IN (SELECT supplier_id FROM profiles WHERE id = auth.uid())
  );

-- Cliente: leitura das respostas de seus fornecedores
CREATE POLICY "qa_client_read" ON questionnaire_answers
  FOR SELECT USING (
    supplier_id IN (
      SELECT i.supplier_id FROM invitations i
      WHERE i.client_id IN (SELECT client_id FROM user_roles WHERE user_id = auth.uid() AND role = 'CLIENT')
      AND i.supplier_id IS NOT NULL
    )
  );
