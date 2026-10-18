-- patch_150 — Portal do cliente sem novos cadastros (18/10/2026)
--
-- Cliente inativado que migrou só como histórico (virada da onda A, patch_149):
-- o HOC redireciona os fornecedores dele para o portal no ELOS, mas o portal não
-- pode oferecer "Iniciar Cadastro" (nem preços) de um cliente que não contrata
-- mais. Com accepts_registrations = false o portal mostra só o acesso de quem já
-- tem conta; o cadastro pelo portal também é recusado no servidor.

ALTER TABLE public.client_landing_pages
  ADD COLUMN IF NOT EXISTS accepts_registrations boolean NOT NULL DEFAULT true;

-- portais de cliente inativo: sem novos cadastros
UPDATE public.client_landing_pages lp SET accepts_registrations = false
  FROM public.clients c WHERE c.id = lp.client_id AND c.active = false AND lp.accepts_registrations;
