-- patch_096_reopen_seal_on_resubmit.sql — reabre o processo quando o
-- fornecedor reenvia documento após reprovação automática (25/09)
--
-- Bug encontrado no teste do CNPJ de vigilância (24/09): ao reprovar os
-- últimos documentos, a auto-finalização coloca o selo em SUSPENDED. Como
-- analysable_supplier_ids() só considera selos ACTIVE/PENDING, o fornecedor
-- DESAPARECE da tela de Análise de Documentos — e o reenvio dos documentos
-- corrigidos (status volta a PENDING) nunca reaparecia na esteira: processo
-- em limbo (reprovado, corrigido, invisível para o analista).
--
-- Correção: gatilho que devolve o selo a PENDING quando um documento entra
-- (ou volta) para análise. Escopo deliberadamente estreito:
--   · só selos SUSPENDED por REPROVAÇÃO AUTOMÁTICA (suspended_reason)
--   · nunca selos do HOC (hoc_process_id IS NOT NULL — o HOC manda no estado)
--   · nunca suspensão feita pelo CLIENTE (client_suspended_at)
-- Assim, o analista volta a ver o processo assim que o fornecedor corrige.

create or replace function public.reopen_seal_on_resubmit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- só quando o documento está (re)entrando em análise
  if new.status <> 'PENDING' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'PENDING'
     and old.storage_path is not distinct from new.storage_path then return new; end if;

  update seals se
     set status = 'PENDING',
         suspended_reason = null,
         updated_at = now()
   where se.supplier_id = new.supplier_id
     and se.status = 'SUSPENDED'
     and se.hoc_process_id is null
     and se.client_suspended_at is null
     and se.suspended_reason ilike 'Homologação reprovada automaticamente%';

  if found then
    insert into audit_log (user_id, action, entity_type, entity_id, metadata)
    values ((select auth.uid()), 'PROCESS_REOPENED', 'supplier', new.supplier_id,
            jsonb_build_object('motivo', 'documento reenviado após reprovação',
                               'document_type', new.type, 'document_label', new.label));
  end if;
  return new;
end $$;

drop trigger if exists trg_reopen_seal_on_resubmit on documents;
create trigger trg_reopen_seal_on_resubmit
  after insert or update on documents
  for each row execute function public.reopen_seal_on_resubmit();

-- Reparo pontual: processos já reprovados cujo fornecedor JÁ reenviou antes
-- deste patch (o gatilho só pega envios futuros).
update seals se
   set status = 'PENDING', suspended_reason = null, updated_at = now()
 where se.status = 'SUSPENDED'
   and se.hoc_process_id is null
   and se.client_suspended_at is null
   and se.suspended_reason ilike 'Homologação reprovada automaticamente%'
   and exists (select 1 from documents d
               where d.supplier_id = se.supplier_id and d.status = 'PENDING'
                 and coalesce(d.submitted_at, d.updated_at) > se.updated_at);
