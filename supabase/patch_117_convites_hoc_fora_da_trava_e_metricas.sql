-- patch_117 — convites espelhados do HOC (patch_116) fora da trava de pagamento e
-- das métricas de uso do ELOS (05/10/2026)
--
-- trg_seal_payment_lock libera de graça o processo do cliente quando há convite
-- SUBSIDIADO do mesmo cliente/CNPJ. Com o histórico do HOC no banco, um fornecedor
-- subsidiado no HOC em 2021 renovaria no ELOS sem pagar. Só convite do ELOS libera.
-- admin_exec_dashboard mede convites enviados PELO ELOS — sem o histórico do HOC.
-- (client_exec_dashboard segue contando todos: são convites do próprio cliente.)

CREATE OR REPLACE FUNCTION public.trg_seal_payment_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.released_at is null and new.hoc_process_id is not null then
    new.released_at := coalesce(new.created_at, now());          -- HOC já vem pago/subsidiado
  end if;
  -- subsidiado (o cliente paga): processo do cliente nasce liberado, venha
  -- de onde vier (cadastro, convite em lote, ajuste do backoffice)
  if new.released_at is null and new.client_id is not null and exists (
       select 1 from invitations i
       where i.client_id = new.client_id and i.subsidiado
         and i.status not in ('CANCELLED','SUPERSEDED')
         and i.hoc_id is null   -- convite do HOC não libera processo do ELOS (patch_117)
         and (i.supplier_id = new.supplier_id
              or regexp_replace(coalesce(i.supplier_cnpj,''),'\D','','g')
                 = (select regexp_replace(cnpj,'\D','','g') from suppliers where id = new.supplier_id))) then
    new.released_at := now();
  end if;
  if new.status = 'ACTIVE' and new.released_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'ACTIVE') then
    raise exception 'Processo sem pagamento confirmado: o selo não pode ser emitido'
      using errcode = 'P0001', hint = 'payment_lock';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_exec_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'fornecedores', jsonb_build_object(
      'total',       (select count(*) from suppliers),
      'migrados',    (select count(*) from suppliers where hoc_id is not null),
      'espontaneos', (select count(*) from suppliers where hoc_id is null),
      'com_conta',   (select count(distinct ur.supplier_id) from user_roles ur
                      where ur.role = 'SUPPLIER' and ur.supplier_id is not null)),
    -- selos operáveis (cliente ativo ou ELOS) + fornecedores distintos ACTIVE
    'selos_por_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select s.status, count(*) n from seals s
            left join clients c on c.id = s.client_id
            where c.id is null or c.active is not false
            group by 1) s), '{}'::jsonb),
    'homologados_fornecedores', (
      select count(distinct s.supplier_id) from seals s
      left join clients c on c.id = s.client_id
      where s.status = 'ACTIVE' and (c.id is null or c.active is not false)),
    'homologados_por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object('cliente', nome, 'n', n) order by n desc)
      from (
        select coalesce(cl.nome_fantasia, cl.razao_social, 'ELOS') nome, count(*) n
        from seals s
        left join clients cl on cl.id = s.client_id
        where s.status = 'ACTIVE' and (cl.id is null or cl.active is not false)
        group by 1 order by 2 desc limit 8
      ) t), '[]'::jsonb),
    'usuarios', (
      select jsonb_build_object(
        'total',      count(*),
        'ativos_30d', count(*) filter (where last_sign_in_at >= now() - interval '30 days'),
        'nunca_logaram', count(*) filter (where last_sign_in_at is null))
      from auth.users),
    'acessos_por_semana', coalesce((
      select jsonb_agg(jsonb_build_object('semana', w, 'n', n) order by w)
      from (
        select date_trunc('week', last_sign_in_at)::date w, count(*) n
        from auth.users
        where last_sign_in_at >= now() - interval '12 weeks'
        group by 1
      ) t), '[]'::jsonb),
    'documentos', (
      select jsonb_build_object(
        'total',     count(*),
        'aprovados', count(*) filter (where status in ('VALID','NOT_APPLICABLE')),
        'aguardando_analise', count(*) filter (where status = 'PENDING'),
        'vencidos',  count(*) filter (where status = 'EXPIRED'))
      from documents),
    'convites', (
      select jsonb_build_object(
        'total', count(*),
        'ultimos_30d', count(*) filter (where created_at >= now() - interval '30 days'))
      from invitations where hoc_id is null),   -- uso do ELOS: sem o histórico do HOC (patch_117)
    'campanha', (
      select jsonb_build_object(
        'contas', count(*),
        'acessaram', count(*) filter (where last_sign_in_at is not null))
      from auth.users where raw_user_meta_data->>'campanha' is not null)
  ) into r;
  return r;
end $function$;
