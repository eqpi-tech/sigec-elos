-- patch_130 — "Reprovado" separado de "Suspenso" (13/10/2026)
-- Homologação reprovada (automática, quando o último documento é revisado com
-- pendência, ou manual no backoffice) gravava só status SUSPENDED — fornecedor
-- e cliente viam "Suspenso" (pedido do Luiz: mostrar "Reprovado").
-- Marca: seals.rejection_reason (coluna já existente, até hoje sem uso).
-- Ao sair de SUSPENDED (reenvio, reabertura, reaprovação) a marca some
-- sozinha, para uma suspensão futura por outro motivo não aparecer como
-- reprovação.

CREATE OR REPLACE FUNCTION public.trg_seal_clear_rejection()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'SUSPENDED' THEN
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seal_clear_rejection ON public.seals;
CREATE TRIGGER trg_seal_clear_rejection BEFORE UPDATE ON public.seals
  FOR EACH ROW EXECUTE FUNCTION public.trg_seal_clear_rejection();

-- processos já reprovados automaticamente (motivo padrão do servidor)
UPDATE public.seals SET rejection_reason = suspended_reason
 WHERE status = 'SUSPENDED' AND rejection_reason IS NULL
   AND suspended_reason ILIKE 'Homologação reprovada%';
