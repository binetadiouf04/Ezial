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
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Point = { x: number; y: number };
type Gesture =
  | { mode: 'pan'; lastX: number; lastY: number }
  | { mode: 'pinch'; lastDist: number }
  | null;

// Pure functions — no closure over component state — so they're safe to
// call from a stable, once-attached native event listener (see the wheel
// effect below) without ever going stale.
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const clampOffset = (x: number, y: number, w: number, h: number) => ({
  x: Math.min(0, Math.max(FRAME_W - w, x)),
  y: Math.min(0, Math.max(FRAME_H - h, y)),
});

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
 * ProductGallery render at). A rule-of-thirds grid helps composition.
 *
 * Touch: one finger pans, two fingers pinch-zoom (anchored under the
 * fingers, like any modern photo app) — the slider is a backup, never the
 * only way to zoom on a touchscreen. Desktop: mouse-drag pans, the wheel or
 * the slider zooms (the wheel anchored under the cursor). The photo is
 * always "cover"-fit behind the frame and every offset is clamped to the
 * frame's own bounds, so an empty corner inside the frame is impossible
 * regardless of gesture or starting proportions. `touch-action: none` is
 * scoped to the small frame element only, so page scroll is never affected
 * outside of it. Built with plain Pointer Events (one API for mouse, touch
 * and pen, and for tracking two simultaneous touches) — no cropping
 * library, no new dependency.
 */
export default function ImageCropModal({ file, onCancel, onConfirm }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<Gesture>(null);
  // Mirror the latest state in refs so gesture handlers (including the
  // native, once-attached wheel listener) always read the current value
  // without needing to be re-created — and without ever going stale.
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  const naturalSizeRef = useRef(naturalSize);
  zoomRef.current = zoom;
  offsetRef.current = offset;
  naturalSizeRef.current = naturalSize;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = naturalSize ? Math.max(FRAME_W / naturalSize.w, FRAME_H / naturalSize.h) : 1;
  const displayScale = baseScale * zoom;
  const displayW = naturalSize ? naturalSize.w * displayScale : FRAME_W;
  const displayH = naturalSize ? naturalSize.h * displayScale : FRAME_H;

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setOffset({ x: 0, y: 0 });
  };

  // Zooms to `newZoom` while keeping the image point currently under
  // `point` (frame-local coordinates) fixed on screen — the anchored-zoom
  // math every pinch, wheel or slider zoom in this modal shares, so
  // zooming never makes the image jump. Reads only refs, so it always sees
  // the latest state even when called from a listener attached once.
  const anchorZoomAt = (point: Point, newZoom: number) => {
    const ns = naturalSizeRef.current;
    if (!ns) return;
    const bScale = Math.max(FRAME_W / ns.w, FRAME_H / ns.h);
    const startDisplayScale = bScale * zoomRef.current;
    const newDisplayScale = bScale * newZoom;
    const off = offsetRef.current;
    const imgPointX = (point.x - off.x) / startDisplayScale;
    const imgPointY = (point.y - off.y) / startDisplayScale;
    const newW = ns.w * newDisplayScale;
    const newH = ns.h * newDisplayScale;
    const rawX = point.x - imgPointX * newDisplayScale;
    const rawY = point.y - imgPointY * newDisplayScale;
    setZoom(newZoom);
    setOffset(clampOffset(rawX, rawY, newW, newH));
  };
  const anchorZoomAtRef = useRef(anchorZoomAt);
  anchorZoomAtRef.current = anchorZoomAt;

  // Native, non-passive wheel listener: React's synthetic onWheel is
  // registered passive by default, so e.preventDefault() inside a JSX
  // onWheel silently does nothing (the page would scroll behind the modal
  // while the vendor tries to zoom). Attaching directly to the DOM node
  // with { passive: false } is the only way to actually intercept it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      anchorZoomAtRef.current(point, clampZoom(zoomRef.current * (1 - e.deltaY * 0.0015)));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const framePoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, framePoint(e));
    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) {
      gestureRef.current = { mode: 'pan', lastX: pts[0].x, lastY: pts[0].y };
    } else if (pts.length === 2) {
      gestureRef.current = { mode: 'pinch', lastDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, framePoint(e));
    const gesture = gestureRef.current;
    if (!gesture) return;
    const pts = [...pointersRef.current.values()];

    if (gesture.mode === 'pan' && pts.length === 1) {
      const dx = pts[0].x - gesture.lastX;
      const dy = pts[0].y - gesture.lastY;
      const off = offsetRef.current;
      setOffset(clampOffset(off.x + dx, off.y + dy, displayW, displayH));
      gesture.lastX = pts[0].x;
      gesture.lastY = pts[0].y;
    } else if (gesture.mode === 'pinch' && pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const ratio = gesture.lastDist > 0 ? dist / gesture.lastDist : 1;
      anchorZoomAt(mid, clampZoom(zoomRef.current * ratio));
      gesture.lastDist = dist;
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) {
      // Downgrade pinch → pan on the still-down finger, re-anchored to its
      // current position so releasing the second finger never jumps the image.
      gestureRef.current = { mode: 'pan', lastX: pts[0].x, lastY: pts[0].y };
    } else if (pts.length === 0) {
      gestureRef.current = null;
    }
  };

  const handleSliderZoom = (next: number) => {
    anchorZoomAt({ x: FRAME_W / 2, y: FRAME_H / 2 }, next);
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
          Format standard Ezial (4:5). Un doigt pour déplacer, pincez pour zoomer — seul l'intérieur du cadre sera conservé.
        </p>

        <div
          ref={frameRef}
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-ink/5 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{ width: FRAME_W, height: FRAME_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
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

        {/* Backup zoom control — pinch (touch) and the wheel (desktop)
            already zoom directly on the image, so this is never required,
            just an easier target on a mouse-driven desktop. */}
        <div className="mt-4 flex items-center gap-2.5">
          <ZoomIn size={15} className="text-ink/40" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleSliderZoom(parseFloat(e.target.value))}
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
