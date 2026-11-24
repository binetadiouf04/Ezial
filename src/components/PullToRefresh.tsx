import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { currentRefreshBlock, isStandaloneDisplay, reloadPage, startUnsavedChangesTracking } from '@/lib/pageRefresh';
import { PULL_THRESHOLD_PX, dampedPull, pullDirection } from '@/lib/pullToRefreshCore';

// « Tirer vers le bas pour actualiser », uniquement dans l'application
// installée (iPhone et Android n'en proposent pas en mode écran d'accueil ;
// dans le navigateur, celui-ci garde son propre geste et son bouton).
//
// Le geste ne démarre que si :
//   - la page est tout en haut, un seul doigt, mouvement nettement vertical
//     vers le bas (un carrousel horizontal n'est jamais concerné) ;
//   - le doigt n'est pas sur un champ de saisie, une fenêtre, un tiroir, la
//     barre d'achat ou tout autre élément fixe, ni dans une liste défilante
//     qui n'est pas en haut ;
//   - aucune fenêtre n'est ouverte et la page n'est pas bloquée (overflow) ;
//   - on n'est ni au paiement, ni sur une commande, ni sur une saisie vendeur,
//     et aucun formulaire n'a été modifié sans être enregistré.
const BLOCKING_TARGET = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [aria-modal="true"], [data-no-pull-refresh]';

function startAllowed(target: EventTarget | null): boolean {
  const scroller = document.scrollingElement ?? document.documentElement;
  if (window.scrollY > 0 || scroller.scrollTop > 0) return false;
  if (document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden') return false;
  // Fenêtre modale ouverte (la carte non modale des notifications, elle, ne bloque pas).
  if (document.querySelector('[aria-modal="true"]')) return false;
  if (!(target instanceof Element)) return false;
  if (target.closest(BLOCKING_TARGET)) return false;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed') return false;
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return false;
  }
  return currentRefreshBlock() === null;
}

export default function PullToRefresh() {
  const [enabled] = useState(() => isStandaloneDisplay() && 'ontouchstart' in window);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { startUnsavedChangesTracking(); }, []);

  useEffect(() => {
    if (!enabled) return;
    let startX = 0;
    let startY = 0;
    let state: 'idle' | 'pending' | 'pulling' = 'idle';
    let distance = 0;
    let busy = false;

    const paint = (d: number, animate: boolean) => {
      const el = indicatorRef.current;
      if (!el) return;
      el.style.transition = animate ? 'transform 200ms ease, opacity 200ms ease' : 'none';
      el.style.transform = `translate3d(-50%, ${d - 56}px, 0)`;
      el.style.opacity = d > 0 ? String(Math.min(1, d / (PULL_THRESHOLD_PX * 0.6))) : '0';
      if (iconRef.current) iconRef.current.style.transform = `rotate(${Math.round(d * 3)}deg)`;
    };

    const reset = () => {
      state = 'idle';
      distance = 0;
      setArmed(false);
      paint(0, true);
    };

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || !startAllowed(e.target)) { state = 'idle'; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      state = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (state === 'idle') return;
      if (e.touches.length !== 1) { reset(); return; }
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (state === 'pending') {
        const dir = pullDirection(dx, dy);
        if (dir === 'pending') return;
        if (dir === 'ignore' || window.scrollY > 0) { state = 'idle'; return; }
        state = 'pulling';
      }
      // Le geste nous appartient : pas de rebond de la page en même temps.
      if (e.cancelable) e.preventDefault();
      distance = dampedPull(dy);
      setArmed(distance >= PULL_THRESHOLD_PX);
      paint(distance, false);
    };

    const onEnd = () => {
      if (state !== 'pulling') { state = 'idle'; return; }
      // Revérifié au dernier moment : une saisie a pu commencer entre-temps.
      if (distance >= PULL_THRESHOLD_PX && currentRefreshBlock() === null) {
        busy = true;
        state = 'idle';
        setRefreshing(true);
        paint(PULL_THRESHOLD_PX * 0.8, true);
        window.setTimeout(reloadPage, 150);
        return;
      }
      reset();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={indicatorRef}
      aria-hidden={!armed && !refreshing}
      className="pointer-events-none fixed left-1/2 z-[70] flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-md"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', transform: 'translate3d(-50%, -56px, 0)', opacity: 0 }}
    >
      <span ref={iconRef} className="flex">
        <RefreshCw
          size={18}
          strokeWidth={1.75}
          className={`${armed || refreshing ? 'text-burgundy-ruby' : 'text-ink/50'} ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {refreshing ? 'Actualisation…' : armed ? 'Relâchez pour actualiser' : ''}
      </span>
    </div>
  );
}
