import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Instagram, Facebook, Plus, Phone, Mail, MapPin } from 'lucide-react';

function TikTokIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.73 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
    </svg>
  );
}

const serviceLinks = [
  { label: 'Centre d\'aide', route: '/info/centre-aide' },
  { label: 'Livraison & retrait', route: '/info/livraison' },
  { label: 'Paiement', route: '/info/paiement' },
  { label: 'Retours & remboursements', route: '/info/retours' },
  { label: 'Nous contacter', route: '/info/contact' },
];

const ezialLinks = [
  { label: 'À propos', route: '/info/a-propos' },
  { label: 'Comment ça marche', route: '/info/comment-ca-marche' },
  { label: 'Devenir vendeur', route: '/pro' },
  { label: 'Ezial Pro', route: '/pro' },
  { label: 'Conditions générales', route: '/info/conditions-generales' },
];

const legalLinks = [
  { label: 'Conditions générales', route: '/info/conditions-generales' },
  { label: 'Politique de confidentialité', route: '/info/confidentialite' },
  { label: 'Mentions légales', route: '/info/mentions-legales' },
];

const linkBase = 'text-sm text-white/75 hover:text-white hover:underline transition-colors text-left';

function FooterLink({ label, route }: { label: string; route: string }) {
  const { navigate } = useApp();
  return (
    <li>
      <button onClick={() => navigate(route)} className={linkBase}>{label}</button>
    </li>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-4">{title}</h3>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function MobileAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/15">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <Plus
          size={16}
          className={`text-white/50 transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
        />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96 pb-4' : 'max-h-0'}`}>
        <ul className="space-y-3">{children}</ul>
      </div>
    </div>
  );
}

export default function Footer() {
  const { navigate } = useApp();

  return (
    <footer className="mt-auto" style={{ backgroundColor: '#4A1223' }}>
      {/* Main footer content */}
      <div style={{ backgroundColor: '#651D32' }}>
        <div className="container-page py-12 lg:py-14">
          {/* Desktop — 4 columns */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-10">
            {/* Column 1 — Brand */}
            <div className="space-y-4">
              <button
                onClick={() => navigate('/')}
                className="font-display font-bold tracking-[0.25em] text-white text-xl select-none"
              >
                EZIAL
              </button>
              <p className="text-sm text-white/75 leading-relaxed max-w-xs">
                Votre marketplace mode, beauté & lifestyle au Sénégal.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram size={17} />
                </a>
                <a
                  href="https://tiktok.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="TikTok"
                >
                  <TikTokIcon size={16} />
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook size={17} />
                </a>
              </div>
            </div>

            {/* Column 2 — Service client */}
            <FooterColumn title="Service client">
              {serviceLinks.map((link, i) => (
                <FooterLink key={i} label={link.label} route={link.route} />
              ))}
            </FooterColumn>

            {/* Column 3 — Ezial */}
            <FooterColumn title="Ezial">
              {ezialLinks.map((link, i) => (
                <FooterLink key={i} label={link.label} route={link.route} />
              ))}
            </FooterColumn>

            {/* Column 4 — Contact */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-4">Contact</h3>
              <div className="space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <MapPin size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/50">Adresse commerciale</p>
                    <p className="text-sm text-white/75">Dakar, Sénégal</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Phone size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/50">Téléphone commercial</p>
                    <a href="tel:+221770000000" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                      +221 77 000 00 00
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Phone size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/50">Assistance client</p>
                    <a href="tel:+221780000000" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                      +221 78 000 00 00
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Mail size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/50">Email</p>
                    <a href="mailto:contact@ezial.sn" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                      contact@ezial.sn
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile — brand + accordions */}
          <div className="lg:hidden">
            {/* Brand */}
            <div className="space-y-3 mb-5">
              <button
                onClick={() => navigate('/')}
                className="font-display font-bold tracking-[0.25em] text-white text-xl select-none"
              >
                EZIAL
              </button>
              <p className="text-sm text-white/75 leading-relaxed">
                Votre marketplace mode, beauté & lifestyle au Sénégal.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://tiktok.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="TikTok"
                >
                  <TikTokIcon size={17} />
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook size={18} />
                </a>
              </div>
            </div>

            {/* Contact essentials — always visible */}
            <div className="space-y-3 mb-5 pb-5 border-b border-white/15">
              <div className="flex items-start gap-2.5">
                <MapPin size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-white/50">Adresse commerciale</p>
                  <p className="text-sm text-white/75">Dakar, Sénégal</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail size={15} className="text-white/50 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-white/50">Email</p>
                  <a href="mailto:contact@ezial.sn" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                    contact@ezial.sn
                  </a>
                </div>
              </div>
            </div>

            {/* Accordion sections */}
            <MobileAccordion title="Service client">
              {serviceLinks.map((link, i) => (
                <FooterLink key={i} label={link.label} route={link.route} />
              ))}
            </MobileAccordion>
            <MobileAccordion title="Ezial">
              {ezialLinks.map((link, i) => (
                <FooterLink key={i} label={link.label} route={link.route} />
              ))}
            </MobileAccordion>
            <MobileAccordion title="Contact">
              <li className="space-y-1">
                <p className="text-xs text-white/50">Téléphone commercial</p>
                <a href="tel:+221770000000" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                  +221 77 000 00 00
                </a>
              </li>
              <li className="space-y-1">
                <p className="text-xs text-white/50">Assistance client</p>
                <a href="tel:+221780000000" className="text-sm text-white/75 hover:text-white hover:underline transition-colors">
                  +221 78 000 00 00
                </a>
              </li>
            </MobileAccordion>
          </div>

          {/* Payment methods */}
          <div className="mt-8 pt-6 border-t border-white/15">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-3">Paiements acceptés</p>
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white/85">
                Wave
              </span>
              <span className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white/85">
                Orange Money
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Legal bottom bar */}
      <div className="border-t border-white/15">
        <div className="container-page py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/50">© 2026 Ezial — Tous droits réservés</p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {legalLinks.map((link, i) => (
                <FooterLink key={i} label={link.label} route={link.route} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
