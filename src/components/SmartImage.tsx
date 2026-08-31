import { useState } from 'react';

export default function SmartImage({
  src,
  alt,
  className,
  loading = 'lazy',
  fallbackSrc = '/ezial-fallback.webp',
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fallbackSrc?: string;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <img
      src={errored ? fallbackSrc : src}
      alt={alt}
      loading={loading}
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
