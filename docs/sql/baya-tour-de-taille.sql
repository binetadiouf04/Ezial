-- Ezial — Baya : tour de taille enregistré avec chaque article commandé
-- À exécuter une fois dans Supabase → SQL Editor. Tout est dans une transaction :
-- en cas d'erreur, RIEN n'est modifié.
--
-- Pourquoi : create_order() recopie les options de la ligne depuis la VARIANTE
-- (selected_options), jamais depuis le panier. La mesure du client n'est pas une
-- variante (aucun effet sur le prix, le stock ou la commission) : elle est donc
-- transportée à part (payload items[].waistCm) et enregistrée dans
-- order_items.waist_cm.
--
-- Ce que fait cette migration :
-- 1. ajoute order_items.waist_cm (40 à 200 cm, une décimale) ;
-- 2. corrige create_order() par 5 remplacements ciblés (prix, commissions, stock,
--    livraison, promotions : AUCUNE autre ligne n'est touchée). Si la fonction a
--    changé depuis et qu'un remplacement ne trouve pas son repère, la migration
--    s'arrête avec un message clair, sans rien modifier.
--
-- Règle serveur : pour un produit bijoux / baya, la mesure est OBLIGATOIRE
-- (nombre entre 40 et 200, au plus une décimale), sinon la commande est refusée
-- (« Tour de taille invalide… »). Pour tout autre produit, la mesure envoyée est ignorée.

begin;

alter table public.order_items add column if not exists waist_cm numeric(4,1);
alter table public.order_items drop constraint if exists order_items_waist_cm_check;
alter table public.order_items add constraint order_items_waist_cm_check
  check (waist_cm is null or (waist_cm >= 40 and waist_cm <= 200));

do $patch$
declare
  v_new text := pg_get_functiondef('public.create_order(jsonb)'::regprocedure);
  v_pairs text[][] := array[
    -- 1. variable
    array[$a$v_shop_is_premium boolean;
$a$, $b$v_shop_is_premium boolean;
v_waist numeric;
$b$],
    -- 2. catégorie et sous-catégorie du produit
    array[$a$p.sale_mode,
s.status as shop_status,$a$, $b$p.sale_mode,
p.category,
p.subcategory,
s.status as shop_status,$b$],
    -- 3. validation de la mesure (Baya uniquement)
    array[$a$v_variant_id := nullif(v_item->>'variantId', '')::uuid;$a$, $b$v_waist := null;

if v_product.category = 'bijoux' and v_product.subcategory = 'baya' then
begin
v_waist := nullif(trim(v_item->>'waistCm'), '')::numeric;
exception when others then
v_waist := null;
end;

if v_waist is null
or v_waist < 40
or v_waist > 200
or v_waist <> round(v_waist, 1) then
raise exception 'Tour de taille invalide pour "%" (entre 40 et 200 cm).', v_product.name;
end if;
end if;

v_variant_id := nullif(v_item->>'variantId', '')::uuid;$b$],
    -- 4. colonne de la ligne de commande
    array[$a$commission_rate,
commission_amount
)
values (
v_order.id,
v_order_shop_id,$a$, $b$commission_rate,
commission_amount,
waist_cm
)
values (
v_order.id,
v_order_shop_id,$b$],
    -- 5. valeur de la ligne de commande
    array[$a$v_commission_rate,
v_item_commission
);$a$, $b$v_commission_rate,
v_item_commission,
v_waist
);$b$]
  ];
  i int;
begin
  if position('waist_cm' in v_new) > 0 then
    raise notice 'create_order() gère déjà waist_cm : rien à faire.';
    return;
  end if;
  for i in 1 .. array_length(v_pairs, 1) loop
    if (length(v_new) - length(replace(v_new, v_pairs[i][1], ''))) <> length(v_pairs[i][1]) then
      raise exception 'create_order() a changé : le repère % est introuvable ou n''est pas unique. Migration annulée, rien n''a été modifié.', i;
    end if;
    v_new := replace(v_new, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_new;
end
$patch$;

commit;

-- Vérification : « true » attendu deux fois, puis 0 ligne hors plage.
select
  position('v_waist' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) > 0 as create_order_a_jour,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'waist_cm') as colonne_ajoutee,
  (select count(*) from public.order_items where waist_cm is not null and (waist_cm < 40 or waist_cm > 200)) as lignes_hors_plage;
