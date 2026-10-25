import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from './googleMaps';
import type { GeocodeResult } from './geocoding';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

// Shared live-search behavior for the address field on checkout and on the
// seller's shop location — debounced as the user types, always surfaced as
// a selectable list (never auto-applied) so a pause mid-typing never jumps
// the map out from under the user. CheckoutPage and SellerShop each keep
// their own applySearchResult (what happens once a result IS picked differs
// per page); this hook only owns the query -> suggestions part.
export function useAddressSearch() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [notice, setNotice] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current += 1;
      setResults(null);
      setError('');
      setNotice('');
      setSearching(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchPlaces(trimmed)
        .then(({ results: found, usedFallback }) => {
          if (requestIdRef.current !== requestId) return;
          if (found.length === 0) {
            setResults(null);
            setError('Adresse introuvable. Essayez avec le quartier, la commune ou un lieu connu à proximité, ou placez le repère directement sur la carte.');
            setNotice('');
          } else {
            setResults(found);
            setError('');
            setNotice(usedFallback ? 'Lieu exact non trouvé. Voici les résultats les plus proches.' : '');
          }
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setResults(null);
          setError('La recherche a échoué. Vérifiez votre connexion et réessayez, ou placez le repère directement sur la carte.');
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  function reset() {
    requestIdRef.current += 1;
    setQuery('');
    setResults(null);
    setError('');
    setNotice('');
    setSearching(false);
  }

  function clearResults() {
    requestIdRef.current += 1;
    setResults(null);
    setNotice('');
    setError('');
  }

  return { query, setQuery, searching, error, results, notice, reset, clearResults };
}
