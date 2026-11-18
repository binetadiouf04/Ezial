import { Component, type ErrorInfo, type ReactNode } from 'react';

// Filet de sécurité : si une page ne peut pas s'afficher (par exemple un
// fichier d'une ancienne version supprimé par un nouveau déploiement, quand le
// rechargement automatique a déjà eu lieu il y a moins d'une minute), on évite
// l'écran blanc et on propose de recharger. Aucun rechargement automatique ici.
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ezial — erreur d’affichage', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="w-full max-w-sm text-center">
          <p className="font-logo text-2xl tracking-[0.12em] text-burgundy">EZIAL</p>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Cette page n’a pas pu s’afficher</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">Une nouvelle version d’Ezial est peut-être disponible. Rechargez pour continuer.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary mt-6">Recharger</button>
        </div>
      </div>
    );
  }
}
