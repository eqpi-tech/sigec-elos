-- patch_119 — fornecedor enxerga os próprios convites e questionários pelo vínculo
-- atual (user_roles), não só por profiles.supplier_id (06/10/2026)
--
-- STAGING primeiro (decisão do Luiz 06/10: produção não é tocada agora).
--
-- Caso: vixpar_fornecedor_4@ (Security, staging) não via o Questionário de
-- Compliance (DDQ) da VIX — e sem ele respondido o processo nunca entra na fila
-- (supplier_ready_for_analysis). Causa: 5 policies antigas reconhecem o
-- fornecedor só por profiles.supplier_id, e o cadastro atual liga usuário ↔
-- empresa por user_roles (modelo das equipes, patch_064). Sem esse vínculo o
-- fornecedor não via o próprio convite, o questionário, as perguntas, não
-- conseguia SALVAR respostas e não via o próprio relatório Assertiva.
--
-- Correção ADITIVA (policies permissivas novas; as antigas continuam): o
-- fornecedor é reconhecido por my_supplier_ids() (patch_064) e enxerga os
-- questionários dos clientes com quem tem convite OU processo (selo) — quem
-- entra pelo portal do cliente não tem convite. Nunca dados de outro fornecedor.

-- clientes do fornecedor logado: convites (do ELOS; do HOC só os que viraram
-- processo — patch_116) + processos (selos com cliente)
CREATE OR REPLACE FUNCTION public.my_supplier_client_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT i.client_id FROM invitations i
  WHERE i.supplier_id IN (SELECT my_supplier_ids()) AND i.client_id IS NOT NULL
    AND (i.hoc_id IS NULL OR i.status = 'REGISTERED')
  UNION
  SELECT s.client_id FROM seals s
  WHERE s.supplier_id IN (SELECT my_supplier_ids()) AND s.client_id IS NOT NULL
$fn$;
REVOKE ALL ON FUNCTION public.my_supplier_client_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_supplier_client_ids() TO authenticated;

DROP POLICY IF EXISTS invitations_supplier_team_read ON invitations;
CREATE POLICY invitations_supplier_team_read ON invitations FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT my_supplier_ids()));

DROP POLICY IF EXISTS questionnaires_supplier_team_read ON questionnaires;
CREATE POLICY questionnaires_supplier_team_read ON questionnaires FOR SELECT TO authenticated
  USING (client_id IN (SELECT my_supplier_client_ids()));

DROP POLICY IF EXISTS qq_supplier_team_read ON questionnaire_questions;
CREATE POLICY qq_supplier_team_read ON questionnaire_questions FOR SELECT TO authenticated
  USING (questionnaire_id IN (SELECT q.id FROM questionnaires q
                              WHERE q.active IS NOT false
                                AND q.client_id IN (SELECT my_supplier_client_ids())));

DROP POLICY IF EXISTS qa_supplier_team_own ON questionnaire_answers;
CREATE POLICY qa_supplier_team_own ON questionnaire_answers FOR ALL TO authenticated
  USING (supplier_id IN (SELECT my_supplier_ids()))
  WITH CHECK (supplier_id IN (SELECT my_supplier_ids()));

DROP POLICY IF EXISTS assertiva_supplier_team_own ON assertiva_reports;
CREATE POLICY assertiva_supplier_team_own ON assertiva_reports FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT my_supplier_ids()));
