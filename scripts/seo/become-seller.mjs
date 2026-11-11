// Static (crawlable) version of « Devenir vendeur » (/devenir-vendeur/).
// Called by scripts/prerender-seo.mjs with the shared helpers (ctx).
//
// All texts, the title and the description come from
// src/shared/becomeSeller.js — the same module as the React page
// (src/pages/BecomeSellerPage.tsx) — and plan numbers from src/shared/plans.js.
import {
  FREE_BENEFITS, PLUS_BENEFITS, PLUS_HIGHLIGHTS, PLAN_COMPARISON, PLUS_PLAN_NAME, PLUS_BILLING,
  TRIAL_RULES, PLAN_END_RULES, formatFcfa,
} from '../../src/shared/plans.js';
import {
  BECOME_SELLER_PATH, BECOME_SELLER_META, BECOME_SELLER_HERO, BECOME_SELLER_SUMMARY, BECOME_SELLER_BENEFITS,
  BECOME_SELLER_MISSION_TAGLINE, BECOME_SELLER_MISSION, BECOME_SELLER_STEPS, BECOME_SELLER_FAQ, becomeSellerFaqJsonLd,
} from '../../src/shared/becomeSeller.js';

const META_TITLE = BECOME_SELLER_META.title;
const META_DESCRIPTION = BECOME_SELLER_META.description;
const BENEFITS = BECOME_SELLER_BENEFITS;
const MISSION = BECOME_SELLER_MISSION;
const STEPS = BECOME_SELLER_STEPS;

export async function buildBecomeSellerPage(ctx) {
  const { SITE_URL, esc, renderPage, writeFile, breadcrumbNav, breadcrumbJsonLd, addSitemapUrl } = ctx;

  const canonical = `${SITE_URL}${BECOME_SELLER_PATH}`;
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
        <p>${esc(BECOME_SELLER_HERO.eyebrow)}</p>
        <h1>${esc(BECOME_SELLER_HERO.title)}</h1>
        <p>${esc(BECOME_SELLER_HERO.text)}</p>
        ${cta}
      </header>
      <section>
        <h2>En bref</h2>
        ${BECOME_SELLER_SUMMARY.map((line) => `<p>${esc(line)}</p>`).join('')}
      </section>
      <section>
        <h2>Pourquoi vendre sur Ezial ?</h2>
        <ul>${BENEFITS.map((b) => `<li><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></li>`).join('')}</ul>
      </section>
      <section>
        <h2>Notre mission</h2>
        <p>${esc(BECOME_SELLER_MISSION_TAGLINE)}</p>
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
        <h2>Questions fréquentes sur la vente sur Ezial</h2>
        ${BECOME_SELLER_FAQ.map(({ q, a }) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
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
      {
        '@context': 'https://schema.org', '@type': 'WebPage', name: META_TITLE, url: canonical, description: META_DESCRIPTION, inLanguage: 'fr',
        about: { '@type': 'Organization', name: 'Ezial', url: `${SITE_URL}/`, areaServed: { '@type': 'Country', name: 'Sénégal' } },
      },
      becomeSellerFaqJsonLd(),
      breadcrumbJsonLd(breadcrumbItems),
    ],
  }));
  addSitemapUrl({ loc: canonical });

  console.log('prerender-seo: generated the « Devenir vendeur » page.');
}
