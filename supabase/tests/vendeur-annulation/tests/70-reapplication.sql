-- Réapplication après retour arrière : tout refonctionne comme avant le retour (fonction, table conservée, mission).
select tests.reset_a();
do $$
declare o uuid; r jsonb;
begin
  o := tests.mk_paid('12');
  perform tests.ready('1', o); perform tests.ready('2', o);
  r := tests.cancel('2', o);
  perform tests.check((r->>'refund_amount')::int = 20000 and tests.stops(o) = 1 and tests.alerts(o) = 1 and tests.stock_of('f2') = 10, 'réapplication : annulation complète (remboursement, arrêt retiré, stock, alerte)');
  perform tests.check((select count(*) from ezial_private.vendeur_annulation_saved_functions) = 5 and not exists (select 1 from ezial_private.vendeur_annulation_saved_functions where position('seller_cancel' in def) > 0),
    'réapplication : copie d''origine de nouveau enregistrée (texte de production)');
  perform tests.check(tests.err('select public.admin_refunds_to_make()') = 'Accès réservé aux administrateurs.', 'réapplication : fonctions admin présentes et protégées');
end $$;
