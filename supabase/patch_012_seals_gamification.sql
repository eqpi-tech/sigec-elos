-- patch_012_seals_gamification.sql
-- Transforma seals de 1-por-fornecedor para 1-por-fornecedor-por-cliente
-- Necessário para o modelo de carteira de selos (gamificação)

-- ── 1. Remover UNIQUE(supplier_id) da tabela seals ──────────────────────────
-- O constraint antigo impede múltiplos selos por fornecedor
ALTER TABLE public.seals DROP CONSTRAINT IF EXISTS seals_supplier_id_key;

-- ── 2. Adicionar colunas de gamificação ─────────────────────────────────────
ALTER TABLE public.seals
  ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seal_name  TEXT;           -- ex: "Simples", "Premium – CSN"

-- ── 3. Nova UNIQUE: um selo por combinação fornecedor + cliente ──────────────
-- client_id NULL = selo Simples (self-registered)
-- Para suportar NULL no UNIQUE usamos index parcial
CREATE UNIQUE INDEX IF NOT EXISTS seals_supplier_client_unique
  ON public.seals (supplier_id, client_id)
  WHERE client_id IS NOT NULL;

-- Apenas um selo Simples (client_id NULL) por fornecedor
CREATE UNIQUE INDEX IF NOT EXISTS seals_supplier_simples_unique
  ON public.seals (supplier_id)
  WHERE client_id IS NULL;

-- ── 4. Popular seal_name em registros existentes ─────────────────────────────
UPDATE public.seals SET seal_name = level WHERE seal_name IS NULL;

-- ── 5. Ajuste RLS de seals ───────────────────────────────────────────────────
-- Manter admin total + fornecedor vê seus próprios + CLIENT vê selos dos seus fornecedores

DROP POLICY IF EXISTS "seals_select" ON public.seals;
DROP POLICY IF EXISTS "seals_insert" ON public.seals;
DROP POLICY IF EXISTS "seals_update" ON public.seals;

-- Admin: tudo
CREATE POLICY "seals_admin" ON public.seals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- Fornecedor: vê seus próprios selos
CREATE POLICY "seals_supplier_read" ON public.seals
  FOR SELECT USING (
    supplier_id IN (
      SELECT supplier_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'SUPPLIER'
    )
  );

-- CLIENT: vê selos dos fornecedores que convidou
CREATE POLICY "seals_client_read" ON public.seals
  FOR SELECT USING (
    client_id IN (
      SELECT client_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'CLIENT'
    )
    OR supplier_id IN (
      SELECT i.supplier_id FROM public.invitations i
      WHERE i.client_id IN (
        SELECT client_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'CLIENT'
      )
    )
  );

-- BUYER: vê selos ativos (para marketplace)
CREATE POLICY "seals_buyer_read" ON public.seals
  FOR SELECT USING (
    status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('BUYER','ADMIN')
    )
  );

-- CLIENT pode suspender selos dos seus fornecedores
CREATE POLICY "seals_client_suspend" ON public.seals
  FOR UPDATE USING (
    client_id IN (
      SELECT client_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'CLIENT'
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'patch_012 aplicado: seals agora suporta múltiplos selos por fornecedor (gamificação)';
END $$;
