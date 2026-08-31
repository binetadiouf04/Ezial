import { useState } from 'react';
import { usePro } from '../ProContext';
import type { Role } from '../data';
import RoleCard from '../components/RoleCard';
import LoginForm from '../components/LoginForm';
import SellerLayout from '../layouts/SellerLayout';
import DriverLayout from '../layouts/DriverLayout';
import AdminLayout from '../layouts/AdminLayout';
import { ArrowLeft } from 'lucide-react';

export default function ProEntryPage() {
  const { role, login, logout } = usePro();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // If seller is logged in, render the seller layout
  if (role === 'seller') {
    return <SellerLayout />;
  }

  // If driver is logged in, render the driver layout
  if (role === 'driver') {
    return <DriverLayout />;
  }

  // If admin is logged in, render the admin layout
  if (role === 'admin') {
    return <AdminLayout />;
  }

  // Login form for selected role
  if (selectedRole) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <LoginForm role={selectedRole} onBack={() => setSelectedRole(null)} onLogin={(id, name) => login(selectedRole, id, name)} />
      </div>
    );
  }

  // Role selection
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="container-pro flex-1 flex flex-col items-center justify-center py-12">
        <button onClick={() => { window.location.hash = '/'; }} className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
          <ArrowLeft size={16} /> Marketplace
        </button>

        <div className="text-center mb-10 slide-up">
          <p className="eyebrow mb-3">Ezial Pro</p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Bienvenue sur Ezial Pro</h1>
          <p className="mt-3 max-w-md text-sm text-ink/55">Gérez votre activité depuis un espace simple et sécurisé.</p>
        </div>

        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          <RoleCard role="admin" title="Administration" description="Gérez la marketplace, les boutiques, les commandes et les opérations." onSelect={() => setSelectedRole('admin')} />
          <RoleCard role="seller" title="Vendeur" description="Gérez vos produits, commandes, stocks et revenus." onSelect={() => setSelectedRole('seller')} />
          <RoleCard role="driver" title="Livreur" description="Consultez et acceptez vos missions de livraison." onSelect={() => setSelectedRole('driver')} />
        </div>
      </div>
    </div>
  );
}
