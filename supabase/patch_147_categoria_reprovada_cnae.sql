-- patch_147 — Categoria reprovada DENTRO do processo (16/10/2026)
--
-- Regra do Luiz (16/10): na validação do CNAE, categoria sem CNAE compatível
-- fica REPROVADA no processo — o processo segue; não se obriga a vincular
-- todas. As categorias são do cliente (ids por cliente), então a linha de
-- supplier_categories já é "a categoria deste processo".
-- Reprovada não aparece como homologada: certificado, perfil, busca por
-- categoria (marketplace) e candidatos de cotação passam a ignorá-la.

ALTER TABLE public.supplier_categories
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.marketplace_category_suppliers(cat_ids bigint[])
 RETURNS TABLE(supplier_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH sel AS (
    SELECT DISTINCT lower(trim(name)) AS nm FROM categories WHERE id = ANY(cat_ids)
  ), expanded AS (
    SELECT id FROM categories WHERE id = ANY(cat_ids)
    UNION
    SELECT c.id FROM categories c JOIN sel ON lower(trim(c.name)) = sel.nm
    WHERE c.client_id IS NOT NULL
  )
  SELECT DISTINCT sc.supplier_id
  FROM supplier_categories sc
  WHERE sc.category_id IN (SELECT id FROM expanded)
    AND sc.rejected_at IS NULL;   -- patch_147
$function$

;

CREATE OR REPLACE FUNCTION public.rfq_candidates(p_client uuid, p_category bigint, p_scope text)
 RETURNS TABLE(supplier_id uuid, own boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with proprios as (
    select distinct sc.supplier_id
    from supplier_categories sc
    join seals s on s.supplier_id = sc.supplier_id and s.status = 'ACTIVE' and s.client_id = p_client
    where sc.category_id = p_category and sc.rejected_at is null   -- patch_147
  ), nome as (
    select lower(trim(name)) nm from categories where id = p_category
  ), elos as (
    select distinct sc.supplier_id
    from categories c join nome on lower(trim(c.name)) = nome.nm
    join supplier_categories sc on sc.category_id = c.id
    join seals s on s.supplier_id = sc.supplier_id and s.status = 'ACTIVE'
    left join clients cl on cl.id = s.client_id
    where p_scope = 'elos' and (s.client_id is null or cl.active)    -- só processo operável (§7.8)
      and sc.rejected_at is null   -- patch_147
  )
  select supplier_id, true from proprios
  union
  select e.supplier_id, false from elos e where e.supplier_id not in (select supplier_id from proprios)
$function$

;
