-- PATCH 059: clients.active — espelha o 'ativo' do HOC (inativo ≠ excluído)
-- Cliente inativo no HOC NÃO é excluído do ELOS (histórico: selos ativos,
-- certificados verificáveis, matrizes migradas). O sync mantém o flag;
-- clientes ELOS-nativos (hoc_id NULL) são sempre ativos por padrão.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
