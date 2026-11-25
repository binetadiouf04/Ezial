import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, VideoOff } from 'lucide-react';

// Vidéo d'une fiche produit, pensée pour l'iPhone et les connexions mobiles :
// - rien n'est téléchargé tant que la vidéo n'est pas à l'écran (IntersectionObserver)
//   et, quand une image de couverture existe, tant que l'acheteur n'a pas touché
//   « Lire » (preload="none") : la page produit ne paie jamais le poids d'une
//   vidéo (jusqu'à 50 Mo) qu'on ne regarde pas ;
// - jamais de lecture automatique : la lecture démarre au toucher (geste de
//   l'utilisateur, donc autorisée avec le son sur iOS) ; playsInline évite le
//   plein écran forcé de l'iPhone ;
// - couverture : la première photo du produit ; sans photo, la première image
//   de la vidéo (fragment #t=0.1, seul moyen pour Safari iOS de l'afficher) ;
// - indicateur de chargement pendant l'attente, et en cas d'échec un message
//   clair en français, avec « Réessayer » et le retour aux photos.

type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

function withFirstFrame(url: string): string {
  return url.includes('#') ? url : `${url}#t=0.1`;
}

export default function ProductVideo({
  src,
  poster,
  title,
  onShowPhotos,
}: {
  src: string;
  /** Première photo du produit (ou sa miniature), affichée avant la lecture. */
  poster?: string;
  /** Nom du produit, pour les lecteurs d'écran. */
  title: string;
  /** Retour à la première photo quand la vidéo ne peut pas être lue. */
  onShowPhotos?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const hasPoster = Boolean(poster) && !posterFailed;

  // Monté seulement à proximité de l'écran ; mis en pause dès qu'il en sort.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
      else videoRef.current?.pause();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPhase('loading');
    video.play().catch((err: unknown) => {
      // Lecture refusée avec le son (réglage du navigateur) : nouvel essai en muet.
      if (err instanceof DOMException && err.name === 'NotAllowedError' && !video.muted) {
        video.muted = true;
        video.play().catch(() => setPhase('paused'));
        return;
      }
      // Une erreur de chargement arrive aussi par l'événement « error » ; une
      // interruption (AbortError) ne doit pas afficher d'erreur.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setPhase((p) => (p === 'error' ? p : 'paused'));
    });
  }, []);

  const retry = () => {
    setPhase('idle');
    setAttempt((n) => n + 1);
  };

  const showPoster = phase === 'idle' || phase === 'error';

  return (
    <div ref={wrapperRef} className="relative h-full w-full bg-ink/5">
      {visible && (
        <video
          key={attempt}
          ref={videoRef}
          // Sans couverture, la première image de la vidéo en tient lieu.
          src={hasPoster ? src : withFirstFrame(src)}
          poster={hasPoster ? poster : undefined}
          preload={hasPoster ? 'none' : 'metadata'}
          playsInline
          controls={phase === 'playing' || phase === 'paused'}
          aria-label={`Vidéo du produit ${title}`}
          className="h-full w-full object-cover"
          onWaiting={() => setPhase((p) => (p === 'playing' ? 'loading' : p))}
          onPlaying={() => setPhase('playing')}
          onPause={() => setPhase((p) => (p === 'error' ? p : 'paused'))}
          onLoadedMetadata={(e) => {
            // Piste vidéo illisible (codec non pris en charge par cet appareil,
            // ex. HEVC sur un Android) : certains navigateurs ne lèvent aucune
            // erreur et n'affichent qu'un cadre noir. Traité comme un échec.
            if (e.currentTarget.videoWidth === 0) setPhase('error');
          }}
          onError={() => setPhase('error')}
        />
      )}

      {/* Couverture tant que la vidéo n'a pas démarré (et en cas d'échec). */}
      {showPoster && hasPoster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          decoding="async"
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {phase === 'idle' && (
        <button
          type="button"
          onClick={play}
          disabled={!visible}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={`Lire la vidéo du produit ${title}`}
        >
          <span className="flex items-center gap-2 rounded-full bg-burgundy/90 px-4 py-2.5 text-sm font-semibold text-cream shadow-lg backdrop-blur">
            <Play size={18} fill="currentColor" /> Lire la vidéo
          </span>
        </button>
      )}

      {phase === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2" role="status">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-xs font-medium text-ink shadow">
            <Loader2 size={16} className="animate-spin" /> Chargement de la vidéo…
          </span>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/40 p-4" role="alert">
          <div className="max-w-[280px] rounded-xl bg-white p-4 text-center shadow-lg">
            <VideoOff size={22} className="mx-auto text-burgundy" />
            <p className="mt-2 text-sm font-medium text-ink">La vidéo ne peut pas être lue sur cet appareil ou la connexion est trop lente.</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream">
                <RotateCcw size={13} /> Réessayer
              </button>
              {onShowPhotos && (
                <button type="button" onClick={onShowPhotos} className="rounded-full bg-burgundy px-3 py-1.5 text-xs font-semibold text-cream hover:bg-burgundy-ruby">
                  Voir les photos
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
