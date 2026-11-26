import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { LAUNCH_DATE_LABEL } from '@/shared/siteInfo.js';

// Ouverture des commandes : la date vient de la base (payment_settings.ordering_opens_at), qui refuse aussi toute commande
// avant cette date (déclencheur sur orders). Ce site ne fait qu'afficher l'état ; en cas de doute (lecture impossible),
// il laisse commander et c'est la base qui tranche.
export interface OrderingStatus { open: boolean; opensAt: string | null }

export async function fetchOrderingStatus(): Promise<OrderingStatus> {
  const { data, error } = await supabase.rpc('ordering_status');
  if (error || !data || typeof data !== 'object') return { open: true, opensAt: null };
  const d = data as { open?: unknown; opens_at?: unknown };
  return { open: d.open !== false, opensAt: typeof d.opens_at === 'string' ? d.opens_at : null };
}

/** null tant que la lecture n'est pas terminée. */
export function useOrderingStatus(): OrderingStatus | null {
  const [status, setStatus] = useState<OrderingStatus | null>(null);
  useEffect(() => { void fetchOrderingStatus().then(setStatus); }, []);
  return status;
}

export const ORDERING_CLOSED_TITLE = `Les commandes ouvrent le ${LAUNCH_DATE_LABEL}`;
export const ORDERING_CLOSED_TEXT = `Ezial ouvre officiellement le ${LAUNCH_DATE_LABEL}. Vous pouvez déjà parcourir les boutiques et remplir votre panier : il sera conservé, et vous pourrez payer et commander à partir de cette date.`;
