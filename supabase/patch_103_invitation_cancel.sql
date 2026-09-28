-- patch_103_invitation_cancel.sql — cancelamento de convite (28/09)
-- O cliente cancela um convite enviado errado (ex.: para um e-mail interno);
-- por rastreabilidade o convite NÃO é apagado: fica CANCELLED com quando,
-- quem e por quê. O link deixa de valer (get-invitation / create-supplier
-- recusam CANCELLED) e o token é trocado — o original fica no audit_log.
alter table invitations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text;
