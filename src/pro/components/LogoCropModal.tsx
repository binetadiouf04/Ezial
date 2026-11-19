import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, RotateCcw, Loader2, Move } from 'lucide-react';
import { analyzeLogo, placeLogo, outputSide, DEFAULT_ADJUST, MIN_ZOOM, MAX_ZOOM, type LogoAdjust, type LogoAnalysis } from '@/lib/logoFit';

// Ajustement du logo de boutique. Contrairement aux photos et couvertures
// (ImageCropModal, recadrage classique), le logo est cadré AUTOMATIQUEMENT en
// entier : sa partie dessinée est centrée et tient dans la pastille ronde de la
// marketplace, avec des marges (fond du logo, ou transparent). Zoom et
// déplacement restent facultatifs ; « Réinitialiser » revient au cadrage
// automatique. L'aperçu et le fichier enregistré sont dessinés par la même
// fonction (drawLogo) : ce que le vendeur voit est exactement ce qui est envoyé.

const ANALYSIS_MAX = 256;

interface Loaded { img: HTMLImageElement; analysis: LogoAnalysis; sourceScale: number; small: LogoAnalysis }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawLogo(canvas: HTMLCanvasElement, side: number, loaded: Loaded, adjust: LogoAdjust) {
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, side, side);
  const bg = loaded.analysis.background;
  if (bg) {
    ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
    ctx.fillRect(0, 0, side, side);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const p = placeLogo(loaded.analysis, side, adjust);
  ctx.drawImage(loaded.img, p.x, p.y, p.width, p.height);
}

function LogoCanvas({ loaded, adjust, cssSize, className }: { loaded: Loaded; adjust: LogoAdjust; cssSize: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    drawLogo(ref.current, Math.round(cssSize * dpr), loaded, adjust);
  }, [loaded, adjust, cssSize]);
  return <canvas ref={ref} style={{ width: cssSize, height: cssSize }} className={className} aria-hidden="true" />;
}

export default function LogoCropModal({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (logoFile: File) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [adjust, setAdjust] = useState<LogoAdjust>(DEFAULT_ADJUST);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: LogoAdjust } | null>(null);
  const [stageSize, setStageSize] = useState(256);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    let cancelled = false;
    loadImage(url).then((img) => {
      if (cancelled) return;
      const w = img.naturalWidth || 512;
      const h = img.naturalHeight || 512;
      const ratio = Math.min(1, ANALYSIS_MAX / Math.max(w, h));
      const sw = Math.max(1, Math.round(w * ratio));
      const sh = Math.max(1, Math.round(h * ratio));
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(img, 0, 0, sw, sh);
      const small = analyzeLogo(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
      const s = w / sw;
      const analysis: LogoAnalysis = { ...small, width: w, height: h, centerX: small.centerX * s, centerY: small.centerY * s, radius: small.radius * s };
      setLoaded({ img, analysis, sourceScale: s, small });
    }).catch(() => { if (!cancelled) setError('Cette image ne peut pas être lue. Essayez un fichier PNG ou JPEG.'); });
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file]);

  // Taille de la zone d'ajustement (s'adapte à la largeur de l'écran).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: adjust };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !stageSize) return;
    const { x, y, start } = drag.current;
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    setAdjust({ ...start, offsetX: clamp(start.offsetX + (e.clientX - x) / stageSize), offsetY: clamp(start.offsetY + (e.clientY - y) / stageSize) });
  };
  const endDrag = () => { drag.current = null; };

  const confirm = useCallback(async () => {
    if (!loaded) return;
    setProcessing(true);
    setError('');
    try {
      const side = outputSide(loaded.small, loaded.sourceScale);
      const canvas = document.createElement('canvas');
      drawLogo(canvas, side, loaded, adjust);
      const transparent = loaded.analysis.transparent;
      const type = transparent ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error('blob');
      onConfirm(new File([blob], transparent ? 'logo.png' : 'logo.jpg', { type: blob.type || type }));
    } catch {
      setError("Impossible de préparer le logo. Réessayez.");
      setProcessing(false);
    }
  }, [loaded, adjust, onConfirm]);

  const isAuto = adjust.zoom === 1 && adjust.offsetX === 0 && adjust.offsetY === 0;
  const checker = loaded?.analysis.transparent
    ? { backgroundImage: 'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#fff' }
    : { backgroundColor: '#fff' };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div className="card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajuster le logo">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Ajuster le logo</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink/55">Votre logo est placé automatiquement en entier. Vous pouvez l’ajuster si vous le souhaitez, ce n’est pas obligatoire.</p>

        {!loaded && !error && <div className="flex h-56 items-center justify-center"><Loader2 size={20} className="animate-spin text-ink/30" /></div>}

        {loaded && (
          <>
            <div className="mx-auto w-full max-w-[17rem]">
              <div
                ref={stageRef}
                className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-lg border border-line active:cursor-grabbing"
                style={checker}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <LogoCanvas loaded={loaded} adjust={adjust} cssSize={stageSize} className="block" />
                {/* Pastille ronde telle qu'affichée sur la marketplace */}
                <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-burgundy/50" />
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-ink/45"><Move size={11} /> Glissez pour déplacer · le cercle montre l’affichage sur Ezial</p>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <ZoomIn size={15} className="flex-shrink-0 text-ink/40" aria-hidden="true" />
              <input
                type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={adjust.zoom}
                onChange={(e) => setAdjust((a) => ({ ...a, zoom: Number(e.target.value) }))}
                className="flex-1" aria-label="Zoom"
              />
              <button
                type="button"
                onClick={() => setAdjust(DEFAULT_ADJUST)}
                disabled={isAuto}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-ink/30 disabled:opacity-40"
              >
                <RotateCcw size={12} /> Réinitialiser
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-cream/60 p-3">
              <p className="text-[11px] font-medium text-ink/55">Aperçu</p>
              <div className="mt-2 flex items-end justify-around gap-3">
                <figure className="flex flex-col items-center gap-1">
                  <LogoCanvas loaded={loaded} adjust={adjust} cssSize={80} className="rounded-full border-4 border-white bg-white shadow-sm" />
                  <figcaption className="text-[10px] text-ink/45">Page boutique</figcaption>
                </figure>
                <figure className="flex flex-col items-center gap-1">
                  <LogoCanvas loaded={loaded} adjust={adjust} cssSize={48} className="rounded-full border-2 border-white bg-white shadow-sm" />
                  <figcaption className="text-[10px] text-ink/45">Carte boutique</figcaption>
                </figure>
                <figure className="flex flex-col items-center gap-1">
                  <LogoCanvas loaded={loaded} adjust={adjust} cssSize={40} className="rounded-lg border border-line bg-white" />
                  <figcaption className="text-[10px] text-ink/45">Ezial Pro</figcaption>
                </figure>
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-xs text-burgundy">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={() => void confirm()} disabled={processing || !loaded} className="btn-primary flex-1 disabled:opacity-60">
            {processing ? 'Traitement...' : <><Check size={15} /> Valider</>}
          </button>
          <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
        </div>
      </div>
    </div>
  );
}
