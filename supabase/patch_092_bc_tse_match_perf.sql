-- patch_092_bc_tse_knn.sql — BC Report (23/09)
-- bc_match_names('tse', ...) estourava o statement_timeout da API (~8s):
-- com o threshold trigram padrão (0.3), nomes brasileiros comuns casam
-- ~180k das 986k candidaturas via `%` e o recheck calcula similarity em
-- todas (12s/nome medido). Como o conector só considera sim >= 0.70, a
-- branch TSE passa a rodar com pg_trgm.similarity_threshold = 0.7 — o GIN
-- exige muito mais trigramas em comum e devolve ~1.5k candidatos (~1s/nome).
-- O ajuste fica num helper dedicado para NÃO alterar a sensibilidade das
-- listas de sanções (ofac/onu/pep seguem em 0.3). Supabase nega o SET de
-- GUC de extensão na definição da função ("permission denied to set
-- parameter"), então usa set_config com is_local=true — vale só até o fim
-- da transação, seguro com o pooler.
-- (GiST/KNN foi testado e descartado: 10-48s nesta base, mesmo com siglen=256.)

create or replace function public.bc_match_tse(p_query text, p_qnorm text)
returns table(query_name text, nome text, tipo text, extra text, sim real)
language plpgsql volatile as $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.7', true);
  return query
    select p_query, o.nome, o.cargo||' '||o.ano, o.partido||'/'||o.uf,
           similarity(o.nome_norm, p_qnorm)
    from ref_tse o
    where o.nome_norm % p_qnorm or o.nome_norm like '%'||p_qnorm||'%'
    order by similarity(o.nome_norm, p_qnorm) desc limit 5;
end $$;

create or replace function public.bc_match_names(p_list text, p_names text[])
returns table(query_name text, nome text, tipo text, extra text, sim real)
language plpgsql stable as $function$
declare qn text; qnorm text;
begin
  foreach qn in array p_names loop
    qnorm := bc_norm_name(qn);
    continue when length(qnorm) < 5;
    if p_list = 'ofac' then
      return query select qn, o.nome, o.tipo, o.programs, similarity(o.nome_norm, qnorm)
        from ref_ofac o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'onu' then
      return query select qn, o.nome, o.tipo, to_char(o.listed_on,'YYYY-MM-DD'), similarity(o.nome_norm, qnorm)
        from ref_onu o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'pep' then
      return query select qn, o.nome, coalesce(o.descricao_funcao, o.sigla_funcao), o.orgao, similarity(o.nome_norm, qnorm)
        from ref_pep o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    elsif p_list = 'tse' then
      return query select * from bc_match_tse(qn, qnorm);
    elsif p_list = 'icij' then
      return query select qn, o.nome, o.tipo||' · '||coalesce(o.fonte,''), o.pais, similarity(o.nome_norm, qnorm)
        from ref_icij o where o.nome_norm % qnorm or o.nome_norm like '%'||qnorm||'%'
        order by similarity(o.nome_norm, qnorm) desc limit 5;
    end if;
  end loop;
end $function$;

drop index if exists idx_ref_tse_trgm_gist;
