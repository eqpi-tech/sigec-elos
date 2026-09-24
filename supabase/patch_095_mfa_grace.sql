-- patch_095_mfa_grace.sql — carência de 30 dias para ativar o MFA (24/09)
-- Decisão: fornecedor/cliente/comprador têm 30 dias a partir do PRIMEIRO
-- acesso após o lançamento (gravado aqui pelo MfaGate); vencido o prazo, a
-- ativação vira obrigatória (sem "deixar para depois"). ADMIN não tem
-- carência. profiles_update (id = auth.uid()) já cobre a escrita própria.
alter table profiles add column if not exists mfa_grace_started_at timestamptz;
