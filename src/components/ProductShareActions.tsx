import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { productPublicPath } from '@/lib/productUrl';

// « Copier la réf » et « Partager » de la page produit.
// Copie : API moderne, puis solution de secours pour les navigateurs qui la
// refusent (Safari sans HTTPS/geste, anciens iPad).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  if (!reference) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(reference)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
      }}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-xs font-mono text-ink/40 hover:text-ink/70"
      aria-label={`Copier la référence ${reference}`}
    >
      Réf. {reference}
      {copied ? <><Check size={13} className="text-green-700" aria-hidden="true" /><span className="font-sans text-green-700">Copiée</span></> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

export function ShareProduct({ product, iconOnly = false }: { product: { id: string; slug?: string; name: string }; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleShare = async () => {
    const url = `${window.location.origin}${productPublicPath(product)}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: product.name, text: product.name, url });
        return;
      } catch (e) {
        // Fenêtre de partage fermée par la personne : rien à faire.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (await copyText(url)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  };
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void handleShare()}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink/70 backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
        aria-label={copied ? 'Lien copié' : 'Partager ce produit'}
        title={copied ? 'Lien copié' : 'Partager'}
      >
        {copied ? <Check size={17} className="text-green-700" aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-medium text-ink hover:border-ink/30"
      aria-label="Partager ce produit"
    >
      {copied ? <><Check size={16} className="text-green-700" aria-hidden="true" /> Lien copié</> : <><Share2 size={16} aria-hidden="true" /> Partager</>}
    </button>
  );
}
