-- patch_023_sprint.sql
-- Sprint de evolução: banco/DRE, aprovação por categoria, motivos de recusa,
-- multi-usuário fornecedor, pricing model, RFQ estendido, preço por cliente
-- Aplicar no Supabase SQL Editor

-- ── 1. Dados bancários do fornecedor ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_bank_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL UNIQUE REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bank_name    TEXT,
  bank_code    TEXT,        -- código COMPE (3 dígitos)
  bank_agency  TEXT,
  bank_account TEXT,
  account_type TEXT CHECK (account_type IN ('corrente','poupanca')),
  pix_key      TEXT,
  verified_by  UUID REFERENCES auth.users(id),
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sba_admin"    ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "sba_supplier" ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "sba_client"   ON public.supplier_bank_accounts;

CREATE POLICY "sba_admin" ON public.supplier_bank_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "sba_supplier" ON public.supplier_bank_accounts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    JOIN public.user_roles ur ON ur.supplier_id = s.id AND ur.user_id = auth.uid() AND ur.role = 'SUPPLIER'
    WHERE s.id = supplier_id
  ));

CREATE POLICY "sba_client" ON public.supplier_bank_accounts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invitations i
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = i.client_id
    WHERE i.supplier_id = supplier_bank_accounts.supplier_id
  ));

-- ── 2. Dados financeiros do fornecedor (DRE por ano) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_financials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  receita     NUMERIC(18,2),
  ativo       NUMERIC(18,2),
  passivo     NUMERIC(18,2),
  lucro       NUMERIC(18,2),
  ebitda      NUMERIC(18,2),
  estoque     NUMERIC(18,2),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, year)
);

ALTER TABLE public.supplier_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sf_admin"    ON public.supplier_financials;
DROP POLICY IF EXISTS "sf_supplier" ON public.supplier_financials;
DROP POLICY IF EXISTS "sf_client"   ON public.supplier_financials;

CREATE POLICY "sf_admin" ON public.supplier_financials FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "sf_supplier" ON public.supplier_financials FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    JOIN public.user_roles ur ON ur.supplier_id = s.id AND ur.user_id = auth.uid() AND ur.role = 'SUPPLIER'
    WHERE s.id = supplier_id
  ));

CREATE POLICY "sf_client" ON public.supplier_financials FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invitations i
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = i.client_id
    WHERE i.supplier_id = supplier_financials.supplier_id
  ));

-- ── 3. Preço de homologação por cliente ───────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS homologation_price  NUMERIC(10,2) DEFAULT 390.00,
  ADD COLUMN IF NOT EXISTS homologation_payer  TEXT DEFAULT 'supplier'
    CHECK (homologation_payer IN ('supplier','client'));

-- ── 4. Aprovação por categoria ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_category_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  seal_id          UUID NOT NULL REFERENCES public.seals(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES public.categories(id),
  status           TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACTIVE','REJECTED','SUSPENDED')),
  approved_by      UUID REFERENCES auth.users(id),
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, category_id)
);

ALTER TABLE public.supplier_category_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sca_admin"         ON public.supplier_category_approvals;
DROP POLICY IF EXISTS "sca_supplier_read" ON public.supplier_category_approvals;

CREATE POLICY "sca_admin" ON public.supplier_category_approvals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "sca_supplier_read" ON public.supplier_category_approvals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'SUPPLIER'
    WHERE s.id = supplier_id AND s.user_id = auth.uid()
  ));

-- ── 5. Motivos de recusa parametrizados ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rejection_reasons (
  id         SERIAL PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  label      TEXT NOT NULL,
  applies_to TEXT DEFAULT 'both' CHECK (applies_to IN ('document','seal','both')),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rejection_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rr_read"  ON public.rejection_reasons;
DROP POLICY IF EXISTS "rr_admin" ON public.rejection_reasons;

CREATE POLICY "rr_read"  ON public.rejection_reasons FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rr_admin" ON public.rejection_reasons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

-- Seed inicial — dados completos virão do CSV do usuário
-- Motivos genéricos para já ter algo funcional no sistema
INSERT INTO public.rejection_reasons (code, label, applies_to) VALUES
  ('DOC_ILEGIVEL',        'Documento ilegível ou com baixa qualidade',          'document'),
  ('DOC_VENCIDO',         'Documento vencido',                                  'document'),
  ('DOC_INCORRETO',       'Tipo de documento incorreto ou divergente',           'document'),
  ('DOC_DADOS_DIVERGENTES','Dados divergentes dos registros cadastrais',         'document'),
  ('DOC_SEM_ASSINATURA',  'Documento sem assinatura ou autenticação exigida',    'document'),
  ('DOC_INCOMPLETO',      'Documento incompleto ou com informações faltando',    'document'),
  ('SEAL_SANCAO_ATIVA',   'Empresa consta em listas de sanções ativas (CEIS/CNEP)', 'seal'),
  ('SEAL_CNPJ_IRREGULAR', 'CNPJ com situação cadastral irregular na Receita Federal', 'seal'),
  ('SEAL_DOCS_INSUFICIENTES', 'Documentação insuficiente para aprovação',        'seal'),
  ('SEAL_INADIMPLENTE',   'Pendências fiscais ou trabalhistas impeditivas',      'seal'),
  ('OUTRO',               'Outro motivo (especificar)',                          'both')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, applies_to = EXCLUDED.applies_to;

-- ── 6. Multi-usuário por fornecedor ───────────────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_primary  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invited_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT true;

-- Marcar usuários SUPPLIER existentes como master/primário
UPDATE public.user_roles SET is_primary = true, is_active = true
WHERE role = 'SUPPLIER' AND is_primary IS DISTINCT FROM true;

-- Trigger: limite de 4 usuários ativos por fornecedor
CREATE OR REPLACE FUNCTION public.fn_check_supplier_user_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'SUPPLIER' AND NEW.is_active = true THEN
    IF (SELECT COUNT(*) FROM public.user_roles
        WHERE supplier_id = NEW.supplier_id AND role = 'SUPPLIER' AND is_active = true
          AND id IS DISTINCT FROM NEW.id) >= 4 THEN
      RAISE EXCEPTION 'Limite de 4 usuários por fornecedor atingido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_user_limit ON public.user_roles;
CREATE TRIGGER trg_supplier_user_limit
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_supplier_user_limit();

-- ── 7. Pricing model nos selos ────────────────────────────────────────────────
ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS seal_type      TEXT CHECK (seal_type IN ('verificado','homologado')),
  ADD COLUMN IF NOT EXISTS billing_cycle  TEXT DEFAULT 'anual' CHECK (billing_cycle IN ('anual','mensal')),
  ADD COLUMN IF NOT EXISTS reputation_tier TEXT CHECK (reputation_tier IN ('bronze','prata','ouro'));

-- Migração: selos existentes → nova nomenclatura
UPDATE public.seals SET seal_type = 'verificado' WHERE seal_type IS NULL AND level = 'Simples';
UPDATE public.seals SET seal_type = 'homologado' WHERE seal_type IS NULL AND level IN ('Premium','HOC');
UPDATE public.seals SET seal_type = 'homologado' WHERE seal_type IS NULL;

-- Migração plans: remove constraint legado e atualiza valores
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Descobre o nome do CHECK constraint em plans.type (pode variar por ambiente)
  SELECT conname INTO v_constraint
  FROM   pg_constraint
  WHERE  conrelid = 'public.plans'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%type%Simples%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.plans DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

-- Amplia o constraint para aceitar os novos valores
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_type_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_type_check
  CHECK (type IN ('Simples','Premium','verificado','homologado','HOC'));

-- Migra os dados
UPDATE public.plans SET type = 'verificado' WHERE type = 'Simples';
UPDATE public.plans SET type = 'homologado' WHERE type IN ('Premium','HOC');

-- Agora restringe apenas aos novos valores
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_type_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_type_check
  CHECK (type IN ('verificado','homologado'));

-- ── 8. RFQ estendido para CLIENT ──────────────────────────────────────────────
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS client_id      UUID REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS title          TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS category_id    INTEGER REFERENCES public.categories(id),
  ADD COLUMN IF NOT EXISTS deadline       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requester_role TEXT DEFAULT 'BUYER'
    CHECK (requester_role IN ('BUYER','CLIENT'));

CREATE TABLE IF NOT EXISTS public.rfq_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  message     TEXT,
  price       NUMERIC(18,2),
  status      TEXT DEFAULT 'SENT' CHECK (status IN ('SENT','READ','ACCEPTED','DECLINED')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rfq_id, supplier_id)
);

ALTER TABLE public.rfq_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rfqr_admin"    ON public.rfq_responses;
DROP POLICY IF EXISTS "rfqr_supplier" ON public.rfq_responses;
DROP POLICY IF EXISTS "rfqr_client"   ON public.rfq_responses;

CREATE POLICY "rfqr_admin" ON public.rfq_responses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "rfqr_supplier" ON public.rfq_responses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    JOIN public.user_roles ur ON ur.supplier_id = s.id AND ur.user_id = auth.uid()
    WHERE s.id = supplier_id
  ));

CREATE POLICY "rfqr_client" ON public.rfq_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.rfqs r
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'CLIENT' AND ur.client_id = r.client_id
    WHERE r.id = rfq_id
  ));

-- ── 9. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sba_supplier       ON public.supplier_bank_accounts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sf_supplier_year   ON public.supplier_financials(supplier_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_sca_supplier       ON public.supplier_category_approvals(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sca_seal           ON public.supplier_category_approvals(seal_id);
CREATE INDEX IF NOT EXISTS idx_rfqr_rfq           ON public.rfq_responses(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfqr_supplier      ON public.rfq_responses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_seals_seal_type    ON public.seals(seal_type);

DO $$
BEGIN
  RAISE NOTICE 'patch_023 aplicado com sucesso';
  RAISE NOTICE '  supplier_bank_accounts: %', (SELECT COUNT(*) FROM public.supplier_bank_accounts);
  RAISE NOTICE '  supplier_financials: %',    (SELECT COUNT(*) FROM public.supplier_financials);
  RAISE NOTICE '  rejection_reasons: %',      (SELECT COUNT(*) FROM public.rejection_reasons);
  RAISE NOTICE '  seals migrados: % verificado / % homologado',
    (SELECT COUNT(*) FROM public.seals WHERE seal_type = 'verificado'),
    (SELECT COUNT(*) FROM public.seals WHERE seal_type = 'homologado');
END $$;
