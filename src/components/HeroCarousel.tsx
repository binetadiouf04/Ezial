import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';

// Homepage hero banners. No overlay text: each banner is an image (one file
// per screen size) and the whole banner is the link. The frame takes the
// exact proportions of the format shown at that width, so an image is never
// stretched nor cropped:
//   phone  (< 768 px)        750 × 600
//   iPad   (768 – 1023 px)  1024 × 520
//   computer (≥ 1024 px)    1600 × 600
export interface HeroSlide {
  id: string;
  /** Text alternative of the banner (read by screen readers and search engines). */
  alt: string;
  /** Destination of the whole banner; none = not clickable. */
  route?: string;
  images: { mobile: string; tablet: string; desktop: string };
  /** object-position for a photo that is not cut to the exact formats. */
  imagePosition?: string;
}

const AUTOPLAY_MS = 5500;
const FALLBACK_IMAGE = `${import.meta.env.BASE_URL}ezial-fallback.webp`;

// Canonical href (static pages of categories and info pages end with a slash), so search
// engines follow the same URL the app navigates to.
function hrefFor(route: string): string {
  const [path, query] = route.split('?');
  const hasStaticPage = path.startsWith('/categorie/') || path.startsWith('/info/');
  const withSlash = hasStaticPage && !path.endsWith('/') ? `${path}/` : path;
  return query ? `${withSlash}?${new URLSearchParams(query).toString()}` : withSlash;
}

function BannerPicture({ slide, eager }: { slide: HeroSlide; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <img src={FALLBACK_IMAGE} alt={slide.alt} className="h-full w-full object-cover" />;
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={slide.images.desktop} width={1600} height={600} />
      <source media="(min-width: 768px)" srcSet={slide.images.tablet} width={1024} height={520} />
      <img
        src={slide.images.mobile}
        width={750}
        height={600}
        alt={slide.alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        // React 18.3 has no fetchPriority prop yet: the lowercase HTML attribute avoids the warning.
        {...(eager ? { fetchpriority: 'high' } : {})}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${slide.imagePosition ?? 'object-center'}`}
      />
    </picture>
  );
}

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { navigate } = useApp();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  // A swipe must change the banner, never open it.
  const swiped = useRef(false);
  const count = slides.length;

  // Which slides have ever actually needed to be shown — starts at just the
  // first one. Every slide sits side-by-side in the same flex row (shifted
  // out of view via transform), well within the browser's own lazy-load
  // margin, so `loading="lazy"` alone would still fetch all of them: not
  // mounting a slide's image until the carousel reaches it defers the request.
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => {
    setRevealedIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, [index]);

  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; swiped.current = false; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 40) { swiped.current = true; goTo(index - 1); }
    else if (delta < -40) { swiped.current = true; goTo(index + 1); }
    touchStartX.current = null;
  };

  const openBanner = (e: MouseEvent<HTMLAnchorElement>, route: string) => {
    e.preventDefault();
    if (swiped.current) { swiped.current = false; return; }
    navigate(route);
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-cream aspect-[750/600] md:aspect-[1024/520] lg:aspect-[1600/600]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Mise en avant EZIAL"
    >
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => {
          const current = i === index;
          const content = revealedIndices.has(i)
            ? <BannerPicture slide={slide} eager={i === 0} />
            : <div className="h-full w-full bg-cream" aria-hidden="true" />;
          return (
            <div
              key={slide.id}
              className="relative h-full w-full flex-shrink-0"
              role="group"
              aria-roledescription="bannière"
              aria-label={`${i + 1} sur ${count}`}
              aria-hidden={!current}
            >
              {slide.route ? (
                <a
                  href={hrefFor(slide.route)}
                  onClick={(e) => openBanner(e, slide.route as string)}
                  tabIndex={current ? 0 : -1}
                  className="block h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-burgundy/60"
                >
                  {content}
                </a>
              ) : (
                <div className="h-full w-full">{content}</div>
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Bannière précédente"
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-sm backdrop-blur transition-colors hover:bg-white sm:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Bannière suivante"
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-sm backdrop-blur transition-colors hover:bg-white sm:flex"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-ink/25 px-2 py-1.5 backdrop-blur-sm sm:bottom-4">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Afficher la bannière ${i + 1}`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/85'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
