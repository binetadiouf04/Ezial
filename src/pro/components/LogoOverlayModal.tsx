import { useEffect, useRef, useState } from 'react';
import { X, Check, Upload, Move } from 'lucide-react';

const MAX_W = 300;
const MAX_H = 400;
const MAX_OUTPUT_W = 1600;
const DEFAULT_WIDTH_FRAC = 0.24;
const MIN_WIDTH_FRAC = 0.06;
const MAX_WIDTH_FRAC = 0.6;

export interface OverlayResult {
  compositeBlob: Blob;
  logoFile: File;
  overlay: { x: number; y: number; width: number; opacity: number };
}

interface Props {
  baseFile: File;
  onCancel: () => void;
  onConfirm: (result: OverlayResult) => void;
}

/**
 * Lets the vendor place a logo on top of a product photo: upload a logo,
 * drag it, resize it from its corner handle, adjust opacity, preview live,
 * then bake the composite on confirm. The frame is sized to exactly match
 * the base photo's own aspect ratio (contain-fit, no letterboxing), so the
 * overlay's x/y/width fractions apply identically to the small on-screen
 * preview and to the full-resolution output canvas.
 */
export default function LogoOverlayModal({ baseFile, onCancel, onConfirm }: Props) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [baseNatural, setBaseNatural] = useState<{ w: number; h: number } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoAspect, setLogoAspect] = useState(1); // h/w
  const [x, setX] = useState(1 - DEFAULT_WIDTH_FRAC - 0.03);
  const [y, setY] = useState(1 - DEFAULT_WIDTH_FRAC - 0.03);
  const [widthFrac, setWidthFrac] = useState(DEFAULT_WIDTH_FRAC);
  const [opacity, setOpacity] = useState(1);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; origX: number; origY: number; origW: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(baseFile);
    setBaseUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [baseFile]);

  useEffect(() => {
    if (!logoFile) { setLogoUrl(null); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const displayW = baseNatural ? Math.min(MAX_W, MAX_H * (baseNatural.w / baseNatural.h)) : MAX_W;
  const displayH = baseNatural ? displayW * (baseNatural.h / baseNatural.w) : MAX_H;
  const heightFrac = widthFrac * logoAspect * (displayW / displayH);

  const onLogoPick = (file: File | null) => {
    if (!file) return;
    setLogoFile(file);
    const img = new Image();
    img.onload = () => setLogoAspect(img.naturalHeight / img.naturalWidth);
    img.src = URL.createObjectURL(file);
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const onHandlePointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, origX: x, origY: y, origW: widthFrac };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / displayW;
    const dy = (e.clientY - drag.startY) / displayH;
    if (drag.mode === 'move') {
      const hFrac = drag.origW * logoAspect * (displayW / displayH);
      setX(clamp(drag.origX + dx, 0, 1 - drag.origW));
      setY(clamp(drag.origY + dy, 0, 1 - hFrac));
    } else {
      const nextW = clamp(drag.origW + dx, MIN_WIDTH_FRAC, Math.min(MAX_WIDTH_FRAC, 1 - drag.origX));
      setWidthFrac(nextW);
    }
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleConfirm = () => {
    const baseImg = baseImgRef.current;
    if (!baseImg || !baseNatural || !logoFile || !logoUrl) return;
    const outW = Math.min(MAX_OUTPUT_W, baseNatural.w);
    const outH = outW * (baseNatural.h / baseNatural.w);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0, outW, outH);

    const logoImg = new Image();
    logoImg.onload = () => {
      const logoW = widthFrac * outW;
      const logoH = logoW * logoAspect;
      ctx.globalAlpha = opacity;
      ctx.drawImage(logoImg, x * outW, y * outH, logoW, logoH);
      ctx.globalAlpha = 1;
      canvas.toBlob((blob) => {
        if (blob) onConfirm({ compositeBlob: blob, logoFile, overlay: { x, y, width: widthFrac, opacity } });
      }, 'image/jpeg', 0.92);
    };
    logoImg.src = logoUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">Logo sur la photo</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>

        {!logoFile ? (
          <label className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line cursor-pointer hover:border-burgundy/30 transition-colors">
            <Upload size={20} className="text-ink/30" />
            <span className="text-sm font-medium text-ink/60">Choisir un logo</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink/45 flex items-center gap-1.5"><Move size={12} /> Glissez le logo, tirez le coin pour le redimensionner.</p>
            <div
              className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-ink/5"
              style={{ width: displayW, height: displayH }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {baseUrl && (
                <img
                  ref={baseImgRef}
                  src={baseUrl}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain"
                  onLoad={(e) => setBaseNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}
              {logoUrl && (
                <div
                  className="absolute cursor-move border border-white/70"
                  style={{ left: x * displayW, top: y * displayH, width: widthFrac * displayW, height: heightFrac * displayH, opacity }}
                  onPointerDown={onHandlePointerDown('move')}
                >
                  <img src={logoUrl} alt="Logo" draggable={false} className="h-full w-full object-contain" />
                  <div
                    onPointerDown={onHandlePointerDown('resize')}
                    className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-burgundy"
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-ink/60">Opacité</label>
              <input type="range" min={0.2} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full accent-burgundy" />
            </div>

            <div className="mt-4 flex gap-2.5">
              <button type="button" onClick={onCancel} className="btn-secondary flex-1">Annuler</button>
              <button type="button" onClick={handleConfirm} disabled={!baseNatural} className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Check size={15} /> Valider
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
