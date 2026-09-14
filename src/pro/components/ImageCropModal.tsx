import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, Check } from 'lucide-react';
import { PRODUCT_MEDIA_ASPECT_RATIO } from '@/lib/supabaseSellerProducts';

// The crop frame's on-screen size — fixed (not viewport-scaled) so the same
// drag/zoom math works identically on phone, tablet and desktop; 320px wide
// comfortably fits the modal's own min width (384px card minus padding) at
// every screen size this app targets (390px and up).
const FRAME_W = 320;
const FRAME_H = FRAME_W / PRODUCT_MEDIA_ASPECT_RATIO;
// Baked at 4x the display size for print-quality e-commerce photos while
// keeping the JPEG output small enough to upload quickly.
const OUTPUT_W = FRAME_W * 4;
const OUTPUT_H = FRAME_H * 4;

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/**
 * The one crop tool used everywhere a product photo needs cropping — new
 * upload, re-crop of an already-saved photo, or the file picked to replace
 * one. The frame is fixed at Ezial's standard product-image ratio (see
 * PRODUCT_MEDIA_ASPECT_RATIO — the same ratio ProductCard and
 * ProductGallery render at, so what the vendor sees here is exactly what
 * every catalog surface will show, never a separate desktop/mobile crop).
 * A rule-of-thirds grid helps composition. The photo is always "cover"-fit
 * behind the frame and the drag offset is clamped to the frame's own
 * bounds, so the frame can never contain empty space. Built with plain
 * pointer events (unify mouse + single-finger touch) — no cropping
 * library, no new dependency.
 */
export default function ImageCropModal({ file, onCancel, onConfirm }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = naturalSize ? Math.max(FRAME_W / naturalSize.w, FRAME_H / naturalSize.h) : 1;
  const displayScale = baseScale * zoom;
  const displayW = naturalSize ? naturalSize.w * displayScale : FRAME_W;
  const displayH = naturalSize ? naturalSize.h * displayScale : FRAME_H;

  // The image always covers the frame at every zoom level (baseScale is a
  // "cover" fit, never "contain"), and offsets are clamped to the image's
  // own edges — together this makes an empty corner in the frame
  // impossible, whatever the source photo's original proportions.
  const clampOffset = (x: number, y: number) => ({
    x: Math.min(0, Math.max(FRAME_W - displayW, x)),
    y: Math.min(0, Math.max(FRAME_H - displayH, y)),
  });

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleZoom = (next: number) => {
    setZoom(next);
    setOffset((prev) => clampOffset(prev.x, prev.y));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Same offset/scale the vendor sees on screen, just rescaled from the
    // frame's display size to the output canvas's — so the saved file is
    // pixel-for-pixel what the frame showed, never an approximation.
    const factor = OUTPUT_W / FRAME_W;
    ctx.drawImage(img, offset.x * factor, offset.y * factor, displayW * factor, displayH * factor);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">Recadrer la photo</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>
        <p className="mb-3 text-xs text-ink/45">
          Format standard Ezial (4:5). Glissez à un doigt pour repositionner, utilisez le curseur pour zoomer — seul l'intérieur du cadre sera conservé.
        </p>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-ink/5 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{ width: FRAME_W, height: FRAME_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              className="absolute max-w-none cursor-grab active:cursor-grabbing"
              style={{ left: offset.x, top: offset.y, width: displayW, height: displayH }}
            />
          )}

          {/* Rule-of-thirds composition grid — purely visual, never
              intercepts the drag/zoom gestures underneath it. */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/70" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/70" />
            <div className="absolute top-1/3 left-0 w-full h-px bg-white/70" />
            <div className="absolute top-2/3 left-0 w-full h-px bg-white/70" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <ZoomIn size={15} className="text-ink/40" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(parseFloat(e.target.value))}
            className="w-full accent-burgundy"
          />
        </div>

        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1">Annuler</button>
          <button type="button" onClick={handleConfirm} disabled={!naturalSize} className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Check size={15} /> Valider
          </button>
        </div>
      </div>
    </div>
  );
}
