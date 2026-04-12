-- ═══════════════════════════════════════════════════════════════════
-- SIGEC-ELOS · Schema Supabase v1.0
-- Cole este SQL no Supabase: SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

-- ── Tabela de perfis (vinculada ao auth.users) ───────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'SUPPLIER' CHECK (role IN ('SUPPLIER','BUYER','ADMIN')),
  name        TEXT,
  supplier_id UUID,
  buyer_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Fornecedores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cnpj             TEXT UNIQUE NOT NULL,
  razao_social     TEXT NOT NULL,
  nome_fantasia    TEXT,
  cnae_main        TEXT,
  cnae_list        TEXT[]  DEFAULT '{}',
  state            TEXT,
  city             TEXT,
  address          JSONB,
  phone            TEXT,
  employee_range   TEXT,
  revenue_range    TEXT,
  services         TEXT[]  DEFAULT '{}',
  certifications   TEXT[]  DEFAULT '{}',
  status           TEXT    DEFAULT 'PENDING'
                   CHECK (status IN ('ACTIVE','PENDING','SUSPENDED','INACTIVE')),
  sanctions_checked BOOLEAN DEFAULT FALSE,
  sanctions_result  JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- ── Selos ELOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  level            TEXT DEFAULT 'Simples' CHECK (level IN ('Simples','Premium','HOC')),
  status           TEXT DEFAULT 'PENDING'
                   CHECK (status IN ('ACTIVE','PENDING','SUSPENDED','EXPIRED')),
  score            INTEGER DEFAULT 0,
  issued_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  last_checked_at  TIMESTAMPTZ,
  suspended_reason TEXT,
  issued_by        UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Planos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  type               TEXT CHECK (type IN ('Simples','Premium')),
  cnae_count         INTEGER DEFAULT 3,
  price_yearly       DECIMAL(10,2),
  stripe_sub_id      TEXT,
  stripe_customer_id TEXT,
  stripe_session_id  TEXT,
  status             TEXT DEFAULT 'PENDING'
                     CHECK (status IN ('ACTIVE','PENDING','PAST_DUE','CANCELED','TRIALING')),
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Documentos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  label       TEXT,
  source      TEXT DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AUTO')),
  status      TEXT DEFAULT 'PENDING'
              CHECK (status IN ('VALID','EXPIRING','EXPIRED','MISSING','PENDING','REJECTED')),
  storage_path TEXT,
  public_url   TEXT,
  issued_at    TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES auth.users(id),
  review_note  TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Compradores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buyers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
  cnpj         TEXT,
  razao_social TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── RFQs (Cotações) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category    TEXT,
  message     TEXT,
  status      TEXT DEFAULT 'SENT'
              CHECK (status IN ('SENT','VIEWED','RESPONDED','CONVERTED','CLOSED')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Cache de consultas CNPJ ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cnpj_consultations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj          TEXT NOT NULL,
  supplier_id   UUID REFERENCES public.suppliers(id),
  cnpj_data     JSONB,
  sanctions_data JSONB,
  has_sanctions BOOLEAN DEFAULT FALSE,
  consulted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Log de auditoria ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

-- Auto-cria perfil quando um usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'SUPPLIER'),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-atualiza updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suppliers_updated_at  BEFORE UPDATE ON public.suppliers  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER seals_updated_at      BEFORE UPDATE ON public.seals      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER plans_updated_at      BEFORE UPDATE ON public.plans      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER documents_updated_at  BEFORE UPDATE ON public.documents  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER profiles_updated_at   BEFORE UPDATE ON public.profiles   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER rfqs_updated_at       BEFORE UPDATE ON public.rfqs       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnpj_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles
CREATE POLICY "profiles_own"   ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- suppliers
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin() OR (status = 'ACTIVE' AND public.get_user_role() IN ('BUYER','ADMIN'))
);
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

-- seals
CREATE POLICY "seals_select" ON public.seals FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()) OR status = 'ACTIVE'
);
CREATE POLICY "seals_insert" ON public.seals FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY "seals_update" ON public.seals FOR UPDATE USING (public.is_admin());

-- plans
CREATE POLICY "plans_select" ON public.plans FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY "plans_insert" ON public.plans FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY "plans_update" ON public.plans FOR UPDATE USING (public.is_admin());

-- documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT USING (
  public.is_admin() OR
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()) OR
  (status = 'VALID' AND public.get_user_role() = 'BUYER')
);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY "documents_update" ON public.documents FOR UPDATE USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);

-- buyers
CREATE POLICY "buyers_select" ON public.buyers FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "buyers_insert" ON public.buyers FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- rfqs
CREATE POLICY "rfqs_select" ON public.rfqs FOR SELECT USING (
  public.is_admin() OR
  EXISTS (SELECT 1 FROM public.buyers b WHERE b.id = buyer_id AND b.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY "rfqs_insert" ON public.rfqs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.buyers b WHERE b.id = buyer_id AND b.user_id = auth.uid())
);

-- cnpj_consultations (insert público para o onboarding funcionar sem auth)
CREATE POLICY "cnpj_insert" ON public.cnpj_consultations FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "cnpj_select" ON public.cnpj_consultations FOR SELECT USING (public.is_admin());

-- audit_log
CREATE POLICY "audit_admin" ON public.audit_log FOR ALL USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════
-- STORAGE: bucket 'documents' (criar no painel: Storage → New bucket)
-- Nome: documents | Private: true
-- Cole as policies abaixo em: Storage → documents → Policies
-- ═══════════════════════════════════════════════════════════════════
-- Policy SELECT: autenticados leem arquivos da própria pasta
-- (auth.uid()::text) = (storage.foldername(name))[1]
-- Policy INSERT: autenticados fazem upload na própria pasta
-- (auth.uid()::text) = (storage.foldername(name))[1]
-- Policy SELECT admin: admins leem tudo
-- public.is_admin() = true
