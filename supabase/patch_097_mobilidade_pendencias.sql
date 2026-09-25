-- patch_097_mobilidade_pendencias.sql — pendências de mobilidade visíveis
-- para o analista (25/09)
--
-- Problema: documento de PF que o fornecedor ainda NÃO enviou não tem linha
-- em documents, então não existe na esteira. Com todos os documentos PJ
-- aprovados e a mobilidade incompleta, o fornecedor sai da fila (nada
-- PENDING) e o processo fica em limbo — sem ninguém ver que falta a
-- documentação das pessoas. A auto-finalização já bloqueia o selo
-- (lib/required_docs.js mobilityPending), mas o analista não era avisado.
--
-- Esta função lista, por fornecedor com processo operável, quantas pessoas
-- faltam cadastrar e quantos documentos de PF exigidos não estão aprovados.
-- Mesma regra do servidor: escopo 'pessoa' por pessoa ativa, escopo 'posto'
-- por posto, e Registro da Arma (10017) só em posto armado.

create or replace function public.admin_mobility_pending()
returns jsonb language sql stable security definer set search_path = public as $$
with guard as (select public.is_admin() as ok),
postos as (
  select p.id, p.category_id, p.armado, p.qty_people, p.site_city, p.site_uf,
         p.funcao_label, s.id as supplier_id, s.razao_social, s.cnpj,
         coalesce(c.nome_fantasia, c.razao_social) as client_name
  from mobility_posts p
  join suppliers s on s.cnpj = p.supplier_cnpj
  left join clients c on c.id = p.client_id
  where p.active
    and exists (select 1 from seals se
                where se.supplier_id = s.id and se.status in ('PENDING','ACTIVE'))
),
pessoas as (select mp.id, mp.post_id from mobility_people mp where mp.active),
slots as (
  select po.supplier_id, 'mob:' || m.document_id || ':s:' || po.id as chave
  from postos po
  join category_mobility_documents m
    on m.category_id = po.category_id and m.required and m.escopo = 'posto'
  where m.document_id <> 10017 or po.armado
  union all
  select po.supplier_id, 'mob:' || m.document_id || ':p:' || pe.id
  from postos po
  join pessoas pe on pe.post_id = po.id
  join category_mobility_documents m
    on m.category_id = po.category_id and m.required and m.escopo = 'pessoa'
),
faltando as (
  select sl.supplier_id, count(*)::int as docs_missing
  from slots sl
  left join documents d on d.supplier_id = sl.supplier_id and d.type = sl.chave
  where coalesce(d.status, 'MISSING') not in ('VALID', 'NOT_APPLICABLE')
  group by 1
),
resumo as (
  select po.supplier_id, max(po.razao_social) as razao_social, max(po.cnpj) as cnpj,
         max(po.client_name) as client_name,
         count(*)::int as postos,
         sum(greatest(0, po.qty_people
             - (select count(*) from pessoas pe where pe.post_id = po.id)))::int as people_shortfall
  from postos po group by po.supplier_id
)
select case when not (select ok from guard) then jsonb_build_object('error', 'forbidden')
else coalesce((
  select jsonb_agg(jsonb_build_object(
           'supplier_id', r.supplier_id, 'razao_social', r.razao_social, 'cnpj', r.cnpj,
           'client_name', r.client_name, 'postos', r.postos,
           'people_shortfall', r.people_shortfall,
           'docs_missing', coalesce(f.docs_missing, 0))
         order by r.people_shortfall + coalesce(f.docs_missing, 0) desc)
  from resumo r left join faltando f on f.supplier_id = r.supplier_id
  where r.people_shortfall > 0 or coalesce(f.docs_missing, 0) > 0
), '[]'::jsonb) end
$$;

grant execute on function public.admin_mobility_pending() to authenticated;
