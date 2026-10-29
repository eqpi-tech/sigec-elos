-- patch_165 — Relatório de status dos documentos (cliente) (29/10/2026, pedido VIX)
-- Uma linha por fornecedor × documento exigido no processo do cliente: situação,
-- vencimento, envio e motivo da reprovação. O cliente vem da sessão (auth.uid()),
-- nunca do navegador. Devolve JSON (um pacote só): a API corta "setof" em 1.000
-- linhas e um cliente grande passa de 10 mil. Processos inativados pelo próprio
-- cliente ficam de fora; documentos exigidos sem envio aparecem como MISSING.
create or replace function public.client_documents_status()
returns json language sql stable security definer set search_path = public as $$
  with me as (
    select ur.client_id as cid from user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'CLIENT' and ur.client_id is not null and coalesce(ur.is_active, true)
    limit 1
  ),
  s as (
    select s.id, s.supplier_id, s.status, s.flow_id, s.expires_at, s.rejection_reason, s.suspended_reason
    from seals s join me on s.client_id = me.cid
    where s.status in ('ACTIVE', 'PENDING', 'SUSPENDED') and s.client_suspended_at is null
  ),
  r as (select s.*, unnest(public.seal_required_doc_ids(s.id)) as doc_id from s)
  select coalesce(json_agg(json_build_object(
      'supplier_id', r.supplier_id, 'razao_social', sp.razao_social, 'cnpj', sp.cnpj,
      'seal_id', r.id, 'processo', r.status, 'flow_id', r.flow_id, 'processo_vence', r.expires_at::date,
      'doc_id', r.doc_id, 'documento', coalesce(d.label, dc.name), 'responsavel', dc.responsibility,
      'situacao', coalesce(d.status, 'MISSING'), 'vencimento', d.expires_at::date,
      'enviado_em', coalesce(d.submitted_at, d.created_at), 'analisado_em', d.reviewed_at,
      'motivo', case when d.status = 'REJECTED' then d.review_note end
    ) order by sp.razao_social, coalesce(d.label, dc.name)), '[]'::json)
  from r
  join suppliers sp on sp.id = r.supplier_id
  join documents_catalog dc on dc.id = r.doc_id
  left join documents d on d.supplier_id = r.supplier_id and d.type = r.doc_id::text
$$;
grant execute on function public.client_documents_status() to authenticated;
