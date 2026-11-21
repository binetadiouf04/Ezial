-- NON-RÉGRESSION : sans campagne active, les commandes (montants, commissions, lignes, ventes vendeurs, Orange Money
-- payée et impayée, cadeau, retrait) sont STRICTEMENT identiques à la production.
select tests.reset_promo();
select tests.check(tests.reference_scenario() = (select v from tests.reference), 'Non-régression : commandes sans promotion identiques à la production (7 scénarios + stock)');
select tests.reset_promo();
select tests.check((select v->'code_inconnu' from tests.reference) = '"Code promo invalide."', 'Non-régression : code inconnu, même message qu''en production');
