-- patch_121 — automação (Rota A/B) só em processo ORIGINADO NO ELOS (07/10/2026)
--
-- Regra do Luiz para a promoção staging → produção: enquanto o HOC opera, a
-- automação não pode tocar processos/documentos espelhados do HOC.
--
-- Brecha encontrada na Rota B: o gatilho trg_ai_review_enqueue só conferia
-- supplier_access_released(), que é verdadeiro para TODO fornecedor do HOC (selo
-- do HOC nasce liberado — patch_112). Quando o analista abre um documento do HOC,
-- get-hoc-file grava a cópia em storage_path → o gatilho enfileirava a IA para
-- Alvará/Licença de processo do HOC.
--
-- Agora a IA só entra para documento que NÃO veio do HOC (hoc_arquivo_id nulo)
-- de fornecedor com processo do ELOS aberto e liberado. A mesma função é usada
-- pelo processador (homolog-ai-review-background) e pelo pedido manual.

CREATE OR REPLACE FUNCTION public.supplier_has_open_elos_process(p_supplier uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM seals s
    WHERE s.supplier_id = p_supplier
      AND s.hoc_process_id IS NULL          -- originado no ELOS
      AND s.status = 'PENDING'              -- processo aberto
      AND s.released_at IS NOT NULL)        -- pago ou subsidiado (patch_112)
$fn$;
REVOKE ALL ON FUNCTION public.supplier_has_open_elos_process(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_has_open_elos_process(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_ai_review_enqueue()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.status <> 'PENDING' or new.storage_path is null
     or coalesce(new.source, 'MANUAL') = 'AUTO'          -- Rota A: veio da fonte oficial
     or new.hoc_arquivo_id is not null                    -- documento do HOC: nunca (patch_121)
     or new.type !~ '^\d+$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
     and old.status is not distinct from 'PENDING' then
    return new;                                           -- nada de novo para analisar
  end if;
  if not supplier_has_open_elos_process(new.supplier_id) then
    return new;                                           -- só processo do ELOS aberto e liberado
  end if;
  if not exists (select 1 from documents_catalog dc
                 where dc.id = new.type::int and dc.route = 'B' and dc.validation_mode <> 'manual') then
    return new;
  end if;
  update ai_review_jobs set status = 'skipped', last_error = 'arquivo substituído pelo fornecedor', finished_at = now()
   where document_id = new.id and status in ('queued','retry') and storage_path <> new.storage_path;
  insert into ai_review_jobs (supplier_id, document_id, doc_type, storage_path)
  values (new.supplier_id, new.id, new.type, new.storage_path)
  on conflict (document_id, storage_path) do nothing;
  return new;
end $function$;
