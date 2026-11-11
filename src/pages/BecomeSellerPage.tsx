import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Eye, HeartHandshake, LayoutDashboard, Loader2, Store, Truck, type LucideIcon } from 'lucide-react';
import { applyHeadTags, DEFAULT_OG_IMAGE, SITE_URL } from '@/lib/seoHead';
import { useSellerEntry, type SellerIntent } from '@/lib/sellerIntent';
import { PLUS_PLAN_NAME, TRIAL_DAYS, TRIAL_RULES, PLAN_END_RULES } from '@/data/subscriptionPlans';
import PricingCards from '@/components/PricingCards';
import PlanComparison from '@/components/PlanComparison';

// « Devenir vendeur » (/devenir-vendeur): the public page that presents
// selling on Ezial. Every button goes through useSellerEntry().startSelling,
// which keeps the chosen plan and routes the visitor to account creation,
// login or their existing shop — nothing is activated or charged here.
//
// The static SEO version (scripts/seo/become-seller.mjs) carries the same
// texts and the same title / description / canonical: keep both in sync.
// Plan numbers always come from src/shared/plans.js, never typed here.

const META_TITLE = 'Devenir vendeur sur Ezial — Créez votre boutique en ligne | Ezial';
const META_DESCRIPTION = `Créez votre boutique sur Ezial, la marketplace sénégalaise : présentez vos produits et touchez de nouveaux clients. Formule Free ou ${PLUS_PLAN_NAME}.`;
const CANONICAL = `${SITE_URL}/devenir-vendeur/`;

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Eye, title: 'Plus de visibilité', text: 'Votre boutique est présentée aux clients qui parcourent Ezial : catalogue, recherche et catégories.' },
  { icon: Store, title: 'Votre boutique en ligne', text: 'Une vitrine à votre nom : photos, descriptions, prix, tailles, couleurs et variantes.' },
  { icon: Truck, title: 'Livraison organisée', text: 'Ezial organise la collecte et la livraison de vos commandes à Dakar.' },
  { icon: LayoutDashboard, title: 'Gestion simplifiée', text: 'Commandes, stocks, ventes et revenus suivis depuis un seul espace.' },
  { icon: HeartHandshake, title: 'Accompagnement', text: 'L’équipe Ezial vous aide à configurer votre boutique et à présenter vos produits.' },
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

// Burgundy band with satin waves and a fine beige geometric pattern (brand
// identity), purely decorative. `patternId` must be unique on the page.
function BrandBand({ patternId, children, className = '' }: { patternId: string; children: ReactNode; className?: string }) {
  return (
    <section className={`relative isolate overflow-hidden bg-burgundy text-white ${className}`}>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
        <defs>
          <pattern id={patternId} width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M22 0 44 22 22 44 0 22Z" fill="none" stroke="#D8C6C2" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity="0.07" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 1440 400" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-3/4 w-full">
        <path d="M0 260C240 180 420 330 720 260S1200 150 1440 220V400H0Z" fill="#8C1024" opacity="0.35" />
        <path d="M0 320C300 250 520 380 820 320S1260 250 1440 300V400H0Z" fill="#ffffff" opacity="0.04" />
      </svg>
      {children}
    </section>
  );
}

function CtaButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-burgundy transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
      Créer ma boutique
      {loading ? null : <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />}
    </button>
  );
}

export default function BecomeSellerPage() {
  const { startSelling, busy } = useSellerEntry();
  // Which « Créer ma boutique » button was pressed, to show its spinner.
  const [pressed, setPressed] = useState<'hero' | 'final' | null>(null);

  useEffect(() => {
    applyHeadTags({
      title: META_TITLE, description: META_DESCRIPTION, canonical: CANONICAL,
      ogTitle: META_TITLE, ogDescription: META_DESCRIPTION, ogImage: DEFAULT_OG_IMAGE, ogType: 'website',
    });
  }, []);

  const go = (intent: SellerIntent | null, source: 'hero' | 'final' | null = null) => {
    if (busy) return;
    setPressed(source);
    void startSelling(intent);
  };

  return (
    <div className="bg-cream text-ink">
      {/* 1. Hero */}
      <BrandBand patternId="become-seller-hero-pattern">
        <div className="container-pro py-16 sm:py-24 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-beige">Devenir vendeur</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tightish sm:text-5xl lg:text-6xl">
              Développez votre boutique avec Ezial.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              Rejoignez une marketplace pensée pour les commerces sénégalais. Présentez vos produits, touchez de nouveaux clients et développez vos ventes en ligne.
            </p>
            <div className="mt-8">
              <CtaButton onClick={() => go(null, 'hero')} loading={busy && pressed === 'hero'} disabled={busy} />
            </div>
          </div>
        </div>
      </BrandBand>

      {/* 2. Pourquoi vendre sur Ezial ? */}
      <section aria-labelledby="become-seller-why" className="container-pro py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow mb-2">Vendre sur Ezial</p>
          <h2 id="become-seller-why" className="section-title">Pourquoi vendre sur Ezial ?</h2>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-burgundy/[0.06] text-burgundy">
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/65">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Notre mission */}
      <section aria-labelledby="become-seller-mission" className="border-y border-line bg-white">
        <div className="container-pro grid gap-8 py-16 sm:py-20 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 id="become-seller-mission" className="section-title">Notre mission</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink/60 sm:text-base">La marketplace sénégalaise qui rassemble vos boutiques préférées.</p>
          </div>
          <ul className="space-y-4">
            {MISSION.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-ink/80">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-burgundy/30 text-burgundy">
                  <Check size={12} strokeWidth={1.5} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Comment ça marche ? */}
      <section aria-labelledby="become-seller-steps" className="container-pro py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow mb-2">En {STEPS.length} étapes</p>
          <h2 id="become-seller-steps" className="section-title">Comment ça marche ?</h2>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy font-display text-lg font-semibold text-white" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                <span className="sr-only">Étape {i + 1} : </span>{step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/65">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 5. Nos formules */}
      <section aria-labelledby="become-seller-plans" className="border-t border-line bg-white">
        <div className="container-pro py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="eyebrow mb-2">Tarifs</p>
            <h2 id="become-seller-plans" className="section-title">Nos formules</h2>
            <p className="mt-3 text-sm text-ink/60 sm:text-base">Commencez gratuitement avec Free, ou essayez {PLUS_PLAN_NAME} pendant {TRIAL_DAYS} jours.</p>
          </div>
          <div className="mx-auto max-w-5xl">
            <PricingCards
              freeButtonLabel="Continuer gratuitement"
              onContinueFree={() => go({ kind: 'free' })}
              onStartTrial={() => go({ kind: 'trial' })}
              onSubscribe={(period) => go({ kind: 'subscribe', period })}
            />
            <div className="mt-6 space-y-1.5 text-center text-xs leading-relaxed text-ink/50">
              <p>{TRIAL_RULES}</p>
              <p>{PLAN_END_RULES}</p>
            </div>
            <PlanComparison className="mt-10" />
          </div>
        </div>
      </section>

      {/* 6. Appel final */}
      <BrandBand patternId="become-seller-final-pattern">
        <div className="container-pro py-16 text-center sm:py-20">
          <h2 className="mx-auto max-w-xl font-display text-3xl font-semibold leading-tight tracking-tightish sm:text-4xl">
            Prêt à développer votre boutique ?
          </h2>
          <div className="mt-8">
            <CtaButton onClick={() => go(null, 'final')} loading={busy && pressed === 'final'} disabled={busy} />
          </div>
        </div>
      </BrandBand>
    </div>
  );
}
