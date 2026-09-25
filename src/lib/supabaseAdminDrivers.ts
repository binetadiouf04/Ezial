import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// Real, Supabase-backed driver management for the admin area — replaces
// the local mock array entirely (see ProContext's allDrivers/createDriver).

// IMPORTANT: this project's Edge Functions get a dashboard-assigned deploy
// slug that can differ from their source folder name — delete-account's
// own slug is "bright-api" (see supabaseAccountDeletion.ts), not
// "delete-account". After deploying create-driver, confirm its actual slug
// in the Supabase dashboard and update this constant if it differs.
const CREATE_DRIVER_FUNCTION_SLUG = 'create-driver';

export interface AdminDriverSummary {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string | null;
  isSuspended: boolean;
  hasPinConfigured: boolean;
  createdAt: string;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  is_suspended: boolean;
  pin_setup_required: boolean;
  pin_hash: string | null;
  created_at: string;
}

function mapDriver(row: ProfileRow): AdminDriverSummary {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    username: row.username ?? '',
    phone: row.phone,
    isSuspended: row.is_suspended,
    // pin_hash is never selected here for real (see fetchAdminDrivers) —
    // this field is only ever derived from pin_setup_required.
    hasPinConfigured: !row.pin_setup_required,
    createdAt: row.created_at,
  };
}

export async function fetchAdminDrivers(): Promise<AdminDriverSummary[]> {
  // Never select pin_hash, even though the "Admins can view driver
  // profiles" policy would technically allow it — the column simply isn't
  // requested, so it never reaches the browser.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, username, phone, is_suspended, pin_setup_required, created_at')
    .eq('role', 'driver')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as ProfileRow[]).map(mapDriver);
}

async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to the generic message below
    }
  }
  return fallback;
}

export interface CreateDriverInput {
  firstName: string;
  lastName: string;
  username: string;
  phone?: string;
}

export async function createAdminDriver(input: CreateDriverInput): Promise<{ username: string; firstName: string; lastName: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke<{ id: string; username: string; firstName: string; lastName: string }>(
    CREATE_DRIVER_FUNCTION_SLUG,
    { body: input },
  );
  if (error) return { error: await readFunctionError(error, 'Impossible de créer le livreur.') };
  if (!data) return { error: 'Impossible de créer le livreur.' };
  return { username: data.username, firstName: data.firstName, lastName: data.lastName };
}

export async function setAdminDriverSuspended(driverId: string, suspended: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_set_driver_status', { p_driver_id: driverId, p_suspended: suspended });
  return error ? { error: error.message } : {};
}

export async function resetAdminDriverPin(driverId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_reset_driver_pin', { p_driver_id: driverId });
  return error ? { error: error.message } : {};
}
