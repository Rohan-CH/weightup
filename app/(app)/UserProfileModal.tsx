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
    streak: number;
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
      let streak = 0;
      let topExercises: { name: string; count: number }[] = [];

      if (logs && logs.length > 0) {
        totalLogs = logs.length;
        const uniqueExIds = new Set(logs.map((l: any) => l.exercise_id));
        uniqueExercises = uniqueExIds.size;
        const uniqueDates = new Set<string>(logs.map((l: any) => l.logged_at));
        totalDays = uniqueDates.size;

        let restDayUsed = false;
        const cursor = new Date();
        const dayStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        
        if (!uniqueDates.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
        while (true) {
          if (uniqueDates.has(dayStr(cursor))) {
            streak++;
            restDayUsed = false;
            cursor.setDate(cursor.getDate() - 1);
          } else if (!restDayUsed) {
            restDayUsed = true;
            cursor.setDate(cursor.getDate() - 1);
          } else {
            break;
          }
        }

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
          .slice(0, 5);
      }

      setData({
        username: profile.username,
        avatar_url: profile.avatar_url,
        stats: { totalLogs, uniqueExercises, totalDays, streak: streak || 0 },
        topExercises,
      });
      setLoading(false);
    }

    fetchUserStats();
  }, [userId, supabase]);

  return createPortal(
    <div className="split-builder-overlay" onClick={onClose} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div 
        className="split-builder animate-fade-in-up no-scrollbar" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 450, 
          width: '100%', 
          maxHeight: '90vh',
          borderRadius: 28, 
          padding: 0, 
          overflowY: 'auto',
          background: 'var(--bg-secondary)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          transform: 'scale(1)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header section with avatar */}
        <div style={{ position: 'relative', padding: '40px 24px 32px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(0,245,255,0.08) 0%, var(--bg-secondary) 100%)' }}>
          <button 
            className="dash-drawer-close" 
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', borderRadius: '50%', padding: 8, color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', zIndex: 10 }}
          >
            <X size={18} />
          </button>

          {loading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : data ? (
            <>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
                {/* Glow ring */}
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))', opacity: 0.5, filter: 'blur(10px)', zIndex: 0 }} />
                
                {data.avatar_url ? (
                  <img 
                    src={data.avatar_url} 
                    alt={data.username} 
                    style={{ 
                      width: 104, 
                      height: 104, 
                      borderRadius: '50%', 
                      objectFit: 'cover', 
                      border: '3px solid var(--bg-secondary)',
                      position: 'relative',
                      zIndex: 1
                    }} 
                  />
                ) : (
                  <div style={{ 
                    width: 104, 
                    height: 104, 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))', 
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: 40, 
                    fontWeight: 800,
                    border: '3px solid var(--bg-secondary)',
                    position: 'relative',
                    zIndex: 1
                  }}>
                    {data.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                {data.username}
              </h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: data.stats.streak > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
              <div className="card" style={{ padding: '20px 8px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)' }}>
                <Activity size={20} style={{ color: 'var(--accent-purple)', margin: '0 auto 12px', filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.4))' }} />
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.totalLogs}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Workouts</div>
              </div>
              <div className="card" style={{ padding: '20px 8px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)' }}>
                <Dumbbell size={20} style={{ color: 'var(--accent-orange)', margin: '0 auto 12px', filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.4))' }} />
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.uniqueExercises}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Exercises</div>
              </div>
              <div className="card" style={{ padding: '20px 8px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)' }}>
                <Calendar size={20} style={{ color: 'var(--accent-cyan)', margin: '0 auto 12px', filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.4))' }} />
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{data.stats.totalDays}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Active Days</div>
              </div>
              {data.stats.streak > 0 && (
                <div className="card" style={{ padding: '20px 8px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(249,115,22,0.1) 0%, rgba(249,115,22,0.02) 100%)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 20, boxShadow: 'inset 0 1px 1px rgba(249,115,22,0.1)' }}>
                  <span style={{ fontSize: 20, display: 'block', margin: '0 auto 12px', filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.4))' }}>🔥</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-orange)', lineHeight: 1 }}>{data.stats.streak}</div>
                  <div style={{ fontSize: 10, color: 'var(--accent-orange)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Streak</div>
                </div>
              )}
            </div>

            {data.topExercises.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.03)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: 'rgba(251,191,36,0.15)', padding: 6, borderRadius: 8 }}>
                    <Trophy size={16} style={{ color: '#fbbf24' }} />
                  </div>
                  Top Exercises
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.topExercises.map((ex, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.02)', transition: 'all 0.2s ease' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>{ex.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 20 }}>
                        {ex.count} {ex.count === 1 ? 'log' : 'logs'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {data.stats.totalLogs === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderRadius: 24 }}>
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
