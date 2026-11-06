import {
  Truck, Store, ShoppingCart, ShoppingBag, Smartphone, Package, Mail, Phone, MapPin, Gift, ShieldCheck, HelpCircle,
  Shirt, Footprints, Gem, Sparkles, SprayCan, Heart, Scissors, Info, ArrowRight, type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import PricingCards from '@/components/PricingCards';
import PlusHighlights from '@/components/PlusHighlights';
import PlanComparison from '@/components/PlanComparison';
import type { InfoBlock, InfoCard, InfoIcon } from '@/shared/infoPages';
import InfoInline, { InfoAnchor } from './InfoInline';

// Structured blocks of the institutional pages (src/shared/infoPages.js);
// scripts/seo/info.mjs renders the same blocks as plain HTML.

const ICONS: Record<InfoIcon, LucideIcon> = {
  truck: Truck, store: Store, cart: ShoppingCart, bag: ShoppingBag, smartphone: Smartphone, package: Package,
  mail: Mail, phone: Phone, map: MapPin, gift: Gift, shield: ShieldCheck, help: HelpCircle, shirt: Shirt,
  footprints: Footprints, gem: Gem, sparkles: Sparkles, spray: SprayCan, heart: Heart, scissors: Scissors,
};

const CARD_COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

function CardIcon({ icon, emphasis }: { icon?: InfoIcon; emphasis?: boolean }) {
  if (!icon) return null;
  const Icon = ICONS[icon];
  return (
    <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${emphasis ? 'bg-white/15 text-white' : 'bg-cream text-burgundy'}`}>
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}

function Card({ card, horizontal }: { card: InfoCard; horizontal: boolean }) {
  const { emphasis } = card;
  const body = (
    <>
      <CardIcon icon={card.icon} emphasis={emphasis} />
      <div className={`flex min-w-0 flex-1 flex-col ${horizontal ? '' : 'mt-4'}`}>
        <h3 className={`text-base font-semibold leading-snug ${emphasis ? 'font-display text-xl lining-nums text-white sm:text-2xl' : 'text-ink'}`}>{card.title}</h3>
        {card.text && (
          <p className={`mt-1.5 text-sm leading-relaxed sm:text-[15px] ${emphasis ? 'text-white/85' : 'text-ink/65'} break-words`}>
            <InfoInline text={card.text} linkClassName={emphasis ? 'font-medium text-white underline underline-offset-2' : undefined} />
          </p>
        )}
        {card.href && card.linkLabel && (
          <span className={`mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium ${emphasis ? 'text-white' : 'text-burgundy'}`}>
            {card.linkLabel} <ArrowRight size={15} aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );
  const shell = `flex h-full rounded-2xl border p-5 sm:p-6 ${horizontal ? 'flex-row items-start gap-4' : 'flex-col'} ${emphasis ? 'border-burgundy bg-burgundy' : 'border-line bg-white'}`;
  if (card.href) {
    return <InfoAnchor href={card.href} className={`${shell} transition-colors hover:border-burgundy/40 hover:shadow-sm`}>{body}</InfoAnchor>;
  }
  return <div className={shell}>{body}</div>;
}

function CompactCard({ card }: { card: InfoCard }) {
  const Icon = card.icon ? ICONS[card.icon] : null;
  const content = (
    <>
      {Icon && <Icon size={19} className="flex-shrink-0 text-burgundy" aria-hidden="true" />}
      <span className="min-w-0 text-sm font-medium text-ink sm:text-[15px]">{card.title}</span>
    </>
  );
  const cls = 'flex h-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5';
  return card.href
    ? <InfoAnchor href={card.href} className={`${cls} transition-colors hover:border-burgundy/40 hover:bg-cream/60`}>{content}</InfoAnchor>
    : <div className={cls}>{content}</div>;
}

export default function InfoBlockView({ block }: { block: InfoBlock }) {
  const { navigate } = useApp();

  switch (block.type) {
    case 'highlight':
      if (block.tone === 'delivery') {
        return (
          <div className="flex items-center gap-4 rounded-2xl bg-burgundy px-5 py-5 text-white sm:gap-5 sm:px-7 sm:py-6">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/15 sm:h-14 sm:w-14">
              <Truck size={26} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold leading-tight lining-nums sm:text-3xl">{block.title}</p>
              {block.text && <p className="mt-1 text-sm leading-relaxed text-white/85 sm:text-[15px]">{block.text}</p>}
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-start gap-3.5 rounded-2xl border border-champagne/60 bg-champagne/10 p-5 sm:p-6" role="note">
          <Info size={22} className="mt-0.5 flex-shrink-0 text-burgundy" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">{block.title}</p>
            {block.text && <p className="mt-1 text-sm leading-relaxed text-ink/65 sm:text-[15px]">{block.text}</p>}
          </div>
        </div>
      );

    case 'cards': {
      const columns = block.columns ?? 3;
      if (block.compact) {
        return (
          <ul className={`grid grid-cols-2 gap-3 ${columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {block.items.map((card) => <li key={card.title} className="min-w-0"><CompactCard card={card} /></li>)}
          </ul>
        );
      }
      return (
        <ul className={`grid gap-4 ${CARD_COLUMNS[columns]}`}>
          {block.items.map((card) => <li key={card.title} className="min-w-0"><Card card={card} horizontal={columns === 1} /></li>)}
        </ul>
      );
    }

    case 'steps':
      return (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((step, i) => (
            <li key={step.title} className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-5 sm:p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-burgundy text-base font-semibold text-white" aria-hidden="true">{i + 1}</span>
              <h3 className="mt-4 text-base font-semibold leading-snug text-ink">
                <span className="sr-only">Étape {i + 1} : </span>{step.title}
              </h3>
              <p className="mt-1.5 break-words text-sm leading-relaxed text-ink/65 sm:text-[15px]"><InfoInline text={step.text} /></p>
            </li>
          ))}
        </ol>
      );

    case 'facts':
      return (
        <dl className="rounded-2xl border border-line bg-cream/60 px-5 py-2 sm:px-6">
          {block.items.map((item) => (
            <div key={item.label} className="border-b border-line/80 py-3 last:border-0 sm:grid sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm text-ink/55">{item.label}</dt>
              <dd className="mt-0.5 break-words text-[15px] font-medium text-ink sm:mt-0">
                {item.href ? <InfoAnchor href={item.href} className="text-burgundy hover:underline">{item.value}</InfoAnchor> : item.value}
              </dd>
            </div>
          ))}
        </dl>
      );

    case 'links':
      return (
        <div className="flex flex-wrap gap-3">
          {block.items.map((link) => (
            <InfoAnchor key={link.href} href={link.href} className={link.primary ? 'btn-primary' : 'btn-outline'}>
              {link.label} {link.primary && <ArrowRight size={15} aria-hidden="true" />}
            </InfoAnchor>
          ))}
        </div>
      );

    case 'pricingCards': {
      const goToSellerSignup = () => navigate('/pro');
      return <PricingCards onContinueFree={goToSellerSignup} onStartTrial={goToSellerSignup} onSubscribe={goToSellerSignup} />;
    }

    case 'plusHighlights':
      return <PlusHighlights tone="light" />;

    case 'planComparison':
      return <PlanComparison />;

    default:
      return null;
  }
}
