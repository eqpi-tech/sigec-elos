-- PATCH 061: mensagem do convite persistida
-- A mensagem personalizada era usada só no envio do e-mail e descartada —
-- reparos/lembretes não tinham como reproduzi-la.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS message text;
