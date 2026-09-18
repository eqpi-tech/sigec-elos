-- Seed dos branches de preview (Branching): dados mínimos de infraestrutura
-- que são LINHAS (não schema) e o app espera existir.

-- buckets de storage
insert into storage.buckets (id, name, public) values
  ('documents', 'documents', false),
  ('client-lp', 'client-lp', true),
  ('client-docs', 'client-docs', false),
  ('client-terms', 'client-terms', false),
  ('bc-reports', 'bc-reports', false)
on conflict (id) do nothing;
