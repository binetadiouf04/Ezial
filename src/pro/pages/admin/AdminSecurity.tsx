import AdminMfaCard from '../../components/AdminMfaCard';

// Sécurité du compte administrateur : uniquement la double authentification.
// (Pas de tableau de surveillance : les contrôles sont faits par la base.)
export default function AdminSecurity() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Sécurité du compte</h1>
        <p className="mt-1 text-sm text-ink/55">Protection de la connexion à l’administration Ezial.</p>
      </div>
      <AdminMfaCard />
    </div>
  );
}
