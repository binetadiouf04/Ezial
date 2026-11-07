import { useApp } from '@/store/AppContext';
import { useEffect } from 'react';
import { applyHeadTags, useNoIndex, DEFAULT_OG_IMAGE, SITE_URL } from '@/lib/seoHead';
import { getInfoPage } from '@/shared/infoPages';
import InfoLayout from '@/components/info/InfoLayout';

// Institutional pages /info/<slug>. Texts and structure live in
// src/shared/infoPages.js (also read by the static SEO build,
// scripts/seo/info.mjs); the <head> tags are set here from the same
// definition (canonical on the main slug: /info/faq points to centre-aide).

function sectionFromRoute(route: string): string | null {
  const query = route.split('?')[1];
  if (!query) return null;
  const value = new URLSearchParams(query).get('section');
  return value && /^[a-z0-9-]+$/.test(value) ? value : null;
}

export default function InfoPage({ slug }: { slug: string }) {
  const { navigate, route } = useApp();
  const page = getInfoPage(slug);
  useNoIndex(!page);
  useEffect(() => {
    const title = page ? page.metaTitle : 'Page introuvable — Ezial';
    const description = page ? page.description : 'Cette page n’existe pas ou a été déplacée.';
    const canonical = page ? `${SITE_URL}/info/${page.slug}/` : `${SITE_URL}/`;
    applyHeadTags({ title, description, canonical, ogTitle: title, ogDescription: description, ogImage: DEFAULT_OG_IMAGE, ogType: 'website' });
  }, [page]);

  if (!page) {
    return (
      <div className="container-pro py-20 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">Page introuvable</h1>
        <p className="mt-3 text-ink/60">Cette page n’existe pas ou a été déplacée.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => navigate('/')} className="btn-primary">Retour à l’accueil</button>
          <button onClick={() => navigate('/info/centre-aide')} className="btn-outline">Aide & FAQ</button>
        </div>
      </div>
    );
  }

  return <InfoLayout key={page.slug} page={page} section={sectionFromRoute(route)} />;
}
