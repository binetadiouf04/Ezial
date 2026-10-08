import { supabase } from './supabaseClient';

// Real Supabase-backed admin notification feed (public.admin_notifications)
// — currently only ever written by the handle_auth_user_email_confirmed()
// DB trigger when a seller's shop auto-activates. Purely informational:
// nothing here ever blocks or reverses that activation.

export interface AdminNotification {
  id: string;
  type: string;
  message: string;
  shopId: string | null;
  isRead: boolean;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): AdminNotification {
  return {
    id: row.id as string,
    type: row.type as string,
    message: row.message as string,
    shopId: (row.shop_id as string | null) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchAdminNotifications(limit = 50): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function fetchUnreadAdminNotificationCount(): Promise<number> {
  const { count } = await supabase
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  return count ?? 0;
}

export async function markAdminNotificationRead(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('admin_notifications').update({ is_read: true }).eq('id', id);
  return error ? { error: error.message } : {};
}

export async function markAllAdminNotificationsRead(): Promise<{ error?: string }> {
  const { error } = await supabase.from('admin_notifications').update({ is_read: true }).eq('is_read', false);
  return error ? { error: error.message } : {};
}
