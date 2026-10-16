import { useState } from 'react';

export default function SmartImage({
  src,
  alt,
  className,
  loading = 'lazy',
  fetchPriority,
  fallbackSrc = `${import.meta.env.BASE_URL}ezial-fallback.webp`,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Pass 'high' for an image already visible on load (e.g. a product's
   * main photo) — 'lazy' loading on that same image tells the browser to
   * defer starting the fetch until it can confirm visibility, which delays
   * the page's largest visible image instead of prioritizing it. */
  fetchPriority?: 'high' | 'low' | 'auto';
  fallbackSrc?: string;
}) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Two failure modes `onError` alone misses: an empty/falsy `src` (some
  // browsers never fire `error` for `<img src="">` — it just renders
  // nothing, the exact "big empty rectangle" symptom) and a corrupted or
  // zero-byte file that "loads" (no network error) but decodes to 0×0 — a
  // truncated upload, for instance. Both are treated as real failures here
  // so the fallback only ever replaces a genuinely unavailable image, never
  // a slow-but-working one.
  const showFallback = errored || !src;
  // A subtle pulse while the real image is still in flight — a slow
  // connection (the iPad/Wi-Fi case already diagnosed elsewhere) otherwise
  // reads as "broken" for however long the request takes, even though
  // nothing is actually wrong. Never applied to the fallback itself (a
  // small local asset, effectively instant).
  const pulseClass = !loaded && !showFallback ? ' bg-ink/5 animate-pulse' : '';
  return (
    <img
      src={showFallback ? fallbackSrc : src}
      alt={alt}
      loading={loading}
      decoding="async"
      // React 18.3 doesn't special-case fetchPriority yet (unlike React 19),
      // so passing it as a JSX prop warns about an unrecognized DOM
      // attribute. The lowercase HTML attribute name sidesteps that.
      {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      onError={() => setErrored(true)}
      onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) setErrored(true); else setLoaded(true); }}
      className={`${className ?? ''}${pulseClass}`}
    />
  );
}
