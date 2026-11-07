import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { getRecentlyViewedIds } from './browsingHistory';
import type { ShoppingSignals } from './productRanking';

// The visitor's own habits, for « Vous aimerez »: products bought (orders of
// the signed-in customer, already loaded in AppContext under RLS), favorites
// (account or this device), cart, and recently viewed products (this device).
export function useShoppingSignals(): ShoppingSignals {
  const { orders, favorites, cart } = useApp();
  return useMemo(() => ({
    purchasedIds: orders.flatMap((o) => o.items.map((item) => item.productId)),
    favoriteIds: favorites,
    cartIds: cart.map((item) => item.productId),
    viewedIds: getRecentlyViewedIds(),
  }), [orders, favorites, cart]);
}
