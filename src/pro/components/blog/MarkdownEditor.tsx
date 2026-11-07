import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Bold, Heading2, Heading3, List, Link2, ImagePlus, Loader2, X, Eye, PenLine, AlertTriangle } from 'lucide-react';
import MarkdownContent from '@/components/MarkdownContent';
import { safeHref } from '@/shared/markdown';
import { isBlogImageAllowed } from '@/lib/supabaseBlog';
import { uploadBlogImage, BLOG_LIMITS } from '@/lib/supabaseAdminBlog';

// Article content editor: restricted Markdown (src/shared/markdown.js) with a
// small toolbar and a preview rendered by the same component as the public
// page. Images are uploaded to site-content/blog/<postId>/ and inserted as
// ![texte alternatif](url) — the only images the article will display.

const IMAGE_LINE = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/gm;

function ToolButton({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink/65 transition-colors hover:bg-cream hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function MarkdownEditor({
  value, onChange, postId, error, onImageUploaded,
}: {
  value: string;
  onChange: (next: string) => void;
  postId: string;
  error?: string;
  onImageUploaded?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [linkDialog, setLinkDialog] = useState<{ start: number; end: number; text: string; url: string; error: string } | null>(null);
  const [imageDialog, setImageDialog] = useState<{ start: number; end: number; file: File | null; preview: string; alt: string; error: string; uploading: boolean } | null>(null);

  const selection = () => {
    const el = ref.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  };

  const apply = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const bold = () => {
    const { start, end } = selection();
    const selected = value.slice(start, end).trim() || 'texte en gras';
    const next = `${value.slice(0, start)}**${selected}**${value.slice(end)}`;
    apply(next, start + 2, start + 2 + selected.length);
  };

  // Adds (or removes, when every selected line already has it) a line prefix.
  const linePrefix = (prefix: string, placeholder: string) => {
    const { start, end } = selection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const nonEmpty = lines.filter((l) => l.trim());
    const allHave = nonEmpty.length > 0 && nonEmpty.every((l) => l.startsWith(prefix));
    const replaced = lines.map((l) => {
      const bare = l.replace(/^(#{1,3}\s+|[-*]\s+)/, '');
      if (allHave) return bare;
      if (!l.trim()) return lines.length === 1 ? `${prefix}${placeholder}` : l;
      return `${prefix}${bare}`;
    }).join('\n');
    const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
    apply(next, lineStart, lineStart + replaced.length);
  };

  const openLink = () => {
    const { start, end } = selection();
    setLinkDialog({ start, end, text: value.slice(start, end).trim(), url: '', error: '' });
  };

  const insertLink = () => {
    if (!linkDialog) return;
    const text = linkDialog.text.replace(/[[\]\n]/g, ' ').trim();
    let url = linkDialog.url.trim();
    if (/^www\./i.test(url)) url = `https://${url}`;
    url = url.replace(/\(/g, '%28').replace(/\)/g, '%29');
    if (!text) { setLinkDialog({ ...linkDialog, error: 'Indiquez le texte du lien.' }); return; }
    if (!safeHref(url)) {
      setLinkDialog({ ...linkDialog, error: "Adresse non valide : commencez par https:// pour un autre site, ou par / pour une page d'Ezial (ex. /categorie/beaute/)." });
      return;
    }
    const md = `[${text}](${url})`;
    const next = value.slice(0, linkDialog.start) + md + value.slice(linkDialog.end);
    setLinkDialog(null);
    apply(next, linkDialog.start + md.length, linkDialog.start + md.length);
  };

  const openImage = () => {
    const { start, end } = selection();
    setImageDialog({ start, end, file: null, preview: '', alt: '', error: '', uploading: false });
    // Synchronously, inside the tap: iPad Safari only opens a file picker
    // from the user gesture itself.
    fileRef.current?.click();
  };

  const onImageFile = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !imageDialog) return;
    if (!file.type.startsWith('image/')) { setImageDialog({ ...imageDialog, error: 'Ce fichier n’est pas une image.' }); return; }
    if (imageDialog.preview) URL.revokeObjectURL(imageDialog.preview);
    setImageDialog({ ...imageDialog, file, preview: URL.createObjectURL(file), error: '' });
  };

  const closeImage = () => {
    if (imageDialog?.preview) URL.revokeObjectURL(imageDialog.preview);
    setImageDialog(null);
  };

  const insertImage = async () => {
    if (!imageDialog?.file) { setImageDialog((d) => d && { ...d, error: 'Choisissez une image.' }); return; }
    const alt = imageDialog.alt.replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!alt) { setImageDialog({ ...imageDialog, error: "Le texte alternatif est obligatoire : décrivez l'image en quelques mots." }); return; }
    setImageDialog({ ...imageDialog, uploading: true, error: '' });
    const res = await uploadBlogImage(postId, imageDialog.file, 'image');
    if ('error' in res) { setImageDialog((d) => d && { ...d, uploading: false, error: res.error }); return; }
    onImageUploaded?.();
    const { start, end } = imageDialog;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const md = `${lead}![${alt}](${res.url})${trail}`;
    closeImage();
    apply(before + md + after, start + md.length, start + md.length);
  };

  const ignoredImages = useMemo(() => {
    let count = 0;
    for (const m of value.matchAll(IMAGE_LINE)) {
      if (!m[1].trim() || !isBlogImageAllowed(m[2])) count += 1;
    }
    return count;
  }, [value]);

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-white focus-within:border-burgundy">
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line bg-cream/40 px-1.5 py-1">
          <div className="flex flex-wrap items-center gap-0.5">
            <ToolButton onClick={bold} label="Gras" disabled={tab !== 'write'}><Bold size={15} /><span className="hidden md:inline">Gras</span></ToolButton>
            <ToolButton onClick={() => linePrefix('## ', 'Titre de section')} label="Titre (H2)" disabled={tab !== 'write'}><Heading2 size={15} /><span className="hidden md:inline">Titre</span></ToolButton>
            <ToolButton onClick={() => linePrefix('### ', 'Sous-titre')} label="Sous-titre (H3)" disabled={tab !== 'write'}><Heading3 size={15} /><span className="hidden md:inline">Sous-titre</span></ToolButton>
            <ToolButton onClick={() => linePrefix('- ', 'Élément de liste')} label="Liste" disabled={tab !== 'write'}><List size={15} /><span className="hidden md:inline">Liste</span></ToolButton>
            <ToolButton onClick={openLink} label="Lien" disabled={tab !== 'write'}><Link2 size={15} /><span className="hidden md:inline">Lien</span></ToolButton>
            <ToolButton onClick={openImage} label="Image" disabled={tab !== 'write'}><ImagePlus size={15} /><span className="hidden md:inline">Image</span></ToolButton>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-white p-0.5" role="tablist" aria-label="Mode d'affichage">
            <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${tab === 'write' ? 'bg-burgundy text-white' : 'text-ink/55'}`}>
              <PenLine size={13} /> Rédiger
            </button>
            <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${tab === 'preview' ? 'bg-burgundy text-white' : 'text-ink/55'}`}>
              <Eye size={13} /> Aperçu
            </button>
          </div>
        </div>
        {tab === 'write' ? (
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={18}
            maxLength={BLOG_LIMITS.content}
            spellCheck
            lang="fr"
            placeholder={'Rédigez l’article ici.\n\n## Un titre de section\n\nUn paragraphe avec du **gras** et un [lien](https://exemple.com).\n\n- un élément de liste'}
            className="block min-h-[320px] w-full resize-y border-0 bg-white px-4 py-3 font-mono text-[15px] leading-relaxed text-ink placeholder:text-ink/30 focus:outline-none focus:ring-0"
          />
        ) : (
          <div className="min-h-[320px] px-4 py-4 sm:px-6">
            {value.trim() ? <MarkdownContent source={value} isImageAllowed={isBlogImageAllowed} /> : <p className="text-sm text-ink/40">Rien à afficher pour l'instant.</p>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-ink/40">
          Mise en forme : <code>## Titre</code>, <code>### Sous-titre</code>, <code>**gras**</code>, <code>*italique*</code>, <code>- liste</code>, <code>[texte](lien)</code>. Le HTML n'est pas interprété.
        </p>
        <p className="text-xs text-ink/40">{words.toLocaleString('fr-FR')} mot{words > 1 ? 's' : ''}</p>
      </div>
      {ignoredImages > 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          {ignoredImages} image{ignoredImages > 1 ? 's' : ''} ne sera pas affichée : seules les images envoyées avec le bouton « Image », avec un texte alternatif, sont publiées.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-burgundy">{error}</p>}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImageFile(e.target.files?.[0])} />

      {linkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setLinkDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="md-link-title" className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 id="md-link-title" className="text-sm font-semibold text-ink">Insérer un lien</h3>
              <button type="button" onClick={() => setLinkDialog(null)} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
            </div>
            <label className="mb-1.5 block text-xs font-medium text-ink/60" htmlFor="md-link-text">Texte du lien</label>
            <input id="md-link-text" className="input-field" value={linkDialog.text} onChange={(e) => setLinkDialog({ ...linkDialog, text: e.target.value, error: '' })} />
            <label className="mb-1.5 mt-3 block text-xs font-medium text-ink/60" htmlFor="md-link-url">Adresse</label>
            <input id="md-link-url" className="input-field" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://… ou /categorie/beaute/" value={linkDialog.url} onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value, error: '' })} />
            <p className="mt-1.5 text-xs text-ink/40">Lien vers une page d'Ezial : commencez par « / » (ex. /blog/, /categorie/beaute/skincare/).</p>
            {linkDialog.error && <p className="mt-2 text-xs text-burgundy">{linkDialog.error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setLinkDialog(null)} className="btn-outline flex-1 px-4">Annuler</button>
              <button type="button" onClick={insertLink} className="btn-primary flex-1 px-4">Insérer</button>
            </div>
          </div>
        </div>
      )}

      {imageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={imageDialog.uploading ? undefined : closeImage}>
          <div role="dialog" aria-modal="true" aria-labelledby="md-image-title" className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 id="md-image-title" className="text-sm font-semibold text-ink">Insérer une image</h3>
              <button type="button" onClick={closeImage} disabled={imageDialog.uploading} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
            </div>
            {imageDialog.preview ? (
              <img src={imageDialog.preview} alt="" className="max-h-56 w-full rounded-lg bg-cream object-contain" />
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-cream/40 px-4 py-8 text-sm text-ink/55 hover:border-burgundy/40 hover:text-burgundy">
                <ImagePlus size={22} /> Choisir une image
              </button>
            )}
            {imageDialog.preview && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={imageDialog.uploading} className="mt-2 text-xs font-medium text-burgundy hover:underline">Choisir une autre image</button>
            )}
            <label className="mb-1.5 mt-4 block text-xs font-medium text-ink/60" htmlFor="md-image-alt">Texte alternatif (obligatoire)</label>
            <input id="md-image-alt" className="input-field" maxLength={150} placeholder="Ex. : flacon de sérum posé sur une serviette" value={imageDialog.alt} onChange={(e) => setImageDialog({ ...imageDialog, alt: e.target.value, error: '' })} />
            <p className="mt-1.5 text-xs text-ink/40">Décrit l'image pour les personnes malvoyantes et les moteurs de recherche.</p>
            {imageDialog.error && <p className="mt-2 text-xs text-burgundy">{imageDialog.error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeImage} disabled={imageDialog.uploading} className="btn-outline flex-1 px-4">Annuler</button>
              <button type="button" onClick={() => void insertImage()} disabled={imageDialog.uploading} className="btn-primary flex-1 px-4">
                {imageDialog.uploading && <Loader2 size={15} className="animate-spin" />} Insérer l'image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
