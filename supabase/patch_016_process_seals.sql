-- patch_016_process_seals.sql
-- Trigger: cria automaticamente um seal por processo quando invitation.status → 'REGISTERED'
-- O banco já suporta multi-processo (seals.client_id + unique constraints do patch_012)
-- Este patch apenas automatiza a criação do seal ao aceitar o convite

-- ── 1. Função do trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_create_process_seal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dispara apenas na transição para REGISTERED com client_id preenchido
  IF NEW.status = 'REGISTERED'
     AND NEW.client_id IS NOT NULL
     AND NEW.supplier_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'REGISTERED')
  THEN
    INSERT INTO public.seals (supplier_id, client_id, status, level, seal_name)
    SELECT
      NEW.supplier_id,
      NEW.client_id,
      'PENDING',
      'Simples',
      'Processo ' || COALESCE(c.razao_social, 'Cliente')
    FROM public.clients c
    WHERE c.id = NEW.client_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Trigger na tabela invitations ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_create_process_seal ON public.invitations;
CREATE TRIGGER trg_auto_create_process_seal
  AFTER UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_create_process_seal();

-- ── 3. Backfill: convites REGISTERED existentes sem seal correspondente ─────
INSERT INTO public.seals (supplier_id, client_id, status, level, seal_name)
SELECT
  i.supplier_id,
  i.client_id,
  'PENDING',
  'Simples',
  'Processo ' || COALESCE(c.razao_social, 'Cliente')
FROM public.invitations i
JOIN public.clients c ON c.id = i.client_id
WHERE i.status = 'REGISTERED'
  AND i.client_id IS NOT NULL
  AND i.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.seals s
    WHERE s.supplier_id = i.supplier_id
      AND s.client_id   = i.client_id
  )
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  seal_count INT;
BEGIN
  SELECT COUNT(*) INTO seal_count FROM public.seals WHERE client_id IS NOT NULL;
  RAISE NOTICE 'patch_016 aplicado: % selos de processo ativo (client_id IS NOT NULL)', seal_count;
END $$;
