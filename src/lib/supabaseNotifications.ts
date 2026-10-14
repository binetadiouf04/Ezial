import { supabase } from './supabaseClient';

// Real Supabase-backed private notification history (public.notifications)
// — one row per push sent to customer/seller/driver, scoped by RLS to
// user_id = auth.uid(). Distinct from public.admin_notifications, which is
// a broadcast feed every admin shares. Every row is written server-side by
// notify_user() (see the migration); nothing here is ever inserted by a
// client request.

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  return error ? { error: error.message } : {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  return error ? { error: error.message } : {};
}
