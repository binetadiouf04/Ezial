// Static (crawlable) version of « Devenir vendeur » (/devenir-vendeur/).
// Called by scripts/prerender-seo.mjs with the shared helpers (ctx).
//
// Same texts and same title / description / canonical as the React page
// (src/pages/BecomeSellerPage.tsx): keep both in sync. Plan numbers and
// sales texts come from src/shared/plans.js, never typed here.
import {
  FREE_BENEFITS, PLUS_BENEFITS, PLUS_HIGHLIGHTS, PLAN_COMPARISON, PLUS_PLAN_NAME, PLUS_BILLING, TRIAL_DAYS,
  TRIAL_RULES, PLAN_END_RULES, formatFcfa,
} from '../../src/shared/plans.js';

const META_TITLE = 'Devenir vendeur sur Ezial — Créez votre boutique en ligne | Ezial';
const META_DESCRIPTION = `Créez votre boutique sur Ezial, la marketplace sénégalaise : présentez vos produits et touchez de nouveaux clients. Formule Free ou ${PLUS_PLAN_NAME}.`;

const BENEFITS = [
  { title: 'Plus de visibilité', text: 'Votre boutique est présentée aux clients qui parcourent Ezial : catalogue, recherche et catégories.' },
  { title: 'Votre boutique en ligne', text: 'Une vitrine à votre nom : photos, descriptions, prix, tailles, couleurs et variantes.' },
  { title: 'Livraison organisée', text: 'Ezial organise la collecte et la livraison de vos commandes à Dakar.' },
  { title: 'Gestion simplifiée', text: 'Commandes, stocks, ventes et revenus suivis depuis un seul espace.' },
  { title: 'Accompagnement', text: 'L’équipe Ezial vous aide à configurer votre boutique et à présenter vos produits.' },
];

const MISSION = [
  'Rendre les boutiques sénégalaises accessibles en ligne.',
  'Rassembler vos boutiques préférées sur une seule marketplace.',
  'Simplifier la commande et la livraison pour les clients.',
  'Offrir aux commerçants des outils simples pour vendre en ligne.',
  'Valoriser le savoir-faire et les créateurs locaux.',
];

const STEPS = [
  { title: 'Créez votre compte', text: 'Inscrivez-vous, ou connectez-vous avec votre compte Ezial si vous en avez déjà un.' },
  { title: 'Créez votre boutique', text: 'Donnez-lui un nom, ajoutez votre logo et une description.' },
  { title: 'Choisissez votre formule', text: `Free ou ${PLUS_PLAN_NAME}, avec un essai gratuit de ${TRIAL_DAYS} jours.` },
  { title: 'Publiez vos produits', text: 'Mettez vos produits en ligne et recevez vos commandes.' },
];

export async function buildBecomeSellerPage(ctx) {
  const { SITE_URL, esc, renderPage, writeFile, breadcrumbNav, breadcrumbJsonLd, addSitemapUrl } = ctx;

  const canonical = `${SITE_URL}/devenir-vendeur/`;
  const signupUrl = `${SITE_URL}/pro?vue=inscription`;
  const cta = `<p><a href="${esc(signupUrl)}">Créer ma boutique</a></p>`;
  const breadcrumbItems = [{ name: 'Accueil', url: `${SITE_URL}/` }, { name: 'Devenir vendeur', url: canonical }];

  const plusPrice = `${formatFcfa(PLUS_BILLING.quarterly.priceFcfa)} / 3 mois ou ${formatFcfa(PLUS_BILLING.annual.priceFcfa)} / an`;
  const plusItems = [...PLUS_HIGHLIGHTS.map((h) => h.title), ...PLUS_BENEFITS];
  const cell = (v) => (typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : v);

  const bodyHtml = `
    ${breadcrumbNav(breadcrumbItems)}
    <main>
      <header>
        <h1>Développez votre boutique avec Ezial.</h1>
        <p>Rejoignez une marketplace pensée pour les commerces sénégalais. Présentez vos produits, touchez de nouveaux clients et développez vos ventes en ligne.</p>
        ${cta}
      </header>
      <section>
        <h2>Pourquoi vendre sur Ezial ?</h2>
        <ul>${BENEFITS.map((b) => `<li><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></li>`).join('')}</ul>
      </section>
      <section>
        <h2>Notre mission</h2>
        <ul>${MISSION.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      </section>
      <section>
        <h2>Comment ça marche ?</h2>
        <ol>${STEPS.map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>
      </section>
      <section>
        <h2>Nos formules</h2>
        <div>
          <section><h3>Free</h3><p>0 FCFA</p><ul>${FREE_BENEFITS.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>
          <section><h3>${esc(PLUS_PLAN_NAME)}</h3><p>${esc(plusPrice)}</p><ul>${plusItems.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>
        </div>
        <p>${esc(TRIAL_RULES)}</p>
        <p>${esc(PLAN_END_RULES)}</p>
        <table><thead><tr><th scope="col">Critère</th><th scope="col">Free</th><th scope="col">${esc(PLUS_PLAN_NAME)}</th></tr></thead><tbody>${PLAN_COMPARISON.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(cell(r.free))}</td><td>${esc(cell(r.plus))}</td></tr>`).join('')}</tbody></table>
      </section>
      <section>
        <h2>Prêt à développer votre boutique ?</h2>
        ${cta}
      </section>
    </main>`;

  writeFile('/devenir-vendeur/index.html', renderPage({
    title: META_TITLE,
    description: META_DESCRIPTION,
    canonical,
    bodyHtml,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebPage', name: META_TITLE, url: canonical, description: META_DESCRIPTION, inLanguage: 'fr' },
      breadcrumbJsonLd(breadcrumbItems),
    ],
  }));
  addSitemapUrl({ loc: canonical });

  console.log('prerender-seo: generated the « Devenir vendeur » page.');
}
