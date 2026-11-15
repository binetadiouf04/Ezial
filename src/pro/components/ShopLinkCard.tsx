import { useEffect, useState } from 'react';
import { Link2, Copy, Check, Share2, ExternalLink, AlertCircle } from 'lucide-react';
import { fetchShopLink, type ShopLinkData } from '@/lib/supabaseSellerShop';
import { shopShareUrl, shopShareTexts, type ShopShareTexts } from '@/lib/shopUrl';
import { copyText } from '@/lib/clipboard';
import { SITE_URL } from '@/shared/siteInfo';

const TEXT_TABS: { id: keyof ShopShareTexts; label: string }[] = [
  { id: 'bio', label: 'Bio Instagram' },
  { id: 'post', label: 'Publication' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

// « Lien de ma boutique » : l'adresse courte de la boutique (/boutique/<nom-court>/),
// à coller dans la bio Instagram, une story, un message WhatsApp… avec des
// textes prêts à copier. Le lien est montré tel qu'il sera partagé ; tant que la
// boutique n'est pas active, il ne mène nulle part et la carte le dit.
export default function ShopLinkCard({ shopId, compact = false }: { shopId: string | null; compact?: boolean }) {
  const [shop, setShop] = useState<ShopLinkData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<keyof ShopShareTexts>('bio');

  useEffect(() => {
    if (!shopId) { setLoaded(true); return; }
    let cancelled = false;
    fetchShopLink(shopId).then((data) => { if (!cancelled) { setShop(data); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [shopId]);

  if (!loaded || !shop || !shop.slug) return null;

  const url = shopShareUrl({ id: shopId ?? '', slug: shop.slug }, SITE_URL);
  const shown = url.replace(/^https?:\/\//, '');
  const live = shop.status === 'active';
  const texts = shopShareTexts(shop.name, url);

  const copy = async (key: string, value: string) => {
    if (await copyText(value)) { setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800); }
  };

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: shop.name, text: texts.post, url }); return; } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    void copy('link', url);
  };

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="shop-link-title">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-burgundy" aria-hidden="true" />
        <h2 id="shop-link-title" className="text-sm font-semibold text-ink">Lien de ma boutique</h2>
      </div>
      <p className="mt-1 text-xs text-ink/55">
        Partagez-le dans la bio de votre Instagram ou dans vos publications : vos clients arrivent directement sur votre boutique Ezial et peuvent commander en ligne.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-cream/60 px-3 py-2">
        <span className="min-w-0 flex-1 break-all font-mono text-[13px] leading-snug text-ink">{shown}</span>
        <button
          type="button"
          onClick={() => void copy('link', url)}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-burgundy px-3.5 py-1.5 text-xs font-medium text-white hover:bg-burgundy-deep active:scale-[0.98]"
        >
          {copied === 'link' ? <><Check size={14} aria-hidden="true" /> Copié</> : <><Copy size={14} aria-hidden="true" /> Copier</>}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/30">
          <Share2 size={14} aria-hidden="true" /> Partager
        </button>
        {live && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/30">
            <ExternalLink size={14} aria-hidden="true" /> Voir ma boutique
          </a>
        )}
      </div>

      {!live && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          Ce lien ne fonctionnera qu’une fois votre boutique active : les clients ne peuvent pas encore la voir. Vous pouvez déjà le préparer.
        </p>
      )}

      {!compact && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium text-ink/70">Textes prêts à copier</p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Type de texte">
            {TEXT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tab === t.id ? 'border-burgundy bg-burgundy text-white' : 'border-line bg-white text-ink/65 hover:border-ink/25'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-cream/60 p-3">
            <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-ink/80">{texts[tab]}</p>
            <button
              type="button"
              onClick={() => void copy(tab, texts[tab])}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-burgundy hover:underline"
            >
              {copied === tab ? <><Check size={13} aria-hidden="true" /> Texte copié</> : <><Copy size={13} aria-hidden="true" /> Copier le texte</>}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
