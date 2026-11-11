-- patch_174 — Mobilização: um CPF ATIVO por posto (11/11/2026, chamado #755247)
-- A regra UNIQUE (post_id, cpf_digits) valia também para colaborador removido
-- (remover só faz active = false): quem removia e voltava a cadastrar a mesma
-- pessoa recebia "Este CPF já está cadastrado neste posto." e não havia como
-- reativar. Agora a unicidade vale só entre os ativos; o cadastro (api.js
-- mobilityApi.addPerson) reativa o registro removido, com os documentos dele.
alter table public.mobility_people drop constraint if exists mobility_people_post_id_cpf_digits_key;
create unique index if not exists mobility_people_post_cpf_ativo_uq
  on public.mobility_people (post_id, cpf_digits) where active;
