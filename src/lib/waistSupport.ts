import { supabase } from './supabaseClient';

// La sous-catégorie Baya n'est proposée aux vendeurs (Ezial Pro) qu'une fois la
// base prête : colonne order_items.waist_cm et create_order() à jour
// (docs/sql/baya-tour-de-taille.sql). Sans cela, une commande de baya serait
// enregistrée SANS la mesure du client. Tant que la migration n'est pas
// exécutée, aucun produit Baya ne peut donc être créé ni commandé.
// Colonne absente → erreur 42703 ; toute autre erreur est traitée comme « non
// prêt » (et retentée au prochain affichage).
let cached: Promise<boolean> | null = null;

export function isWaistMeasureSupported(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      try {
        const { error } = await supabase.from('order_items').select('waist_cm').limit(0);
        if (!error) return true;
        if (error.code !== '42703') cached = null;
        return false;
      } catch {
        cached = null;
        return false;
      }
    })();
  }
  return cached;
}
