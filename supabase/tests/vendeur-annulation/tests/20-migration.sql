-- Migration : seconde application sans aucun effet, droits, RLS.
do $$
declare v_diff integer;
begin
  select count(*) into v_diff from (
    select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)
    except select sig, h from tests.after_first) x;
  perform tests.check(v_diff = 0 and (select count(*) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)) = (select count(*) from tests.after_first),
    'idempotence : seconde application, aucune fonction ne change');
  perform tests.check(position('seller_cancel' in pg_get_functiondef('ezial_private.guard_order_shop_status()'::regprocedure)) > 0
    and position('seller_cancel' in pg_get_functiondef('public.lock_delivery_missions_identity_columns()'::regprocedure)) > 0
    and position('seller_cancel' in pg_get_functiondef('public.notify_customer_order_shop_status()'::regprocedure)) > 0
    and position('seller_cancel' in pg_get_functiondef('public.notify_seller_order_cancelled()'::regprocedure)) > 0
    and position('ensure_delivery_mission' in pg_get_functiondef('public.create_delivery_mission_when_ready()'::regprocedure)) > 0, 'les 5 fonctions de production portent la modification');
  perform tests.check((select count(*) from ezial_private.vendeur_annulation_saved_functions) = 5
    and not exists (select 1 from ezial_private.vendeur_annulation_saved_functions where position('seller_cancel' in def) > 0 or position('ensure_delivery_mission' in def) > 0),
    'copie d''origine : 5 fonctions, texte de production (jamais écrasée par la seconde application)');
  perform tests.check(not has_function_privilege('anon', 'public.seller_cancel_order_shop(uuid,text,text)', 'execute') and has_function_privilege('authenticated', 'public.seller_cancel_order_shop(uuid,text,text)', 'execute'),
    'droits : seller_cancel_order_shop refusée à anon, accordée aux connectés');
  perform tests.check(not has_function_privilege('anon', 'public.admin_refunds_to_make(text)', 'execute') and not has_function_privilege('anon', 'public.admin_mark_refunded(uuid,text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.admin_shop_cancellation_stats()', 'execute'), 'droits : fonctions admin refusées à anon');
  perform tests.check(not has_function_privilege('authenticated', 'ezial_private.ensure_delivery_mission(uuid)', 'execute') and not has_function_privilege('anon', 'ezial_private.ensure_delivery_mission(uuid)', 'execute'),
    'droits : ensure_delivery_mission inaccessible aux clients');
  perform tests.check((select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.seller_cancel_order_shop(uuid,text,text)'::regprocedure),
    'seller_cancel_order_shop : SECURITY DEFINER, search_path fixé');
  perform tests.check((select relrowsecurity from pg_class where oid = 'public.order_shop_cancellations'::regclass), 'RLS activée sur order_shop_cancellations');
  perform tests.check(not has_table_privilege('anon', 'public.order_shop_cancellations', 'select') and not has_table_privilege('authenticated', 'public.order_shop_cancellations', 'insert')
    and not has_table_privilege('authenticated', 'public.order_shop_cancellations', 'update') and not has_table_privilege('authenticated', 'public.order_shop_cancellations', 'delete'),
    'droits table : aucune écriture directe, anon sans accès');
  perform tests.check(not has_column_privilege('authenticated', 'public.order_shop_cancellations', 'refund_reference', 'select') and not has_column_privilege('authenticated', 'public.order_shop_cancellations', 'refund_method', 'select')
    and not has_column_privilege('authenticated', 'public.order_shop_cancellations', 'cancelled_by', 'select') and has_column_privilege('authenticated', 'public.order_shop_cancellations', 'reason', 'select'),
    'droits table : moyen, référence de remboursement et auteur invisibles pour vendeur et client');
end $$;
