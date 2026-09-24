import { supabase } from './supabaseClient';

// Réel CRUD multi-adresses client, backé par customer_addresses (RLS:
// customer_id = auth.uid()). Distinct du couple quartier/landmark de
// customer_profiles, qui reste l'adresse "par défaut" affichée ailleurs —
// aucun des deux n'est dupliqué depuis l'autre, ce sont deux besoins
// différents (une seule adresse de profil vs un carnet d'adresses).

export interface CustomerAddress {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  quartier: string;
  city: string;
  instructions: string;
  isDefault: boolean;
}

interface CustomerAddressRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line: string;
  quartier: string | null;
  city: string | null;
  instructions: string | null;
  is_default: boolean;
}

function mapAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    phone: row.phone ?? '',
    addressLine: row.address_line,
    quartier: row.quartier ?? '',
    city: row.city ?? '',
    instructions: row.instructions ?? '',
    isDefault: row.is_default,
  };
}

export interface CustomerAddressInput {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  quartier: string;
  city: string;
  instructions: string;
}

export async function fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as CustomerAddressRow[]).map(mapAddress);
}

export async function createCustomerAddress(customerId: string, input: CustomerAddressInput, makeDefault: boolean): Promise<{ address?: CustomerAddress; error?: string }> {
  const { data, error } = await supabase
    .from('customer_addresses')
    .insert({
      customer_id: customerId,
      first_name: input.firstName.trim() || null,
      last_name: input.lastName.trim() || null,
      phone: input.phone.trim() || null,
      address_line: input.addressLine.trim(),
      quartier: input.quartier || null,
      city: input.city.trim() || null,
      instructions: input.instructions.trim() || null,
      is_default: false,
    })
    .select('*')
    .single();
  if (error || !data) return { error: error?.message ?? 'Impossible de créer l\'adresse.' };
  const address = mapAddress(data as CustomerAddressRow);
  if (makeDefault) {
    const result = await setDefaultCustomerAddress(customerId, address.id);
    if (result.error) return { error: result.error };
    return { address: { ...address, isDefault: true } };
  }
  return { address };
}

export async function updateCustomerAddress(id: string, input: CustomerAddressInput): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('customer_addresses')
    .update({
      first_name: input.firstName.trim() || null,
      last_name: input.lastName.trim() || null,
      phone: input.phone.trim() || null,
      address_line: input.addressLine.trim(),
      quartier: input.quartier || null,
      city: input.city.trim() || null,
      instructions: input.instructions.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteCustomerAddress(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

// Deux updates séparées (jamais deux lignes à is_default=true en même
// temps) — respecte l'index unique partiel "un seul favori par client".
export async function setDefaultCustomerAddress(customerId: string, id: string): Promise<{ error?: string }> {
  const { error: unsetError } = await supabase
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId)
    .eq('is_default', true)
    .neq('id', id);
  if (unsetError) return { error: unsetError.message };

  const { error: setError } = await supabase
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', id);
  return setError ? { error: setError.message } : {};
}
