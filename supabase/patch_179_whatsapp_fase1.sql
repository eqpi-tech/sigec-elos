-- patch_179 — WhatsApp como último recurso nos lembretes (Fase 1, 13/11/2026)
-- Decisões do Luiz: WhatsApp só para o TITULAR (Acesso Total), quando o processo
-- já recebeu 3 lembretes por e-mail e o fornecedor não fez nada desde o 1º
-- (não entrou, não enviou documento, não respondeu questionário); o 2º junto com
-- o 5º e-mail; máx. 2 por processo. Consentimento: Termos de Uso + "responda SAIR".
-- Esta fase prepara os dados e a regra; o envio (Twilio) é a Fase 2.

-- celular informado pelo fornecedor e saída do WhatsApp (resposta SAIR)
alter table public.suppliers add column if not exists celular_avisos text;
alter table public.suppliers add column if not exists whatsapp_optout_at timestamptz;

-- celular brasileiro normalizado (55 + DDD + 9 dígitos começando em 9) ou null
create or replace function public.celular_br(p text)
returns text language sql immutable as $$
  select case when d ~ '^55[1-9][0-9]9[0-9]{8}$' then d
              when d ~ '^[1-9][0-9]9[0-9]{8}$'   then '55' || d
              when d ~ '^0[1-9][0-9]9[0-9]{8}$'  then '55' || substr(d, 2) end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x
$$;

-- número do WhatsApp da empresa: celular informado > celular do convite >
-- celular do CNPJ na Receita. Nunca o telefone de sócio (LGPD). Null se pediu para sair.
create or replace function public.supplier_whatsapp_numero(p_supplier uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when s.whatsapp_optout_at is not null then null else coalesce(
           public.celular_br(s.celular_avisos),
           (select public.celular_br(i.telefone) from invitations i
             where i.supplier_id = s.id and public.celular_br(i.telefone) is not null
             order by i.created_at desc limit 1),
           public.celular_br(s.phone)) end
    from suppliers s where s.id = p_supplier
$$;
revoke all on function public.supplier_whatsapp_numero(uuid) from public, anon, authenticated;

-- "sem ação" desde uma data: nenhum login de usuário da empresa, nenhum
-- documento enviado pelo fornecedor e nenhuma resposta de questionário
create or replace function public.supplier_sem_acao_desde(p_supplier uuid, p_desde timestamptz)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select not exists (select 1 from user_roles ur join auth.users u on u.id = ur.user_id
                      where ur.supplier_id = p_supplier and ur.role = 'SUPPLIER' and u.last_sign_in_at > p_desde)
     and not exists (select 1 from documents d
                      where d.supplier_id = p_supplier and d.source = 'MANUAL'
                        and greatest(d.created_at, coalesce(d.submitted_at, d.created_at), coalesce(d.updated_at, d.created_at)) > p_desde)
     and not exists (select 1 from questionnaire_answers qa
                      where qa.supplier_id = p_supplier and coalesce(qa.answered_at, now()) > p_desde)
$$;
revoke all on function public.supplier_sem_acao_desde(uuid, timestamptz) from public, anon, authenticated;

-- prévia: processos que receberiam o WhatsApp hoje pela regra (a Fase 2 envia
-- com a mesma regra). Só service_role (rotina e conferência).
create or replace function public.whatsapp_previa()
returns table(seal_id uuid, supplier_id uuid, razao_social text, cliente text, lembretes int,
              primeiro_lembrete timestamptz, sem_acao boolean, numero text, motivo text)
language sql stable security definer set search_path = public as $$
  with h as (
    select a.entity_id seal_id, count(*)::int n, min(a.created_at) primeiro
      from audit_log a where a.action = 'DOC_PENDING_REMINDER' group by 1
  )
  select s.id, s.supplier_id, sp.razao_social, coalesce(c.nome_fantasia, c.razao_social), h.n, h.primeiro,
         public.supplier_sem_acao_desde(s.supplier_id, h.primeiro),
         public.supplier_whatsapp_numero(s.supplier_id),
         case when sp.whatsapp_optout_at is not null then 'pediu para sair'
              when public.supplier_whatsapp_numero(s.supplier_id) is null then 'sem celular'
              when not public.supplier_sem_acao_desde(s.supplier_id, h.primeiro) then 'agiu depois do 1º lembrete'
              else 'receberia' end
    from seals s
    join h on h.seal_id = s.id and h.n >= 3
    join suppliers sp on sp.id = s.supplier_id
    left join clients c on c.id = s.client_id
   where s.status = 'PENDING' and s.released_at is not null and coalesce(c.active, true)
$$;
revoke all on function public.whatsapp_previa() from public, anon, authenticated;
