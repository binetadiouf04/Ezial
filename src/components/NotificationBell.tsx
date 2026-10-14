import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check } from 'lucide-react';
import {
  fetchNotifications, fetchUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/supabaseNotifications';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Private per-user notification history — same shape/behavior as
// AdminNotificationBell, reused for customer/seller/driver instead of
// duplicating the dropdown/mark-read logic three times. `onNavigate`
// receives the notification's stored `url` (set server-side by the DB
// trigger that created it) and decides how to actually get there — each
// caller's router works differently (AppContext's hash routes for the
// customer vs ProContext's in-memory navigate() for seller/driver).
export default function NotificationBell({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    void fetchUnreadNotificationCount().then(setUnreadCount);
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void fetchNotifications().then(setNotifications);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleClickNotification = async (n: AppNotification) => {
    if (!n.isRead) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x));
      refreshCount();
    }
    if (n.url) { onNavigate(n.url); setOpen(false); }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
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
                <button
                  key={n.id}
                  onClick={() => void handleClickNotification(n)}
                  className={`flex w-full flex-col items-start gap-0.5 p-3 text-left transition-colors hover:bg-cream/60 ${n.isRead ? '' : 'bg-burgundy/[0.03]'}`}
                >
                  <div className="flex w-full items-center gap-1.5">
                    {!n.isRead && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-burgundy" />}
                    <p className="text-sm font-medium text-ink truncate">{n.title}</p>
                  </div>
                  {n.body && <p className="text-xs text-ink/55 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-ink/35">{formatDateTime(n.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
