// Static (crawlable) versions of the institutional pages /info/<slug>/.
// Called by scripts/prerender-seo.mjs with the shared helpers (ctx).
//
// Same content as the React pages: both read src/shared/infoPages.js and the
// same Markdown parser, so the HTML served to crawlers and what visitors see
// stay identical (headings, anchors, texts). Every page is complete, never a
// summary. Aliases (/info/faq) are not generated: the client router shows
// the main page, whose canonical URL is the only one listed.
import { INFO_PAGES, getInfoSegments, getInfoHeadings } from '../../src/shared/infoPages.js';
import { markdownToHtml, safeHref } from '../../src/shared/markdown.js';
import { COMPANY, CONTACT } from '../../src/shared/siteInfo.js';
import {
  FREE_BENEFITS, PLUS_BENEFITS, PLUS_HIGHLIGHTS, PLAN_COMPARISON, PLUS_PLAN_NAME, PLUS_BILLING, formatFcfa,
} from '../../src/shared/plans.js';

export async function buildInfoPages(ctx) {
  const { SITE_URL, esc, renderPage, writeFile, breadcrumbNav, breadcrumbJsonLd, addSitemapUrl } = ctx;

  const abs = (href) => (href.startsWith('/') ? `${SITE_URL}${href}` : href);
  const link = (href, label) => {
    const target = safeHref(href);
    if (!target) return esc(label);
    const rel = target.external ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a href="${esc(abs(target.href))}"${rel}>${esc(label)}</a>`;
  };
  // Inline Markdown of a card / step (single paragraph) without its <p>.
  const inline = (text) => markdownToHtml(text, { siteUrl: SITE_URL }).replace(/^<p>/, '').replace(/<\/p>$/, '');

  const organizationEntity = {
    '@type': 'Organization',
    name: COMPANY.name,
    legalName: COMPANY.denomination,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/apple-touch-icon.png`,
    email: CONTACT.email,
    telephone: CONTACT.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.address.replace(/,\s*Dakar,\s*Sénégal$/, ''),
      addressLocality: 'Dakar',
      addressCountry: 'SN',
    },
  };
  const organization = { '@context': 'https://schema.org', ...organizationEntity };

  function blockHtml(block) {
    switch (block.type) {
      case 'highlight':
        return `<aside><p><strong>${esc(block.title)}</strong></p>${block.text ? `<p>${esc(block.text)}</p>` : ''}</aside>`;
      case 'cards':
        return `<ul>${block.items.map((c) => {
          if (block.compact) return `<li>${c.href ? link(c.href, c.title) : esc(c.title)}</li>`;
          const title = c.href ? link(c.href, c.title) : esc(c.title);
          return `<li><h3>${title}</h3>${c.text ? `<p>${inline(c.text)}</p>` : ''}${c.href && c.linkLabel ? `<p>${link(c.href, c.linkLabel)}</p>` : ''}</li>`;
        }).join('')}</ul>`;
      case 'steps':
        return `<ol>${block.items.map((s) => `<li><h3>${esc(s.title)}</h3><p>${inline(s.text)}</p></li>`).join('')}</ol>`;
      case 'facts':
        return `<dl>${block.items.map((i) => `<dt>${esc(i.label)}</dt><dd>${i.href ? link(i.href, i.value) : esc(i.value)}</dd>`).join('')}</dl>`;
      case 'links':
        return `<p>${block.items.map((l) => link(l.href, l.label)).join(' · ')}</p>`;
      case 'pricingCards': {
        const plusPrice = `${formatFcfa(PLUS_BILLING.quarterly.priceFcfa)} / 3 mois ou ${formatFcfa(PLUS_BILLING.annual.priceFcfa)} / an`;
        const plusItems = [...PLUS_HIGHLIGHTS.map((h) => h.title), ...PLUS_BENEFITS];
        return `<div>
          <section><h3>Free</h3><p>Gratuit</p><ul>${FREE_BENEFITS.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><p>${link('/pro', 'Commencer avec Free')}</p></section>
          <section><h3>${esc(PLUS_PLAN_NAME)}</h3><p>${esc(plusPrice)}</p><ul>${plusItems.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><p>${link('/pro', `Essayer ${PLUS_PLAN_NAME}`)}</p></section>
        </div>`;
      }
      case 'planComparison': {
        const cell = (v) => (typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : v);
        return `<table><thead><tr><th scope="col">Critère</th><th scope="col">Free</th><th scope="col">${esc(PLUS_PLAN_NAME)}</th></tr></thead><tbody>${PLAN_COMPARISON.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(cell(r.free))}</td><td>${esc(cell(r.plus))}</td></tr>`).join('')}</tbody></table>`;
      }
      default:
        return '';
    }
  }

  const otherPagesNav = (current) => `<nav aria-label="Informations Ezial"><ul>${INFO_PAGES.filter((p) => p.slug !== current)
    .map((p) => `<li>${link(`/info/${p.slug}/`, p.breadcrumb ?? p.title)}</li>`).join('')}</ul></nav>`;

  for (const page of INFO_PAGES) {
    const canonical = `${SITE_URL}/info/${page.slug}/`;
    const label = page.breadcrumb ?? page.title;
    const breadcrumbItems = [{ name: 'Accueil', url: `${SITE_URL}/` }, { name: label, url: canonical }];

    const toc = page.toc ? getInfoHeadings(page).filter((h) => h.level === 2) : [];
    const tocHtml = toc.length > 1
      ? `<nav aria-label="Sommaire"><p><strong>Sommaire</strong></p><ol>${toc.map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')}</ol></nav>`
      : '';

    const contentHtml = getInfoSegments(page)
      .map((s) => (s.type === 'markdown' ? markdownToHtml(s.markdown, { siteUrl: SITE_URL }) : blockHtml(s.block)))
      .join('\n');

    const bodyHtml = `
    ${breadcrumbNav(breadcrumbItems)}
    <main>
      <header>
        <h1>${esc(page.title)}</h1>
        ${page.intro ? `<p>${esc(page.intro)}</p>` : ''}
        ${page.updated ? `<p>Dernière mise à jour : ${esc(page.updated)}</p>` : ''}
      </header>
      ${tocHtml}
      <article>
${contentHtml}
      </article>
      ${otherPagesNav(page.slug)}
    </main>`;

    const jsonLd = [breadcrumbJsonLd(breadcrumbItems)];
    if (page.jsonLdType === 'Organization') jsonLd.unshift(organization);
    if (page.jsonLdType === 'AboutPage') {
      jsonLd.unshift({
        '@context': 'https://schema.org', '@type': 'AboutPage', name: page.title, url: canonical, description: page.description, inLanguage: 'fr',
        about: { '@type': 'Organization', name: COMPANY.name, url: `${SITE_URL}/` },
      });
    }
    if (page.jsonLdType === 'ContactPage') {
      jsonLd.unshift({
        '@context': 'https://schema.org', '@type': 'ContactPage', name: page.title, url: canonical, description: page.description, inLanguage: 'fr',
        mainEntity: {
          ...organizationEntity,
          contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', email: CONTACT.email, telephone: CONTACT.phone, areaServed: 'SN', availableLanguage: 'French' },
        },
      });
    }

    writeFile(`/info/${page.slug}/index.html`, renderPage({
      title: page.metaTitle,
      description: page.description,
      canonical,
      bodyHtml,
      jsonLd,
    }));
    addSitemapUrl({ loc: canonical, lastmod: page.updatedIso ? Date.parse(page.updatedIso) : undefined });
  }

  console.log(`prerender-seo: generated ${INFO_PAGES.length} info page(s).`);
}
