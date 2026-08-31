import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import SmartImage from './SmartImage';

export interface HeroSlide {
  id: string;
  image: string;
  imagePosition?: string;
  eyebrow: string;
  title: string;
  ctaLabel: string;
  ctaRoute: string;
}

const AUTOPLAY_MS = 5500;

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { navigate } = useApp();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = slides.length;

  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 40) goTo(index - 1);
    else if (delta < -40) goTo(index + 1);
    touchStartX.current = null;
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-cream h-[280px] sm:h-[340px] md:h-[400px] lg:h-[440px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-label="Mise en avant EZIAL"
    >
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="relative h-full w-full flex-shrink-0">
            <SmartImage
              src={slide.image}
              alt={slide.title}
              loading="eager"
              className={`h-full w-full object-cover ${slide.imagePosition ?? 'object-center'}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">{slide.eyebrow}</p>
              <h2 className="font-display max-w-xs text-2xl font-semibold leading-tight text-white sm:max-w-sm sm:text-3xl lg:text-4xl">{slide.title}</h2>
              <button
                onClick={() => navigate(slide.ctaRoute)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-white sm:mt-4 sm:text-sm"
              >
                {slide.ctaLabel} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Slide précédent"
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Slide suivant"
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 sm:bottom-4">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Aller au slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
