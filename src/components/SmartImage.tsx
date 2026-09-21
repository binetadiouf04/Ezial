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
  return (
    <img
      src={errored ? fallbackSrc : src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
