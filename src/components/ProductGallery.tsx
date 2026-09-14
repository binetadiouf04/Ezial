import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SmartImage from './SmartImage';

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  const goTo = (i: number) => setActive(((i % count) + count) % count);

  // Same safe swipe technique as HeroCarousel: only compares touchstart to
  // touchend clientX, never touches touchmove or preventDefault, so a
  // vertical scroll gesture is never intercepted — only a genuine
  // horizontal swipe changes the active image.
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 40) goTo(active - 1);
    else if (delta < -40) goTo(active + 1);
    touchStartX.current = null;
  };

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {count > 1 && (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar lg:flex-col lg:overflow-visible">
          {images.map((img, i) => (
            <button key={i} onClick={() => setActive(i)} className={`flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${active === i ? 'border-burgundy' : 'border-line hover:border-ink/20'}`}>
              <SmartImage src={img} alt="" className="h-16 w-16 object-cover lg:h-20 lg:w-20" />
            </button>
          ))}
        </div>
      )}
      <div
        className="relative w-full h-[260px] overflow-hidden rounded-xl bg-cream sm:h-[340px] lg:h-[420px] lg:w-auto lg:flex-1"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <SmartImage key={active} src={images[active]} alt={alt} className="h-full w-full object-contain fade-in" />

        {count > 1 && (
          <>
            <button
              onClick={() => goTo(active - 1)}
              aria-label="Image précédente"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => goTo(active + 1)}
              aria-label="Image suivante"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
            >
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-burgundy' : 'w-1.5 bg-ink/25'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
