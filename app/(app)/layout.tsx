'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Dumbbell,
  Trophy,
  Users,
  User,
  LogOut,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import './app.css';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/log', label: 'Log Workout', icon: Dumbbell },
  { href: '/muscles', label: 'Muscles', icon: Zap },
  { href: '/circles', label: 'Circles', icon: Users },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; username?: string; avatar_url?: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const getUser = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', authUser.id)
        .single();
      setUser({
        email: authUser.email,
        username: profile?.username || 'User',
        avatar_url: profile?.avatar_url,
      });
    }
  }, [supabase]);

  // Re-fetch on mount and whenever the route changes (e.g. returning from Profile).
  useEffect(() => {
    getUser();
  }, [getUser, pathname]);

  // Instant update when the profile page reports a change.
  useEffect(() => {
    const handler = () => getUser();
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, [getUser]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="app-layout">
      <div className="grid-bg" />

      <button
        className={`mobile-toggle ${sidebarOpen ? 'hidden' : ''}`}
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sidebar-brand">WeightUp</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell />
            <button
              className="mobile-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${pathname === link.href ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle />
          <div className="sidebar-user">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="avatar" style={{ width: 36, height: 36 }} />
            ) : (
              <div className="avatar-placeholder" style={{ width: 36, height: 36, fontSize: 14 }}>
                {user?.username?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.username || 'Loading...'}</div>
              <div className="sidebar-user-email">{user?.email || ''}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
