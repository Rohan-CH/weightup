'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Bell, Mail, MessageCircle, Smile, Activity, Check } from 'lucide-react';

type Profile = { username?: string; avatar_url?: string };

type Notification = {
  id: string;
  type: 'reaction' | 'comment' | 'activity';
  actor_id: string | null;
  log_id: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  actor?: Profile | null;
};

type Invite = {
  id: string;
  circle_id: string;
  created_at: string;
  circles?: { name?: string } | null;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email ?? null);

    const { data: nData } = await supabase
      .from('notifications')
      .select('id, type, actor_id, log_id, data, read, created_at, actor:actor_id (username, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(30);

    const normalized: Notification[] = (nData ?? []).map((n: Record<string, unknown>) => ({
      ...(n as unknown as Notification),
      actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : (n.actor as Profile | null),
    }));
    setNotifs(normalized);

    if (user.email) {
      const { data: iData } = await supabase
        .from('circle_invites')
        .select('id, circle_id, created_at, circles (name)')
        .eq('status', 'pending')
        .ilike('invited_email', user.email);
      const inv: Invite[] = (iData ?? []).map((i: Record<string, unknown>) => ({
        ...(i as unknown as Invite),
        circles: Array.isArray(i.circles) ? (i.circles[0] ?? null) : (i.circles as { name?: string } | null),
      }));
      setInvites(inv);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unreadCount = notifs.filter((n) => !n.read).length + invites.length;

  const markRead = async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = notifs.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    router.push('/circles');
  };

  const goToInvites = () => {
    setOpen(false);
    router.push('/circles');
  };

  const renderText = (n: Notification) => {
    const who = n.actor?.username || 'Someone';
    const ex = (n.data?.exercise as string) || 'a lift';
    const w = n.data?.weight != null ? `${n.data.weight}kg` : '';
    if (n.type === 'reaction') {
      const emoji = (n.data?.emoji as string) || '';
      return `${who} reacted ${emoji} to your ${ex} ${w}`.trim();
    }
    if (n.type === 'comment') {
      const body = (n.data?.body as string) || '';
      return `${who} commented on your ${ex} ${w}: "${body}"`.trim();
    }
    const reps = n.data?.reps != null ? ` × ${n.data.reps}` : '';
    return `${who} logged ${ex} ${w}${reps}`.trim();
  };

  const iconFor = (type: Notification['type']) => {
    if (type === 'reaction') return <Smile size={16} />;
    if (type === 'comment') return <MessageCircle size={16} />;
    return <Activity size={16} />;
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown animate-fade-in">
          <div className="notif-head">
            <span>Notifications</span>
            {notifs.some((n) => !n.read) && (
              <button className="notif-markall" onClick={markAllRead}>
                <Check size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {invites.length === 0 && notifs.length === 0 && (
              <div className="notif-empty">You&apos;re all caught up</div>
            )}

            {invites.map((inv) => (
              <button key={`inv-${inv.id}`} className="notif-item unread" onClick={goToInvites}>
                <span className="notif-icon"><Mail size={16} /></span>
                <span className="notif-body">
                  <span className="notif-text">
                    You&apos;re invited to join <strong>{inv.circles?.name || 'a circle'}</strong>
                  </span>
                  <span className="notif-time">{timeAgo(inv.created_at)} · Tap to respond</span>
                </span>
              </button>
            ))}

            {notifs.map((n) => (
              <button
                key={n.id}
                className={`notif-item ${n.read ? '' : 'unread'}`}
                onClick={() => handleClick(n)}
              >
                <span className="notif-icon">{iconFor(n.type)}</span>
                <span className="notif-body">
                  <span className="notif-text">{renderText(n)}</span>
                  <span className="notif-time">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read && <span className="notif-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
