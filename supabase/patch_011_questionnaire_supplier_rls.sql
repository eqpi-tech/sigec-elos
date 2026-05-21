-- patch_011_questionnaire_supplier_rls.sql
-- Corrige duas lacunas de RLS que impediam o fornecedor de ver questionários:
--   1. invitations: SUPPLIER não tinha policy de SELECT
--   2. questionnaires: SUPPLIER não tinha policy de SELECT
-- Ambas retornavam 0 linhas silenciosamente por falta de permissão.

-- ── 1. Fornecedor lê seus próprios convites ──────────────────────────────────
DROP POLICY IF EXISTS "invitations_supplier_read" ON public.invitations;
CREATE POLICY "invitations_supplier_read" ON public.invitations
  FOR SELECT USING (
    supplier_id IN (
      SELECT supplier_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── 2. Fornecedor lê questionários dos clientes que o convidaram ─────────────
DROP POLICY IF EXISTS "questionnaires_supplier_read" ON public.questionnaires;
CREATE POLICY "questionnaires_supplier_read" ON public.questionnaires
  FOR SELECT USING (
    client_id IN (
      SELECT i.client_id FROM public.invitations i
      WHERE i.supplier_id IN (
        SELECT supplier_id FROM public.profiles WHERE id = auth.uid()
      )
      AND i.client_id IS NOT NULL
    )
  );

-- ── 3. Corrige convites que foram criados sem client_id preenchido ───────────
-- Para o caso específico reportado. Adapte os IDs se necessário.
-- Se o convite foi criado pelo backoffice/buyer sem setar client_id,
-- este UPDATE corrige o registro existente.
--
-- Rode esta parte SEPARADAMENTE se quiser só os IDs específicos:
--
-- UPDATE public.invitations
-- SET    client_id = '24dfcb64-2e09-4d95-9b85-a57d3d5581cc'
-- WHERE  supplier_id = 'ff3f029a-bd23-4382-a9a8-ec21b6811c74'
--   AND  client_id IS NULL;
--
-- Ou, para corrigir TODOS os convites de um cliente específico de uma vez:
-- (útil quando o cliente enviou vários convites via backoffice)
--
-- UPDATE public.invitations i
-- SET    client_id = '24dfcb64-2e09-4d95-9b85-a57d3d5581cc'
-- FROM   public.buyers b
-- WHERE  i.buyer_id = b.id
--   AND  b.user_id IN (
--          SELECT user_id FROM public.clients
--          WHERE id = '24dfcb64-2e09-4d95-9b85-a57d3d5581cc'
--        )
--   AND  i.client_id IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'patch_011 aplicado: RLS de fornecedor corrigida para invitations e questionnaires';
END $$;
