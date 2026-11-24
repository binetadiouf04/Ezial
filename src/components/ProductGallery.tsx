import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import SmartImage from './SmartImage';
import ProductVideo from './ProductVideo';

export interface GalleryMediaItem {
  url: string;
  type: 'image' | 'video';
  /** The photo's own small 240x300 crop, when one exists — used for the
   * thumbnail strip below so it never downloads N full-size gallery images
   * (~80-200 Ko each) just to render N 56px squares. Falls back to `url`. */
  thumbnailUrl?: string;
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
  // Couverture des vidéos : la première photo du produit (déjà chargée par la
  // fiche dans la plupart des cas). Voir ProductVideo.
  const firstPhotoIndex = media.findIndex((m) => m.type === 'image');
  const firstPhoto = firstPhotoIndex >= 0 ? media[firstPhotoIndex] : undefined;

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
    <div className="mx-auto w-full sm:max-w-[480px] lg:mx-0 lg:max-w-[540px]">
      <div
        className="relative w-full overflow-hidden rounded-lg bg-cream aspect-[4/5] max-h-[66vh] sm:max-h-[600px] lg:max-h-[675px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current.type === 'video' ? (
          <ProductVideo
            key={active}
            src={current.url}
            poster={firstPhoto?.url}
            title={alt}
            onShowPhotos={firstPhotoIndex >= 0 ? () => setActive(firstPhotoIndex) : undefined}
          />
        ) : (
          <>
            {/* The small crop (already in the browser from the product card) is shown,
               blurred, right away while the full photo downloads: the page never
               shows an empty box. The full photo then fades in over it. */}
            {current.thumbnailUrl && (
              <img src={current.thumbnailUrl} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />
            )}
            <SmartImage key={active} src={current.url} alt={alt} width={960} height={1200} className="relative h-full w-full object-cover fade-in" loading="eager" fetchPriority={active === 0 ? 'high' : undefined} />
          </>
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
            <div className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur">
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
              className={`relative flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors ${active === i ? 'border-burgundy' : 'border-transparent hover:border-ink/20'}`}
            >
              {item.type === 'video' ? (
                <div className="relative flex h-16 w-[52px] items-center justify-center bg-ink/5">
                  {firstPhoto && <SmartImage src={firstPhoto.thumbnailUrl || firstPhoto.url} alt="" width={240} height={300} className="absolute inset-0 h-full w-full object-cover opacity-70" />}
                  <Play size={16} fill="currentColor" className="relative text-burgundy" />
                </div>
              ) : (
                <SmartImage src={item.thumbnailUrl || item.url} alt="" width={240} height={300} className="h-16 w-[52px] object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
