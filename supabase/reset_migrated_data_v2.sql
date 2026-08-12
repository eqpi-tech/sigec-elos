-- ============================================================
-- RESET — Migração HOC v2 (ambiente de TESTES)
-- Limpa todos os dados de fornecedores/processos para a
-- reescrita completa. Executar APÓS patch_033 e ANTES do
-- migrate_hoc_v2.py.
--
-- PRESERVA: clients (upsert por hoc_id na v2 mantém user_id),
-- usuários EQPI (ADMIN/BUYER/CLIENT), árvore global de
-- categorias (client_id IS NULL), documents_catalog,
-- category_documents da árvore global, questionnaires,
-- rejection_reasons, banners, holidays, client_landing_pages,
-- client_document_flows, audit_log.
-- ============================================================

BEGIN;

-- ── Mundo fornecedor (filhos → pais) ────────────────────────
DELETE FROM document_history;
DELETE FROM documents;
DELETE FROM supplier_bank_accounts;
DELETE FROM supplier_financials;
DELETE FROM supplier_partners;
DELETE FROM supplier_sanctions_manual;
DELETE FROM assertiva_reports;
DELETE FROM questionnaire_answers;
DELETE FROM rfq_responses;
DELETE FROM rfqs;
DELETE FROM seals;
DELETE FROM plans;
DELETE FROM supplier_categories;
DELETE FROM supplier_category_approvals;
DELETE FROM cnpj_consultations;
DELETE FROM invitations;

-- Vínculos de usuário com fornecedor (contas de teste ficam sem papel SUPPLIER)
DELETE FROM user_roles WHERE role = 'SUPPLIER';
UPDATE profiles SET supplier_id = NULL WHERE supplier_id IS NOT NULL;

DELETE FROM suppliers;

-- ── Categorias custom por cliente (cascateia category_documents) ──
DELETE FROM categories WHERE client_id IS NOT NULL;

COMMIT;

-- Conferência pós-reset
SELECT 'suppliers' AS tabela, COUNT(*) FROM suppliers
UNION ALL SELECT 'seals', COUNT(*) FROM seals
UNION ALL SELECT 'documents', COUNT(*) FROM documents
UNION ALL SELECT 'supplier_categories', COUNT(*) FROM supplier_categories
UNION ALL SELECT 'categories_cliente', COUNT(*) FROM categories WHERE client_id IS NOT NULL
UNION ALL SELECT 'categories_globais', COUNT(*) FROM categories WHERE client_id IS NULL
UNION ALL SELECT 'clients (preservados)', COUNT(*) FROM clients;
