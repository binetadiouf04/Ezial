import { useEffect, useState } from 'react';
import { isEditableTarget, isKeyboardLikelyOpen, KEYBOARD_OPENING_GRACE_MS } from '@/lib/mobileKeyboard';

/**
 * Vrai pendant que le clavier virtuel est (probablement) ouvert : un champ de
 * saisie a le focus et la zone visible a rétréci (voir isKeyboardLikelyOpen).
 * Sert à masquer les barres fixées en bas de l'écran pendant la saisie.
 */
export function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport ?? null;
    const coarse = window.matchMedia?.('(pointer: coarse)');
    let focusedAt = 0;
    let editableFocused = isEditableTarget(document.activeElement as HTMLElement | null);
    let graceTimer: number | undefined;

    const update = () => {
      setOpen(isKeyboardLikelyOpen({
        editableFocused,
        layoutHeight: window.innerHeight,
        visualHeight: vv ? vv.height : null,
        scale: vv ? vv.scale : 1,
        msSinceFocus: Date.now() - focusedAt,
        coarsePointer: Boolean(coarse?.matches),
      }));
    };

    const onFocusIn = (e: FocusEvent) => {
      const editable = isEditableTarget(e.target as HTMLElement | null);
      if (editable && !editableFocused) focusedAt = Date.now();
      editableFocused = editable;
      update();
      // Réévaluer à la fin du délai d'ouverture : s'il n'y a finalement pas de
      // clavier (clavier physique), la barre réapparaît.
      window.clearTimeout(graceTimer);
      if (editable) graceTimer = window.setTimeout(update, KEYBOARD_OPENING_GRACE_MS + 50);
    };
    const onFocusOut = () => {
      // Le focus peut passer directement d'un champ à un autre : on attend
      // l'élément suivant avant de réafficher la barre (pas de clignotement).
      window.setTimeout(() => {
        editableFocused = isEditableTarget(document.activeElement as HTMLElement | null);
        update();
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      window.clearTimeout(graceTimer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return open;
}
