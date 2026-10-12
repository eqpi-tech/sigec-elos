-- patch_127 — Trava de gravação direta pelo navegador (12/10/2026)
-- Teste com usuários reais (transação desfeita) mostrou, pela chave pública:
--   • fornecedor APROVAVA o próprio documento (status VALID) ou criava já aprovado
--   • fornecedor mudava o status da própria empresa; qualquer conta registrava
--     o CNPJ de outra empresa (INSERT em suppliers)
--   • cliente ATIVAVA processo liberado sem análise e LIBERAVA processo não pago
-- Mapeamento do código: fora do backoffice (ADMIN) o navegador só grava
-- documentos direto; empresa, selos e planos vão pelas Netlify functions
-- (service_role). Regra: usuário final não-ADMIN não grava suppliers, seals e
-- plans; em documents só envia (PENDING/MISSING) — exceções que o produto já
-- tem: Apresentação da Empresa (aprovação automática), Inscrição Estadual/
-- Municipal declarada ISENTA e Cartão CNPJ/Simples vindos da Receita (AUTO).
-- service_role, SQL editor e scripts não mudam (is_end_user_request, patch_124).

-- 1. suppliers / seals / plans: só servidor ou ADMIN
CREATE OR REPLACE FUNCTION public.trg_block_end_user_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_end_user_request() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Alteração não permitida: % só é alterado pelo sistema', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_suppliers_end_user_guard ON public.suppliers;
CREATE TRIGGER trg_suppliers_end_user_guard BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_end_user_write();

DROP TRIGGER IF EXISTS trg_seals_end_user_guard ON public.seals;
CREATE TRIGGER trg_seals_end_user_guard BEFORE INSERT OR UPDATE OR DELETE ON public.seals
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_end_user_write();

DROP TRIGGER IF EXISTS trg_plans_end_user_guard ON public.plans;
CREATE TRIGGER trg_plans_end_user_guard BEFORE INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_end_user_write();

-- 2. documents: o fornecedor envia; quem decide é a análise
CREATE OR REPLACE FUNCTION public.trg_documents_end_user_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE dname text;
BEGIN
  IF NOT public.is_end_user_request() OR public.is_admin() THEN RETURN NEW; END IF;

  -- campos da análise nunca vêm do navegador
  IF TG_OP = 'UPDATE' AND (
       NEW.reviewed_by    IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_note    IS DISTINCT FROM OLD.review_note
    OR NEW.hoc_arquivo_id IS DISTINCT FROM OLD.hoc_arquivo_id
    OR NEW.supplier_id    IS DISTINCT FROM OLD.supplier_id
    -- validade e arquivo: só junto de um novo envio (volta para análise) —
    -- senão trocava o arquivo de um documento já aprovado
    OR (NEW.expires_at   IS DISTINCT FROM OLD.expires_at   AND NEW.status <> 'PENDING')
    OR (NEW.storage_path IS DISTINCT FROM OLD.storage_path AND NEW.status <> 'PENDING')) THEN
    RAISE EXCEPTION 'Alteração não permitida: dados da análise só mudam pelo backoffice'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.hoc_arquivo_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Alteração não permitida: dados da análise só mudam pelo backoffice'
      USING ERRCODE = '42501';
  END IF;

  -- status: enviar (PENDING) ou retirar (MISSING); decisão é da análise
  IF NEW.status IN ('PENDING', 'MISSING')
     OR (TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'VALID' THEN
    -- Apresentação da Empresa: aprovada automaticamente (sem revisão)
    IF NEW.type = 'presentation' THEN RETURN NEW; END IF;
    -- Cartão CNPJ (37) e Simples Nacional (62) vindos da Receita
    IF NEW.source = 'AUTO' AND NEW.type IN ('37', '62') THEN RETURN NEW; END IF;
    -- Inscrição Estadual/Municipal declarada isenta pelo fornecedor
    IF coalesce(NEW.metadata->>'isento', '') = 'true' AND NEW.type ~ '^\d+$' THEN
      SELECT lower(name) INTO dname FROM documents_catalog WHERE id = NEW.type::int;
      IF dname ~ '(inscri[cç][aã]o (estadual|municipal)|ie estadual|im municipal)' THEN RETURN NEW; END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'Alteração não permitida: o status do documento é definido pela análise'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_documents_end_user_guard ON public.documents;
CREATE TRIGGER trg_documents_end_user_guard BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_documents_end_user_guard();
