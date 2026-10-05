-- patch_116 — convites do HOC espelhados no ELOS, SÓ COMO HISTÓRICO (05/10/2026)
--
-- Os convites do HOC (tabela `convite`) nunca vieram para o ELOS: aba Convites
-- vazia, "Subsidiados" zerado e cadastros não concluídos invisíveis para MVV,
-- Appian e demais clientes migrados. A sincronização HOC→ELOS passa a espelhá-los
-- (hoc_id = convite.id), com regra rígida do Luiz (05/10):
--
--   CONVITE COM hoc_id NUNCA DISPARA NADA PELO ELOS — nem lembrete, nem reenvio,
--   nem cancelamento, nem vínculo automático, nem criação/liberação de processo.
--   O HOC tem processo ativo de lembretes; disparar daqui duplicaria.
--   Só convite criado no ELOS (hoc_id IS NULL) envia lembrete.
--
-- Mapeamento (scripts/sync_hoc_daily.py, entidade invitations):
--   F (finalizado) → REGISTERED · C (cancelado) → CANCELLED
--   P (pendente)   → SENT se criado nos últimos 12 meses, senão EXPIRED
-- token fica NULL (link de convite nunca existiu no ELOS para eles).

alter table invitations add column if not exists hoc_id          integer;
alter table invitations add column if not exists hoc_status      text;     -- P / F / C, como no HOC
alter table invitations add column if not exists hoc_origem      text;     -- I / E, como no HOC
alter table invitations add column if not exists hoc_processo_id integer;  -- convite.id_processo
create unique index if not exists invitations_hoc_id_key on invitations (hoc_id) where hoc_id is not null;

comment on column invitations.hoc_id is
  'convite.id do HOC. NOT NULL = espelho do HOC, só histórico: o ELOS nunca envia lembrete/reenvio/cancela/vincula (patch_116).';

-- gatilho 1: transição p/ REGISTERED cria processo — nunca para espelho do HOC
-- (o processo do HOC chega pela sincronização de selos)
CREATE OR REPLACE FUNCTION public.fn_auto_create_process_seal()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Dispara apenas na transição para REGISTERED com client_id preenchido
  IF NEW.status = 'REGISTERED'
     AND NEW.hoc_id IS NULL
     AND NEW.client_id IS NOT NULL
     AND NEW.supplier_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'REGISTERED')
  THEN
    INSERT INTO public.seals (supplier_id, client_id, status, level, seal_name)
    SELECT
      NEW.supplier_id,
      NEW.client_id,
      'PENDING',
      'Simples',
      'Processo ' || COALESCE(c.razao_social, 'Cliente')
    FROM public.clients c
    WHERE c.id = NEW.client_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- gatilho 2: convite subsidiado libera o processo (patch_112) — nunca para espelho do HOC
CREATE OR REPLACE FUNCTION public.trg_invitation_subsidy_release()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.hoc_id is null
     and new.subsidiado and new.supplier_id is not null and new.client_id is not null
     and new.status not in ('CANCELLED','SUPERSEDED') then
    update seals set released_at = now()
     where supplier_id = new.supplier_id and client_id = new.client_id and released_at is null;
  end if;
  return new;
end $function$;
