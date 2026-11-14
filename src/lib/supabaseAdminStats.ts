import { supabase } from './supabaseClient';
import { isRpcMissing, type FeatureResult } from './supabaseFeatureDetect';
import { parseSalesStats, type AdminSalesStats, type StatsRange } from './adminStatsCore';

// Statistiques de ventes du tableau de bord administrateur. Toutes les
// valeurs viennent de la fonction SQL admin_sales_stats() (réservée aux
// administrateurs, voir docs/sql/admin-statistiques.sql) : aucune donnée de
// démonstration. Tant que la fonction n'est pas installée, la page garde son
// affichage simple.
export async function fetchAdminSalesStats(range: StatsRange): Promise<FeatureResult<{ stats: AdminSalesStats }>> {
  const { data, error } = await supabase.rpc('admin_sales_stats', { p_from: range.from, p_to: range.to });
  if (error) {
    if (isRpcMissing(error)) return { supported: false };
    return { supported: true, error: 'Impossible de charger les statistiques. Réessayez.' };
  }
  const stats = parseSalesStats(data);
  if (!stats) return { supported: true, error: 'Réponse inattendue du serveur. Réessayez.' };
  return { supported: true, stats };
}
