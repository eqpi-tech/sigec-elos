-- ════════════════════════════════════════════════════════════════════════════
-- SIGEC-ELOS — Corrige dados de sanções gravados antes do fix do filtro
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Zera o has_sanctions de todos os registros (serão recalculados ao re-fazer lookup)
--    Isso garante que na próxima consulta de CNPJ o flag seja recalculado corretamente
UPDATE public.cnpj_consultations
SET has_sanctions = FALSE
WHERE has_sanctions = TRUE;

-- 2. (Opcional) Se quiser ver quais fornecedores estavam com flag incorreto:
-- SELECT s.cnpj, s.razao_social, c.has_sanctions, c.consulted_at
-- FROM public.suppliers s
-- JOIN public.cnpj_consultations c ON c.supplier_id = s.id
-- WHERE c.has_sanctions = TRUE;

-- 3. Também zera sanctions_result na tabela de suppliers
UPDATE public.suppliers
SET sanctions_result = NULL
WHERE sanctions_result IS NOT NULL
  AND (
    sanctions_result->'ceis' IS NOT NULL
    OR sanctions_result->'cnep' IS NOT NULL
  );

SELECT
  COUNT(*) as total_consultations,
  COUNT(*) FILTER (WHERE has_sanctions = TRUE)  as with_sanctions,
  COUNT(*) FILTER (WHERE has_sanctions = FALSE) as without_sanctions
FROM public.cnpj_consultations;
