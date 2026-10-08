import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check } from 'lucide-react';
import {
  fetchAdminNotifications, fetchUnreadAdminNotificationCount, markAdminNotificationRead, markAllAdminNotificationsRead,
  type AdminNotification,
} from '@/lib/supabaseAdminNotifications';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Purely informational feed (currently: new-shop-signup events written by
// the handle_auth_user_email_confirmed() DB trigger) — never blocks or
// reverses anything it reports on.
export default function AdminNotificationBell({ onOpenShop }: { onOpenShop: (shopId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    void fetchUnreadAdminNotificationCount().then(setUnreadCount);
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void fetchAdminNotifications().then(setNotifications);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleClickNotification = async (n: AdminNotification) => {
    if (!n.isRead) {
      await markAdminNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x));
      refreshCount();
    }
    if (n.shopId) { onOpenShop(n.shopId); setOpen(false); }
  };

  const handleMarkAllRead = async () => {
    await markAllAdminNotificationsRead();
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink/50 hover:bg-cream hover:text-ink transition-colors" aria-label="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-white">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 max-w-[90vw] rounded-xl border border-line bg-white shadow-lg max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-line p-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={() => void handleMarkAllRead()} className="flex items-center gap-1 text-xs font-medium text-burgundy hover:underline">
                <Check size={12} /> Tout marquer lu
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune notification.</p>
          ) : (
            <div className="divide-y divide-line">
              {notifications.map((n) => (
                <button key={n.id} onClick={() => void handleClickNotification(n)} className={`block w-full p-3 text-left transition-colors hover:bg-cream ${n.isRead ? '' : 'bg-burgundy/5'}`}>
                  <p className={`text-sm ${n.isRead ? 'text-ink/60' : 'font-medium text-ink'}`}>{n.message}</p>
                  <p className="mt-0.5 text-xs text-ink/40">{formatDateTime(n.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
