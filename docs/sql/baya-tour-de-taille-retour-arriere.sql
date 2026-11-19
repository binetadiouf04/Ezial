-- Retour arrière de baya-tour-de-taille.sql.
-- ATTENTION : supprime les tours de taille déjà enregistrés sur les commandes.
begin;
do $undo$
declare
  v_new text := pg_get_functiondef('public.create_order(jsonb)'::regprocedure);
begin
  v_new := replace(v_new, E'v_shop_is_premium boolean;\nv_waist numeric;\n', E'v_shop_is_premium boolean;\n');
  v_new := replace(v_new, E'p.sale_mode,\np.category,\np.subcategory,\ns.status as shop_status,', E'p.sale_mode,\ns.status as shop_status,');
  v_new := replace(v_new, E'commission_rate,\ncommission_amount,\nwaist_cm\n)', E'commission_rate,\ncommission_amount\n)');
  v_new := replace(v_new, E'v_commission_rate,\nv_item_commission,\nv_waist\n);', E'v_commission_rate,\nv_item_commission\n);');
  v_new := regexp_replace(v_new, E'v_waist := null;\n\nif v_product.category = ''bijoux'' and v_product.subcategory = ''baya'' then.*?end if;\nend if;\n\n(v_variant_id := nullif)', E'\\1', 's');
  execute v_new;
end
$undo$;
alter table public.order_items drop constraint if exists order_items_waist_cm_check;
alter table public.order_items drop column if exists waist_cm;
commit;
