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
  Layers,
  Download,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import WeightPromptModal from './WeightPromptModal';
import './app.css';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/log', label: 'Log Workout', icon: Dumbbell },
  { href: '/muscles', label: 'Muscles', icon: Zap },
  { href: '/splits', label: 'Splits', icon: Layers },
  { href: '/circles', label: 'Circles', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; username?: string; avatar_url?: string } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
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
    
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Show iOS prompt or fallback
      const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      if (isIos) {
        setShowIosPrompt(true);
      } else {
        alert('App installation is not supported by your browser, or it is already installed.');
      }
    }
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

        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <button 
            className="btn-secondary" 
            style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 14px', fontSize: 14, gap: 12, color: 'var(--text-primary)' }}
            onClick={handleInstallApp}
          >
            <Download size={18} />
            Install App
          </button>
        </div>

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

      {/* iOS Install Prompt Modal */}
      {showIosPrompt && (
        <div className="modal-overlay" onClick={() => setShowIosPrompt(false)} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ background: 'var(--bg-secondary)', width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Download size={32} style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Install WeightUp</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>
              To install this app on your iPhone or iPad, tap the <strong>Share</strong> button at the bottom of your Safari browser, then tap <strong>Add to Home Screen</strong>.
            </p>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => setShowIosPrompt(false)}>
              Got it
            </button>
          </div>
        </div>
      )}

      <WeightPromptModal />
    </div>
  );
}
