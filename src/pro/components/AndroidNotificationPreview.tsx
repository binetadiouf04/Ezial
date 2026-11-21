// Aperçu d'une notification telle qu'Android l'affiche, dépliée, dans le volet des
// notifications : petite icône de la barre d'état (papillon), « Ezial · maintenant »,
// titre, message, grande image (recadrée au format paysage) et bouton.
// Approximation : l'apparence exacte varie selon la marque et la version d'Android.

const APP_NAME = 'Ezial';

export default function AndroidNotificationPreview({ title, body, imageUrl, actionLabel }: { title: string; body: string; imageUrl: string | null; actionLabel: string }) {
  const shownTitle = title.trim() || 'Titre de la notification';
  const shownBody = body.trim() || 'Votre message apparaîtra ici.';
  const action = actionLabel.trim();

  return (
    <figure className="m-0">
      <div className="rounded-[28px] bg-[#1c1b1f] px-3 pb-5 pt-4" aria-hidden="true" style={{ fontFamily: 'Roboto, "Google Sans", Inter, system-ui, sans-serif' }}>
        <p className="mb-3 px-1 text-xs font-medium text-white/60">Volet des notifications</p>
        <div className="mx-auto w-full max-w-[350px] overflow-hidden rounded-[24px] bg-[#f3eef0] text-[#1d1b1e] shadow-lg">
          <div className="flex gap-3 p-4 pb-3">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-burgundy">
              <img src="/icons/badge-96.png" alt="" width={14} height={14} className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-[#4a4547]">{APP_NAME} · maintenant</p>
              <p className="mt-0.5 line-clamp-1 text-[15px] font-medium leading-5">{shownTitle}</p>
              <p className="mt-0.5 line-clamp-3 text-[14px] leading-5 text-[#4a4547]">{shownBody}</p>
            </div>
            <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-full" />
          </div>
          {imageUrl && (
            <div className="px-4">
              <img src={imageUrl} alt="" className="aspect-[2/1] w-full rounded-2xl bg-white object-cover" />
            </div>
          )}
          {action && (
            <div className="px-4 pb-3 pt-2">
              <span className="inline-block rounded-full px-3 py-2 text-[14px] font-medium text-burgundy-ruby">{action}</span>
            </div>
          )}
          {!action && imageUrl && <div className="h-4" />}
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-ink/50">
        Aperçu Android, notification dépliée. L’iPhone n’affiche ni l’image ni le bouton.
      </figcaption>
    </figure>
  );
}
