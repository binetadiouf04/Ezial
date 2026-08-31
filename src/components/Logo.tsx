export default function Logo({ className = '', onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`font-display font-bold tracking-[0.25em] text-burgundy text-xl select-none ${className}`} aria-label="EZIAL accueil">
      EZIAL
    </button>
  );
}
