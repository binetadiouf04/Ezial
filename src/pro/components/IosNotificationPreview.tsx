import { useLayoutEffect, useRef, useState } from 'react';

// Aperçu d'une notification telle qu'un iPhone l'affiche sur l'écran verrouillé
// (application Ezial installée) : icône de l'application, titre en gras suivi de
// « from Ezial » (ajouté par iOS, impossible à retirer), message, « maintenant ».
// iOS coupe le titre après 2 lignes et le message après 4 : on mesure le rendu réel
// (même largeur et même taille de texte qu'un iPhone) pour prévenir avant l'envoi.
// Approximation fidèle mais pas au pixel près : la police exacte dépend de l'appareil.

export interface PreviewCut { title: boolean; body: boolean }

const APP_NAME = 'Ezial';

export default function IosNotificationPreview({ title, body, onCut }: { title: string; body: string; onCut?: (cut: PreviewCut) => void }) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = useState<PreviewCut>({ title: false, body: false });

  useLayoutEffect(() => {
    const overflow = (el: HTMLElement | null) => !!el && el.scrollHeight > el.clientHeight + 1;
    const next = { title: overflow(titleRef.current), body: overflow(bodyRef.current) };
    setCut((prev) => (prev.title === next.title && prev.body === next.body ? prev : next));
  }, [title, body]);

  useLayoutEffect(() => { onCut?.(cut); }, [cut, onCut]);

  const shownTitle = title.trim() || 'Titre de la notification';
  const shownBody = body.trim() || 'Votre message apparaîtra ici.';

  return (
    <figure className="m-0">
      <div
        className="rounded-[28px] px-3 pb-6 pt-5"
        style={{ background: 'radial-gradient(120% 90% at 20% 0%, #8C1024 0%, #5A0D1E 45%, #1f0710 100%)' }}
        aria-hidden="true"
      >
        <p className="text-center text-[44px] font-semibold leading-none tracking-tight text-white/90" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif' }}>9:41</p>
        <p className="mb-5 mt-1 text-center text-xs font-medium text-white/70">Écran verrouillé</p>
        <div
          className="mx-auto flex w-full max-w-[350px] gap-2.5 rounded-[22px] bg-white/25 p-3 text-white shadow-lg backdrop-blur-md"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif' }}
        >
          <img src="/icons/icon-192.png" alt="" width={38} height={38} className="mt-0.5 h-[38px] w-[38px] flex-shrink-0 rounded-[9px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p ref={titleRef} className="min-w-0 flex-1 overflow-hidden text-[15px] font-semibold leading-[19px]" style={{ maxHeight: 38, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {shownTitle}{' '}<span className="font-semibold">from {APP_NAME}</span>
              </p>
              <span className="flex-shrink-0 pt-px text-[13px] text-white/70">maintenant</span>
            </div>
            <p ref={bodyRef} className="overflow-hidden text-[15px] leading-[19px] text-white/95" style={{ maxHeight: 76, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
              {shownBody}
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 space-y-1 text-xs text-ink/50">
        <span className="block">Aperçu iPhone. « from {APP_NAME} » est ajouté par l’iPhone et ne peut pas être retiré.</span>
        {cut.title && <span className="block font-medium text-amber-700">Titre trop long : l’iPhone le coupera. Visez moins de 30 caractères.</span>}
        {cut.body && <span className="block font-medium text-amber-700">Message trop long : l’iPhone le coupera après 4 lignes.</span>}
      </figcaption>
    </figure>
  );
}
