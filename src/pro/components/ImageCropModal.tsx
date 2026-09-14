import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, Check } from 'lucide-react';

const FRAME_W = 280;
const FRAME_H = 350; // 4:5, matches ProductGallery's aspect ratio
const OUTPUT_W = 840;
const OUTPUT_H = 1050;

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/**
 * Post-upload crop/reposition step: the photo is shown "cover"-fit inside a
 * fixed 4:5 frame, draggable and zoomable, and only the frame's content is
 * baked into the final image on confirm. Built with plain pointer events —
 * no cropping library — so the modal has no new dependency.
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
    const factor = OUTPUT_W / FRAME_W;
    ctx.drawImage(img, offset.x * factor, offset.y * factor, displayW * factor, displayH * factor);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.9);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">Recadrer la photo</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>
        <p className="mb-3 text-xs text-ink/45">Glissez pour repositionner, utilisez le curseur pour zoomer.</p>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-ink/5"
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
