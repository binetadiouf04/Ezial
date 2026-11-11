-- Retour arrière des notifications WhatsApp : retire déclencheurs, tâche
-- planifiée et fonctions. Les trois tables whatsapp_* sont CONSERVÉES
-- (historique et consentements) ; elles n'ont aucun effet sans les
-- déclencheurs. Pour les supprimer aussi, voir la dernière ligne (commentée).
begin;
drop trigger if exists trg_whatsapp_order_inserted on public.orders;
drop trigger if exists trg_whatsapp_order_updated on public.orders;
drop trigger if exists trg_whatsapp_out_for_delivery on public.delivery_missions;
select cron.unschedule('whatsapp-maintenance') where exists (select 1 from cron.job where jobname = 'whatsapp-maintenance');
drop function if exists ezial_private.trg_whatsapp_order_accepted();
drop function if exists ezial_private.trg_whatsapp_out_for_delivery();
drop function if exists ezial_private.whatsapp_on_order_accepted(uuid);
drop function if exists ezial_private.whatsapp_enqueue(text, text, uuid, uuid, uuid, uuid, text, interval);
drop function if exists public.whatsapp_maintenance();
drop function if exists public.whatsapp_claim_batch(integer);
drop function if exists public.whatsapp_message_context(uuid);
drop function if exists public.whatsapp_complete(uuid, text, text, text, text);
drop function if exists public.whatsapp_record_dispatch(text, boolean, text);
drop function if exists public.get_my_whatsapp_consent();
drop function if exists public.set_my_whatsapp_consent(boolean, text);
commit;
-- drop table public.whatsapp_notifications, public.whatsapp_consents, public.whatsapp_settings;
