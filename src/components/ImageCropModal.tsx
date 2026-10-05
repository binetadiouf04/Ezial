import { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X, Check, ZoomIn } from 'lucide-react';

// Generic crop step shown right after a file picker, before any upload —
// lets the seller choose exactly what part of their photo gets used,
// locked to the aspect ratio the destination actually displays it at
// (square logo, wide cover banner...), instead of leaving an unpredictable
// CSS object-cover crop as the only option.
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (e) => reject(e));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

async function getCroppedFile(imageSrc: string, pixelCrop: Area, fileName: string, mimeType: string): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponible.');
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Impossible de traiter l'image.")); return; }
      resolve(new File([blob], fileName, { type: mimeType }));
    }, mimeType, 0.92);
  });
}

export default function ImageCropModal({
  file, aspect, title = 'Ajuster la photo', onCancel, onConfirm,
}: {
  file: File;
  aspect: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
}) {
  const [imageUrl] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const onCropComplete = useCallback((_area: Area, pixels: Area) => setCroppedAreaPixels(pixels), []);

  const confirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    setError('');
    try {
      const cropped = await getCroppedFile(imageUrl, croppedAreaPixels, file.name, file.type || 'image/jpeg');
      onConfirm(cropped);
    } catch {
      setError("Impossible de traiter l'image. Réessayez.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4" onClick={onCancel}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>
        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-ink/5">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ZoomIn size={15} className="flex-shrink-0 text-ink/40" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
        </div>
        {error && <p className="mt-2 text-xs text-burgundy">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={() => void confirm()} disabled={processing || !croppedAreaPixels} className="btn-primary flex-1 disabled:opacity-60">
            {processing ? 'Traitement...' : <><Check size={15} /> Valider</>}
          </button>
          <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
        </div>
      </div>
    </div>
  );
}
