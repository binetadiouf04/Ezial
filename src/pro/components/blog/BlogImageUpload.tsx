import { useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import ImageCropModal from '@/components/ImageCropModal';
import SmartImage from '@/components/SmartImage';
import { uploadBlogImage, type BlogImageKind } from '@/lib/supabaseAdminBlog';

// Pick → crop at the displayed ratio → optimize → upload to
// site-content/blog/<postId>/ → hand back the public URL.
export default function BlogImageUpload({
  postId, kind, aspect, value, onChange, cropTitle, emptyLabel, onUploaded,
}: {
  postId: string;
  kind: BlogImageKind;
  aspect: number;
  value: string;
  onChange: (url: string) => void;
  cropTitle: string;
  emptyLabel: string;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pick = () => inputRef.current?.click();

  const onFile = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Ce fichier n’est pas une image.'); return; }
    setError('');
    setPending(file);
  };

  const onCropped = async (cropped: File) => {
    setPending(null);
    setUploading(true);
    const res = await uploadBlogImage(postId, cropped, kind);
    setUploading(false);
    if ('error' in res) { setError(res.error); return; }
    onChange(res.url);
    onUploaded?.();
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {value ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl bg-cream" style={{ aspectRatio: String(aspect) }}>
            <SmartImage src={value} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={pick} disabled={uploading} className="btn-outline px-4 py-2.5">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Remplacer
            </button>
            <button type="button" onClick={() => onChange('')} disabled={uploading} className="btn-ghost text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Retirer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-cream/40 px-4 py-8 text-sm text-ink/55 transition-colors hover:border-burgundy/40 hover:text-burgundy"
          style={{ aspectRatio: String(aspect) }}
        >
          {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
          {uploading ? 'Envoi en cours…' : emptyLabel}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-burgundy">{error}</p>}
      {pending && (
        <ImageCropModal file={pending} aspect={aspect} title={cropTitle} onCancel={() => setPending(null)} onConfirm={(f) => void onCropped(f)} />
      )}
    </div>
  );
}
