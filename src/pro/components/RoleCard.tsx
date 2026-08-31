import type { Role } from '../data';
import { ShieldCheck, Store, Bike } from 'lucide-react';

interface RoleCardProps {
  role: Role;
  title: string;
  description: string;
  onSelect: () => void;
}

const icons: Record<Role, typeof ShieldCheck> = {
  admin: ShieldCheck,
  seller: Store,
  driver: Bike,
};

export default function RoleCard({ role, title, description, onSelect }: RoleCardProps) {
  const Icon = icons[role];
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col items-start gap-4 rounded-2xl border border-line bg-white p-7 text-left transition-all hover:border-burgundy/30 hover:card-shadow slide-up"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-burgundy/8 text-burgundy transition-colors group-hover:bg-burgundy group-hover:text-white">
        <Icon size={24} />
      </div>
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm text-ink/55 leading-relaxed">{description}</p>
      </div>
      <span className="mt-auto text-sm font-medium text-burgundy group-hover:underline">Continuer →</span>
    </button>
  );
}
