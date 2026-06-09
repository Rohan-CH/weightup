'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { X, Dumbbell, Activity, Calendar, Trophy } from 'lucide-react';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

interface UserProfileData {
  username: string;
  avatar_url: string | null;
  stats: {
    totalLogs: number;
    uniqueExercises: number;
    totalDays: number;
  };
  topExercises: { name: string; count: number }[];
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUserStats() {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', userId)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      // Fetch logs for stats
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, exercises(name)')
        .eq('user_id', userId);

      let totalLogs = 0;
      let uniqueExercises = 0;
      let totalDays = 0;
      let topExercises: { name: string; count: number }[] = [];

      if (logs && logs.length > 0) {
        totalLogs = logs.length;
        const uniqueExIds = new Set(logs.map((l: any) => l.exercise_id));
        uniqueExercises = uniqueExIds.size;
        const uniqueDates = new Set(logs.map((l: any) => l.logged_at));
        totalDays = uniqueDates.size;

        // Calculate top exercises
        const exCounts: Record<string, { name: string; count: number }> = {};
        logs.forEach((log: any) => {
          const eId = log.exercise_id;
          const eName = log.exercises?.name || 'Unknown';
          if (!exCounts[eId]) {
            exCounts[eId] = { name: eName, count: 0 };
          }
          exCounts[eId].count++;
        });

        topExercises = Object.values(exCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 2);
      }

      setData({
        username: profile.username,
        avatar_url: profile.avatar_url,
        stats: { totalLogs, uniqueExercises, totalDays },
        topExercises,
      });
      setLoading(false);
    }

    fetchUserStats();
  }, [userId, supabase]);

  return createPortal(
    <div className="split-builder-overlay" onClick={onClose} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div 
        className="split-builder animate-fade-in-up" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 450, 
          width: '100%', 
          borderRadius: 24, 
          padding: 0, 
          overflow: 'hidden',
          background: 'var(--bg-secondary)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          transform: 'scale(1)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header section with avatar */}
        <div style={{ position: 'relative', padding: '32px 24px 24px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(0,245,255,0.08) 0%, rgba(0,245,255,0) 100%)' }}>
          <button 
            className="dash-drawer-close" 
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: 8, color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>

          {loading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : data ? (
            <>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                {data.avatar_url ? (
                  <img 
                    src={data.avatar_url} 
                    alt={data.username} 
                    style={{ 
                      width: 96, 
                      height: 96, 
                      borderRadius: '50%', 
                      objectFit: 'cover', 
                      border: '4px solid var(--bg-secondary)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 0 2px var(--accent-cyan)' 
                    }} 
                  />
                ) : (
                  <div style={{ 
                    width: 96, 
                    height: 96, 
                    borderRadius: '50%', 
                    background: 'var(--accent-cyan)', 
                    color: '#000', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: 36, 
                    fontWeight: 800,
                    border: '4px solid var(--bg-secondary)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                  }}>
                    {data.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                {data.username}
              </h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ fontSize: 14 }}>🔒</span> Private Stats
              </div>
            </>
          ) : (
            <div style={{ padding: 40, color: 'var(--text-muted)' }}>User not found</div>
          )}
        </div>

        {/* Stats & Top Exercises */}
        {data && (
          <div style={{ padding: '0 24px 32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div className="card" style={{ padding: '16px 12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16 }}>
                <Activity size={20} style={{ color: 'var(--accent-purple)', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.totalLogs}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Workouts</div>
              </div>
              <div className="card" style={{ padding: '16px 12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16 }}>
                <Dumbbell size={20} style={{ color: 'var(--accent-orange)', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.uniqueExercises}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Exercises</div>
              </div>
              <div className="card" style={{ padding: '16px 12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16 }}>
                <Calendar size={20} style={{ color: 'var(--accent-cyan)', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.totalDays}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Active Days</div>
              </div>
            </div>

            {data.topExercises.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 16, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={16} style={{ color: '#fbbf24' }} />
                  Top Exercises
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.topExercises.map((ex, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>{ex.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 20 }}>
                        {ex.count} logs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {data.stats.totalLogs === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
                No workouts logged yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
