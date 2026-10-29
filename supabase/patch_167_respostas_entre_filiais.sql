-- patch_167 — Questionário: respostas replicadas entre filiais (29/10/2026, pedido VIX
-- — ex.: BRMED e VIBRA, um CNPJ por filial). Decisão do Luiz: AUTOMÁTICA e editável.
-- · Resposta própria de um CNPJ é copiada para os outros CNPJs da MESMA RAIZ (8
--   primeiros caracteres) que ainda não responderam a pergunta, ou cuja resposta
--   também foi copiada (replicated_from preenchido). Resposta que a filial EDITOU
--   (replicated_from nulo) nunca é sobrescrita.
-- · Filial cadastrada depois recebe as respostas próprias das irmãs.
-- · SÓ DAQUI PARA FRENTE: nenhuma cópia retroativa — copiar as respostas atuais
--   para os 2.493 grupos de CNPJ (maioria do HOC) poderia jogar processos de uma
--   vez na análise e na cobrança dos subsidiados.
alter table questionnaire_answers add column if not exists replicated_from uuid references suppliers(id);

create or replace function public.cnpj_raiz(p text)
returns text language sql immutable as $$ select nullif(left(public.normalize_cnpj(p), 8), '') $$;

create or replace function public.trg_qa_replicar_filiais()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_raiz text;
begin
  if pg_trigger_depth() > 1 or new.replicated_from is not null then return new; end if;   -- só resposta própria
  select public.cnpj_raiz(cnpj) into v_raiz from suppliers where id = new.supplier_id;
  if v_raiz is null then return new; end if;
  insert into questionnaire_answers (question_id, supplier_id, answer_boolean, answer_text, answered_at, updated_at, replicated_from)
  select new.question_id, s.id, new.answer_boolean, new.answer_text, now(), now(), new.supplier_id
  from suppliers s where s.cnpj like v_raiz || '%' and s.id <> new.supplier_id   -- cnpj já é guardado normalizado (índice trigram)
  on conflict (question_id, supplier_id) do update
    set answer_boolean = excluded.answer_boolean, answer_text = excluded.answer_text,
        updated_at = now(), replicated_from = excluded.replicated_from
    where questionnaire_answers.replicated_from is not null;                                 -- editada pela filial: fica
  return new;
end $$;
drop trigger if exists trg_qa_replicar_filiais on questionnaire_answers;
create trigger trg_qa_replicar_filiais after insert or update of answer_boolean, answer_text, replicated_from
  on questionnaire_answers for each row execute function public.trg_qa_replicar_filiais();

create or replace function public.trg_supplier_herda_respostas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_raiz text := public.cnpj_raiz(new.cnpj);
begin
  if v_raiz is null then return new; end if;
  insert into questionnaire_answers (question_id, supplier_id, answer_boolean, answer_text, answered_at, updated_at, replicated_from)
  select distinct on (a.question_id) a.question_id, new.id, a.answer_boolean, a.answer_text, now(), now(), a.supplier_id
  from questionnaire_answers a join suppliers s on s.id = a.supplier_id
  where s.cnpj like v_raiz || '%' and s.id <> new.id and a.replicated_from is null
  order by a.question_id, a.updated_at desc nulls last
  on conflict (question_id, supplier_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_supplier_herda_respostas on suppliers;
create trigger trg_supplier_herda_respostas after insert on suppliers
  for each row execute function public.trg_supplier_herda_respostas();
