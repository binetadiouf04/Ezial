import { useEffect, useRef, type ReactNode } from 'react';
import { useVirtualKeyboardOpen } from '@/lib/useVirtualKeyboardOpen';

// Barre d'achat : fixée en bas de l'écran sur mobile et tablette portrait,
// intégrée à la page sur ordinateur (lg). Points de stabilité :
// - fond opaque, sans flou d'arrière-plan (backdrop-filter sur un élément fixe
//   fait clignoter et sauter la barre pendant le défilement sur iOS) ;
// - masquée pendant la saisie (clavier ouvert), réaffichée à sa fermeture :
//   jamais posée au-dessus du clavier ni par-dessus le champ en cours ;
// - zone de sécurité iOS (barre d'accueil) respectée ;
// - sa hauteur réelle est réservée en bas de la page (body), pour que le pied
//   de page et le dernier contenu ne soient jamais cachés derrière elle.

const ROOT_CLASS = 'has-mobile-buy-bar';
const HEIGHT_VAR = '--mobile-buy-bar-h';

export default function MobileBuyBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const keyboardOpen = useVirtualKeyboardOpen();

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    root.classList.add(ROOT_CLASS);
    const measure = () => root.style.setProperty(HEIGHT_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.classList.remove(ROOT_CLASS);
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-mobile-buy-bar=""
      data-keyboard-open={keyboardOpen ? 'true' : 'false'}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-12px_rgba(23,23,23,0.25)] transition-[transform,opacity,visibility] duration-200 will-change-transform lg:visible lg:static lg:z-auto lg:translate-y-0 lg:border-0 lg:bg-transparent lg:p-0 lg:opacity-100 lg:shadow-none lg:transition-none lg:will-change-auto ${keyboardOpen ? 'invisible translate-y-full opacity-0' : 'visible translate-y-0 opacity-100'}`}
    >
      <div className="mx-auto flex max-w-[480px] gap-2.5 lg:max-w-none">{children}</div>
    </div>
  );
}
