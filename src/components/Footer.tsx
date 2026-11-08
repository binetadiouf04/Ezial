import { useState, type MouseEvent, type ReactNode } from 'react';
import { useApp } from '@/store/AppContext';
import { paymentMethods } from '@/data/payments';
import { CONTACT, SOCIAL_LINKS } from '@/shared/siteInfo';
import { useHasPublishedBlogPosts } from '@/lib/supabaseBlog';
import { Instagram, Facebook, Plus, Mail, MapPin, Phone } from 'lucide-react';

function TikTokIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.73 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
    </svg>
  );
}

interface FooterLinkDef {
  label: string;
  /** In-app route; the link's href is its canonical URL (trailing slash for /info pages). */
  route: string;
}

// Each column is a plain array: insert an entry where it should appear
// (e.g. a conditional « Blog » link in ezialLinks).
const aideLinks: FooterLinkDef[] = [
  { label: 'Aide & FAQ', route: '/info/centre-aide' },
  { label: 'Comment ça marche', route: '/info/comment-ca-marche' },
  { label: 'Livraison & retrait', route: '/info/livraison' },
  { label: 'Paiement', route: '/info/paiement' },
  { label: 'Retours & remboursements', route: '/info/retours' },
  { label: 'Nous contacter', route: '/info/contact' },
];

const ezialLinks: FooterLinkDef[] = [
  { label: 'À propos', route: '/info/a-propos' },
  { label: 'Devenir vendeur', route: '/pro' },
  { label: 'Tarifs vendeurs', route: '/info/tarifs-vendeurs' },
  { label: 'Conditions générales', route: '/info/conditions-generales' },
];

const legalLinks: FooterLinkDef[] = [
  { label: 'Confidentialité', route: '/info/confidentialite' },
  { label: 'Politique de résiliation', route: '/info/politique-de-resiliation' },
  { label: 'Mentions légales', route: '/info/mentions-legales' },
];

function hrefFor(route: string): string {
  return route.startsWith('/info/') || route === '/blog' ? `${route}/` : route;
}

const linkBase = 'text-sm text-white/75 hover:text-white hover:underline transition-colors';

// A real <a href> (followed by search engines, opens in a new tab with
// Ctrl/Cmd); a plain click navigates inside the app.
function FooterLink({ label, route }: FooterLinkDef) {
  const { navigate } = useApp();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(route);
  };
  return (
    <li>
      <a href={hrefFor(route)} onClick={onClick} className={linkBase}>{label}</a>
    </li>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLinkDef[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-3">{title}</h3>
      <ul className="space-y-2">
        {links.map((link) => <FooterLink key={link.route} {...link} />)}
      </ul>
    </div>
  );
}

function MobileAccordion({ title, links }: { title: string; links: FooterLinkDef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/15">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <Plus
          size={16}
          className={`text-white/50 transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96 pb-3' : 'max-h-0'}`}>
        <ul className="space-y-2">
          {links.map((link) => <FooterLink key={link.route} {...link} />)}
        </ul>
      </div>
    </div>
  );
}

const SOCIAL_ICONS: Record<(typeof SOCIAL_LINKS)[number]['id'], (size: number) => ReactNode> = {
  instagram: (size) => <Instagram size={size} aria-hidden="true" />,
  tiktok: (size) => <TikTokIcon size={size - 1} />,
  facebook: (size) => <Facebook size={size} aria-hidden="true" />,
};

const SocialIcons = ({ size = 17, wrapSize = 'h-9 w-9' }: { size?: number; wrapSize?: string }) => (
  <ul className="flex items-center gap-3">
    {SOCIAL_LINKS.map((social) => (
      <li key={social.id}>
        <a
          href={social.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ezial sur ${social.label} (nouvel onglet)`}
          className={`flex ${wrapSize} items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors`}
        >
          {SOCIAL_ICONS[social.id](size)}
        </a>
      </li>
    ))}
  </ul>
);

const ContactRows = () => (
  <ul className="space-y-2.5">
    <li>
      <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 text-sm text-white/75 hover:text-white hover:underline transition-colors">
        <Mail size={14} className="text-white/50 flex-shrink-0" aria-hidden="true" /> {CONTACT.email}
      </a>
    </li>
    <li>
      <a href={CONTACT.phoneHref} className="flex items-center gap-2 text-sm text-white/75 hover:text-white hover:underline transition-colors">
        <Phone size={14} className="text-white/50 flex-shrink-0" aria-hidden="true" /> {CONTACT.phone}
      </a>
    </li>
    <li className="flex items-center gap-2 text-sm text-white/75">
      <MapPin size={14} className="text-white/50 flex-shrink-0" aria-hidden="true" /> {CONTACT.city}
    </li>
  </ul>
);

function BrandLink() {
  const { navigate } = useApp();
  return (
    <a
      href="/"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate('/');
      }}
      className="inline-block font-display font-bold tracking-[0.25em] text-white text-xl select-none"
    >
      EZIAL
    </a>
  );
}

export default function Footer() {
  // « Blog » appears only once at least one article is published.
  const hasBlog = useHasPublishedBlogPosts();
  const ezialColumn = hasBlog
    ? [ezialLinks[0], { label: 'Blog', route: '/blog' }, ...ezialLinks.slice(1)]
    : ezialLinks;
  return (
    <footer className="mt-auto" style={{ backgroundColor: '#4A1223' }}>
      {/* Main footer content */}
      <div style={{ backgroundColor: '#5A0D1E' }}>
        <div className="container-page py-7 lg:py-9">
          {/* Desktop — 4 columns */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-10">
            {/* Column 1 — Brand */}
            <div className="space-y-3">
              <BrandLink />
              <p className="text-sm text-white/75 leading-relaxed max-w-xs">
                Votre marketplace mode, beauté & lifestyle au Sénégal.
              </p>
              <SocialIcons />
            </div>

            <FooterColumn title="Aide" links={aideLinks} />
            <FooterColumn title="Ezial" links={ezialColumn} />

            {/* Column 4 — Contact */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-3">Contact</h3>
              <ContactRows />
            </div>
          </div>

          {/* Mobile — brand + accordions */}
          <div className="lg:hidden">
            <div className="space-y-2.5 mb-4">
              <BrandLink />
              <p className="text-sm text-white/75 leading-relaxed">
                Votre marketplace mode, beauté & lifestyle au Sénégal.
              </p>
              <SocialIcons size={18} wrapSize="h-10 w-10" />
            </div>

            {/* Contact — always visible */}
            <div className="mb-1 pb-3 border-b border-white/15">
              <ContactRows />
            </div>

            <MobileAccordion title="Aide" links={aideLinks} />
            <MobileAccordion title="Ezial" links={ezialColumn} />
          </div>

          {/* Payment methods */}
          <div className="mt-6 pt-5 border-t border-white/15">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2.5">Moyens de paiement</p>
            <ul className="flex flex-wrap items-center gap-2.5">
              {paymentMethods.map((p) => (
                <li key={p.id} className="rounded-md bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/85">
                  {p.label}
                </li>
              ))}
            </ul>
            {/* Remove once Wave / Orange Money online payment is live. */}
            <p className="mt-2 text-xs text-white/50">Paiement en ligne en cours d’activation.</p>
          </div>
        </div>
      </div>

      {/* Legal bottom bar */}
      <div className="border-t border-white/15">
        <div className="container-page py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <p className="text-xs text-white/50">© 2026 Ezial</p>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {legalLinks.map((link) => <FooterLink key={link.route} {...link} />)}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
