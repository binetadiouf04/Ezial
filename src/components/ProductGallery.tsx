import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import SmartImage from './SmartImage';

export interface GalleryMediaItem {
  url: string;
  type: 'image' | 'video';
}

// Responsive at every width, not just "mobile vs desktop": a fixed
// aspect-ratio (kept identical across breakpoints for visual consistency)
// combined with a max-height cap means the box never grows into a huge
// height just because it has more available width — the exact failure mode
// reported on iPad. object-cover guarantees the 4:5 box is always
// completely filled — no letterbox band on either side — for both a
// freshly-cropped (exactly 4:5) photo and a legacy photo whose stored file
// isn't exactly 4:5; ImageCropModal is what actually chooses what gets
// shown before that crop, so nothing is lost that the vendor didn't
// already frame out.
export default function ProductGallery({ media, alt }: { media: GalleryMediaItem[]; alt: string }) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = media.length;
  const current = media[active] ?? media[0];

  const goTo = (i: number) => setActive(((i % count) + count) % count);

  // Same safe swipe technique as HeroCarousel: only compares touchstart to
  // touchend clientX, never touches touchmove or preventDefault, so a
  // vertical scroll gesture is never intercepted — only a genuine
  // horizontal swipe changes the active slide (photo or video alike).
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 40) goTo(active - 1);
    else if (delta < -40) goTo(active + 1);
    touchStartX.current = null;
  };

  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-[420px] lg:max-w-[448px]">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-cream aspect-[4/5] max-h-[62vh] sm:max-h-[525px] lg:max-h-[560px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current.type === 'video' ? (
          <video
            key={active}
            src={current.url}
            className="h-full w-full object-cover fade-in"
            controls
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <SmartImage key={active} src={current.url} alt={alt} className="h-full w-full object-cover fade-in" loading="eager" fetchPriority="high" />
        )}

        {count > 1 && (
          <>
            <button
              onClick={() => goTo(active - 1)}
              aria-label="Média précédent"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => goTo(active + 1)}
              aria-label="Média suivant"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink backdrop-blur transition-colors hover:bg-white sm:flex"
            >
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-2.5 right-2.5 rounded-full bg-ink/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              {active + 1}/{count}
            </div>
          </>
        )}
      </div>

      {/* Discreet thumbnail strip — hidden on phone (no room, no value at
         that size), shown from sm+ where it genuinely helps navigation. */}
      {count > 1 && (
        <div className="mt-2.5 hidden gap-2 overflow-x-auto no-scrollbar sm:flex">
          {media.map((item, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Voir le média ${i + 1}`}
              className={`relative flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${active === i ? 'border-burgundy' : 'border-line hover:border-ink/20'}`}
            >
              {item.type === 'video' ? (
                <div className="flex h-14 w-14 items-center justify-center bg-ink/5">
                  <Play size={16} className="text-ink/60" />
                </div>
              ) : (
                <SmartImage src={item.url} alt="" className="h-14 w-14 object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
