'use client';

import { createPortal } from 'react-dom';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MuscleKey, MUSCLE_META, getMusclesForExercise } from '@/lib/muscle-utils';
import {
  TrendingUp, TrendingDown, Dumbbell, Calendar, Award, Flame,
  ChevronRight, Plus, Trophy, Users, X, ArrowRight, BarChart2, Target,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';

interface ExerciseChart {
  exerciseName: string;
  exerciseId: string;
  data: { date: string; weight: number }[];
  maxWeight: number;
  totalSessions: number;
  targetMuscles?: string[] | null;
}

interface Stats {
  totalLogs: number;
  uniqueExercises: number;
  bestLift: { name: string; weight: number } | null;
  thisWeekLogs: number;
  lastWeekLogs: number;
  streak: number;
}

interface RecentLog {
  exerciseName: string;
  weight: number;
  username: string;
  avatar_url: string | null;
  timeAgo: string;
}

interface PersonalBest {
  name: string;
  weight: number;
  reps: number | null;
  date: string;
  targetMuscles?: string[] | null;
}

const CHART_COLORS = ['#00f5ff', '#7c3aed', '#ec4899', '#10b981', '#f59e0b', '#38bdf8', '#a855f7', '#f43f5e', '#facc15'];

function getExerciseColor(name: string, targetMuscles?: string[] | null) {
  const muscles = getMusclesForExercise(name, targetMuscles);
  if (muscles && muscles.length > 0) {
    const primaryMuscle = muscles[0];
    if (MUSCLE_META[primaryMuscle]) {
      return MUSCLE_META[primaryMuscle].color;
    }
  }
  return '#00f5ff';
}
function CountUp({ value, suffix = '', duration = 700 }: { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value); return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round((value) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);
  return <>{display}{suffix}</>;
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <div className="stat-delta neutral">Same as last week</div>;
  const up = value > 0;
  return (
    <div className={`stat-delta ${up ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{value} vs last week
    </div>
  );
}

// Ripple effect hook
function useRipple() {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const trigger = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples(r => [...r, { x, y, id }]);
    setTimeout(() => setRipples(r => r.filter(rr => rr.id !== id)), 600);
  };
  return { ripples, trigger };
}

// Drawer for stat card details
function StatDrawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dash-drawer-overlay" onClick={onClose}>
      <div className="dash-drawer" onClick={e => e.stopPropagation()}>
        <div className="dash-drawer-head">
          <span>{title}</span>
          <button className="dash-drawer-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dash-drawer-body">{children}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [charts, setCharts] = useState<ExerciseChart[]>([]);
  const [stats, setStats] = useState<Stats>({ totalLogs: 0, uniqueExercises: 0, bestLift: null, thisWeekLogs: 0, lastWeekLogs: 0, streak: 0 });
  const [recentLog, setRecentLog] = useState<RecentLog | null>(null);
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const [leftMuscles, setLeftMuscles] = useState<MuscleKey[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(200);
  const [compactAxis, setCompactAxis] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Direct logging popup state
  const [logPopupExercise, setLogPopupExercise] = useState<{ id: string; name: string; targetMuscles?: string[] | null } | null>(null);
  const [logWeight, setLogWeight] = useState('');
  const [logReps, setLogReps] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState('');
  const [logSuccess, setLogSuccess] = useState('');
  const router = useRouter();
  const supabase = createClient();
  const { ripples: bestRipples, trigger: triggerBest } = useRipple();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 520;
      setChartHeight(mobile ? 160 : 200);
      setCompactAxis(mobile);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Recent global log
    try {
      const { data: latestLogs } = await supabase
        .from('workout_logs')
        .select('user_id, weight_kg, created_at, exercises(name)')
        .order('created_at', { ascending: false })
        .limit(1);
      if (latestLogs && latestLogs.length > 0) {
        const g = latestLogs[0];
        const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', g.user_id).single();
        if (profile) {
          const diff = Date.now() - new Date(g.created_at).getTime();
          const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
          const timeAgo = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'Just now';
          setRecentLog({ exerciseName: g.exercises?.name || 'Unknown', weight: g.weight_kg, username: profile.username || 'Unknown', avatar_url: profile.avatar_url, timeAgo });
        }
      }
    } catch (e) { console.error(e); }

    // User logs
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('*, exercises(name, target_muscles)')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: true });

    if (!logs || logs.length === 0) {
      setLeftMuscles(Object.keys(MUSCLE_META) as MuscleKey[]);
      setHitCount(0);
      setLoading(false);
      return;
    }

    // Exercise counts + top 5
    const counts: Record<string, number> = {};
    const names: Record<string, string> = {};
    logs.forEach((l: any) => {
      counts[l.exercise_id] = (counts[l.exercise_id] || 0) + 1;
      names[l.exercise_id] = l.exercises?.name || 'Unknown';
    });
    const top5 = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([id]) => id);

    // Charts + personal bests per exercise
    const pbs: PersonalBest[] = [];
    const chartData: ExerciseChart[] = top5.map((eid) => {
      const exerciseLogs = logs.filter((l: any) => l.exercise_id === eid);
      const targetMuscles = exerciseLogs[0]?.exercises?.target_muscles || null;
      // personal best for this exercise
      let best = exerciseLogs[0];
      exerciseLogs.forEach((l: any) => { if (l.weight_kg > best.weight_kg) best = l; });
      pbs.push({
        name: names[eid],
        weight: best.weight_kg,
        reps: best.reps ?? null,
        date: best.logged_at,
        targetMuscles,
      });

      const byDate = exerciseLogs.reduce((acc: Record<string, number>, l: any) => {
        if (!acc[l.logged_at] || l.weight_kg > acc[l.logged_at]) acc[l.logged_at] = l.weight_kg;
        return acc;
      }, {});
      const data = Object.entries(byDate)
        .map(([date, weight]) => ({ date, weight: Number(weight) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        exerciseName: names[eid],
        exerciseId: eid,
        data,
        maxWeight: best.weight_kg,
        totalSessions: counts[eid],
        targetMuscles,
      };
    });

    setPersonalBests(pbs);

    // Stats
    const uniqueExercises = new Set(logs.map((l: any) => l.exercise_id)).size;
    let bestLift: { name: string; weight: number } | null = null;
    logs.forEach((l: any) => { if (!bestLift || l.weight_kg > bestLift.weight) bestLift = { name: l.exercises?.name || 'Unknown', weight: l.weight_kg }; });

    const today = new Date();
    const dayStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    const thisWeekLogs = logs.filter((l: any) => l.logged_at >= dayStr(oneWeekAgo)).length;
    const lastWeekLogs = logs.filter((l: any) => l.logged_at >= dayStr(twoWeeksAgo) && l.logged_at < dayStr(oneWeekAgo)).length;

    // Calculate start of current week (Monday)
    const getWeekStart = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const wsStr = dayStr(getWeekStart(today));

    // Calculate muscles worked this week (since Monday)
    const hitMuscles = new Set<MuscleKey>();
    const thisWeekLogsList = logs.filter((l: any) => l.logged_at >= wsStr);
    thisWeekLogsList.forEach((l: any) => {
      const muscles = getMusclesForExercise(l.exercises?.name || '', l.exercises?.target_muscles);
      muscles.forEach(m => hitMuscles.add(m));
    });

    const allMuscleKeys = Object.keys(MUSCLE_META) as MuscleKey[];
    const leftMusclesList = allMuscleKeys.filter(m => !hitMuscles.has(m));

    setLeftMuscles(leftMusclesList);
    setHitCount(hitMuscles.size);

    const activeDays = new Set(logs.map((l: any) => l.logged_at));
    let streak = 0;
    let restDayUsed = false;
    const cursor = new Date(today);
    // If today has no log, step back one day (grace for "haven't logged yet today")
    if (!activeDays.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      if (activeDays.has(dayStr(cursor))) {
        streak++;
        restDayUsed = false;
        cursor.setDate(cursor.getDate() - 1);
      } else if (!restDayUsed) {
        // Allow one rest day — skip it but don't count it
        restDayUsed = true;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break; // Two consecutive missed days — streak ends
      }
    }

    setStats({ totalLogs: logs.length, uniqueExercises, bestLift, thisWeekLogs, lastWeekLogs, streak });
    setCharts(chartData);
    setLoading(false);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'rgba(10,10,18,0.97)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
          <p style={{ color: '#8888a0', marginBottom: 4 }}>{label}</p>
          <p style={{ color: '#00f5ff', fontWeight: 700 }}>{payload[0].value} kg</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const weekDelta = stats.thisWeekLogs - stats.lastWeekLogs;

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>Dashboard</h1>
          <p>Your training overview and progress</p>
        </div>
        {stats.streak > 0 && (
          <button
            className="streak-chip"
            title={`${stats.streak}-day active streak — keep it going!`}
            onClick={() => setOpenDrawer('streak')}
            style={{ cursor: 'pointer', border: '1px solid rgba(249,115,22,0.35)' }}
          >
            <Flame size={16} />
            <span><strong><CountUp value={stats.streak} /></strong> day streak</span>
            <ChevronRight size={14} style={{ opacity: 0.6 }} />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="dash-quick-actions">
        <button className="dash-quick-btn" onClick={() => router.push('/log')}>
          <div className="dash-quick-icon" style={{ background: 'rgba(0,245,255,0.1)', color: 'var(--accent-cyan)' }}>
            <Plus size={18} />
          </div>
          <span>Log Workout</span>
        </button>
        <button className="dash-quick-btn" onClick={() => router.push('/leaderboard')}>
          <div className="dash-quick-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--accent-orange)' }}>
            <Trophy size={18} />
          </div>
          <span>Leaderboard</span>
        </button>
        <button className="dash-quick-btn" onClick={() => router.push('/circles')}>
          <div className="dash-quick-icon" style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--accent-purple)' }}>
            <Users size={18} />
          </div>
          <span>Circles</span>
        </button>
        <button className="dash-quick-btn" onClick={() => router.push('/profile')}>
          <div className="dash-quick-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)' }}>
            <Target size={18} />
          </div>
          <span>Profile</span>
        </button>
      </div>

      {/* Stat Cards */}
      <div className="dash-stats">
        {/* Total Logs */}
        <button
          className="stat-card dash-stat dash-stat-btn"
          style={{ animationDelay: '0.05s', textAlign: 'left' }}
          onClick={() => setOpenDrawer('logs')}
          title="View log history"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Dumbbell size={17} style={{ color: 'var(--accent-cyan)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Total Logs</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="stat-value"><CountUp value={stats.totalLogs} /></div>
          {stats.thisWeekLogs > 0 && <div className="stat-delta up"><TrendingUp size={12} />+{stats.thisWeekLogs} this week</div>}
        </button>

        {/* This Week */}
        <button
          className="stat-card dash-stat dash-stat-btn"
          style={{ animationDelay: '0.1s', textAlign: 'left' }}
          onClick={() => setOpenDrawer('week')}
          title="Weekly breakdown"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={17} style={{ color: 'var(--accent-purple)' }} />
              <span className="stat-label" style={{ margin: 0 }}>This Week</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="stat-value"><CountUp value={stats.thisWeekLogs} /></div>
          <Delta value={weekDelta} />
        </button>

        {/* Exercises */}
        <button
          className="stat-card dash-stat dash-stat-btn"
          style={{ animationDelay: '0.15s', textAlign: 'left' }}
          onClick={() => setOpenDrawer('exercises')}
          title="View exercises"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={17} style={{ color: 'var(--accent-green)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Exercises</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="stat-value"><CountUp value={stats.uniqueExercises} /></div>
          <div className="stat-delta neutral">{stats.uniqueExercises === 1 ? 'movement' : 'movements'} tracked</div>
        </button>

        {/* Best Lift */}
        <button
          className="stat-card dash-stat dash-stat-btn"
          style={{ animationDelay: '0.2s', textAlign: 'left', position: 'relative', overflow: 'hidden' }}
          onClick={(e) => { triggerBest(e); setOpenDrawer('bests'); }}
          title="Personal records"
        >
          {bestRipples.map(r => (
            <span key={r.id} className="dash-ripple" style={{ left: r.x, top: r.y }} />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award size={17} style={{ color: 'var(--accent-orange)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Best Lift</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="stat-value">{stats.bestLift ? <><CountUp value={stats.bestLift.weight} />kg</> : '—'}</div>
          {stats.bestLift && <div className="stat-delta neutral" style={{ color: 'var(--text-secondary)' }}>{stats.bestLift.name}</div>}
        </button>
      </div>

      {/* Weekly Muscle Suggestion Board */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 28,
        animationDelay: '0.22s',
        border: '1px solid rgba(0, 245, 255, 0.12)',
        background: 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} style={{ color: 'var(--accent-cyan)' }} />
              Weekly Muscle Suggestion Board
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Keep your training balanced by targeting all muscle groups this week
            </p>
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'rgba(0, 245, 255, 0.08)',
            color: 'var(--accent-cyan)',
            padding: '4px 10px',
            borderRadius: 12,
            border: '1px solid rgba(0, 245, 255, 0.15)',
          }}>
            {hitCount} / 16 Hit
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{
          width: '100%',
          height: 6,
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 20
        }}>
          <div style={{
            width: `${(hitCount / 16) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))',
            borderRadius: 3,
            transition: 'width 0.5s ease-out',
            boxShadow: '0 0 8px var(--accent-cyan)'
          }} />
        </div>

        {leftMuscles.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 12, padding: 16 }}>
            <span style={{ fontSize: 20 }}>🎉</span>
            <div style={{ fontSize: 14, color: 'var(--accent-green)', fontWeight: 500 }}>
              Excellent work! You have hit every muscle group this week. Keep up the consistency!
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Muscles left to hit:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {leftMuscles.map(m => {
                const meta = MUSCLE_META[m];
                return (
                  <div
                    key={m}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid rgba(255, 255, 255, 0.08)`,
                      borderRadius: 20,
                      padding: '6px 12px',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block', boxShadow: `0 0 5px ${meta.color}` }} />
                    {meta.label}
                  </div>
                );
              })}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: 'rgba(124, 58, 237, 0.06)',
              border: '1px solid rgba(124, 58, 237, 0.15)',
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.4
            }}>
              <span style={{ fontSize: 16, marginTop: -1 }}>💡</span>
              <div>
                <strong>Recommendation:</strong> Try adding exercises like{' '}
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>
                  {leftMuscles.includes('chest') ? 'Bench Press or Cable Flyes' :
                   leftMuscles.includes('biceps') ? 'Dumbbell Curls or Preacher Curls' :
                   leftMuscles.includes('quads') ? 'Squats or Leg Presses' :
                   leftMuscles.includes('lats') ? 'Pull Ups or Lat Pulldowns' :
                   leftMuscles.includes('hamstrings') ? 'Romanian Deadlifts or Leg Curls' :
                   leftMuscles.includes('triceps') ? 'Tricep Pushdowns or Skull Crushers' :
                   leftMuscles.includes('glutes') ? 'Hip Thrusts or Squats' :
                   leftMuscles.includes('front_delts') || leftMuscles.includes('side_delts') || leftMuscles.includes('rear_delts') ? 'Overhead Press or Lateral Raises' :
                   'focused movements'}
                </span>{' '}
                to target your remaining muscle groups.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Community Log */}
      {recentLog && (
        <button
          className="card dash-recent dash-stat-btn animate-fade-in-up"
          style={{ width: '100%', marginBottom: 28, animationDelay: '0.25s', borderLeft: '3px solid var(--accent-purple)', background: 'linear-gradient(145deg, rgba(14,14,22,0.9), rgba(20,20,30,0.9))', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => router.push('/circles')}
          title="View in Circles"
        >
          <div>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={13} style={{ color: 'var(--accent-purple)' }} /> Latest Community Log
            </h3>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)' }}>
              {recentLog.exerciseName} <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: 17 }}>• {recentLog.weight}kg</span>
            </div>
          </div>
          <div className="dash-recent-user">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{recentLog.username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{recentLog.timeAgo}</div>
            </div>
            {recentLog.avatar_url ? (
              <img src={recentLog.avatar_url} alt="" className="avatar" style={{ width: 42, height: 42, border: '2px solid rgba(124,58,237,0.3)' }} />
            ) : (
              <div className="avatar-placeholder" style={{ width: 42, height: 42, fontSize: 15, background: 'rgba(124,58,237,0.1)', color: 'var(--accent-purple)', border: '2px solid rgba(124,58,237,0.3)' }}>
                {recentLog.username.charAt(0).toUpperCase()}
              </div>
            )}
            <ArrowRight size={16} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
          </div>
        </button>
      )}

      {/* Charts */}
      {charts.length === 0 ? (
        <div className="card empty-state">
          <Dumbbell size={48} />
          <h3>No workout data yet</h3>
          <p>Start logging your workouts to see your progress charts here.</p>
          <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => router.push('/log')}>
            <Plus size={16} /> Log First Workout
          </button>
        </div>
      ) : (
        <div className="dash-charts">
          {charts.map((chart) => {
            const chartColor = getExerciseColor(chart.exerciseName, chart.targetMuscles);
            return (
            <div
              key={chart.exerciseName}
              className="card dash-stat animate-fade-in-up"
              style={{ padding: '20px 20px 16px' }}
            >
              {/* Chart header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: chartColor, display: 'inline-block', flexShrink: 0 }} />
                  {chart.exerciseName}
                </h3>
                <button
                  className="dash-chart-log-btn"
                  onClick={() => {
                    setLogPopupExercise({ id: chart.exerciseId, name: chart.exerciseName, targetMuscles: chart.targetMuscles });
                    setLogWeight('');
                    setLogReps('');
                    setLogDate(new Date().toISOString().split('T')[0]);
                    setLogError('');
                    setLogSuccess('');
                  }}
                  title={`Log ${chart.exerciseName}`}
                  style={{ '--btn-color': chartColor } as React.CSSProperties}
                >
                  <Plus size={13} /> Log
                </button>
              </div>

              {/* Mini stats row */}
              <div className="dash-chart-meta">
                <span className="dash-chart-meta-item" title="Personal Best (Maximum weight lifted)">
                  <Award size={11} style={{ color: chartColor }} />
                  PB: <strong>{chart.maxWeight}kg</strong>
                </span>
                <span className="dash-chart-meta-item">
                  <Calendar size={11} style={{ color: 'var(--text-muted)' }} />
                  {chart.totalSessions} sessions
                </span>
              </div>

              <ResponsiveContainer width="100%" height={chartHeight}>
                <AreaChart data={chart.data} margin={{ top: 4, right: 6, left: compactAxis ? -24 : -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${chart.exerciseId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#55556a', fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                    minTickGap={compactAxis ? 28 : 12}
                    tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                  />
                  <YAxis
                    tick={{ fill: '#55556a', fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                    width={compactAxis ? 30 : 38}
                    unit="kg"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke={chartColor}
                    strokeWidth={2}
                    fill={`url(#grad-${chart.exerciseId})`}
                    dot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                    activeDot={{ r: 5, stroke: chartColor, strokeWidth: 2, fill: 'var(--bg-primary)' }}
                    isAnimationActive
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            );
          })}
        </div>
      )}

      {/* ---- Drawers (portalled to document.body to escape stacking context) ---- */}

      {mounted && openDrawer && createPortal(
        <>
          {openDrawer === 'streak' && (
            <StatDrawer title="🔥 Your Streak" onClose={() => setOpenDrawer(null)}>
              <div className="dash-drawer-stat-big" style={{ color: 'var(--accent-orange)' }}>
                {stats.streak} days
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                You&apos;ve trained on <strong style={{ color: 'var(--text-primary)' }}>{stats.streak}</strong> consecutive
                {stats.streak === 1 ? ' day' : ' days'}. Keep pushing — consistency is everything.
              </p>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => { setOpenDrawer(null); router.push('/log'); }}>
                <Plus size={16} /> Log Today&apos;s Workout
              </button>
            </StatDrawer>
          )}

          {openDrawer === 'logs' && (
            <StatDrawer title="📋 All Logs" onClose={() => setOpenDrawer(null)}>
              <div className="dash-drawer-stat-big">{stats.totalLogs}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
                Total workout sets logged across all exercises.
              </p>
              <div className="dash-drawer-row">
                <span style={{ color: 'var(--text-muted)' }}>This week</span>
                <strong>{stats.thisWeekLogs} sets</strong>
              </div>
              <div className="dash-drawer-row">
                <span style={{ color: 'var(--text-muted)' }}>Last week</span>
                <strong>{stats.lastWeekLogs} sets</strong>
              </div>
              <div className="dash-drawer-row">
                <span style={{ color: 'var(--text-muted)' }}>Change</span>
                <strong style={{ color: weekDelta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {weekDelta >= 0 ? '+' : ''}{weekDelta}
                </strong>
              </div>
              <button className="btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => { setOpenDrawer(null); router.push('/log'); }}>
                <Plus size={16} /> Log New Set
              </button>
            </StatDrawer>
          )}

          {openDrawer === 'week' && (
            <StatDrawer title="📅 This Week" onClose={() => setOpenDrawer(null)}>
              <div className="dash-drawer-stat-big">{stats.thisWeekLogs}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                Sets logged in the last 7 days.
              </p>
              <div className="dash-drawer-row">
                <span style={{ color: 'var(--text-muted)' }}>vs. last week</span>
                <strong style={{ color: weekDelta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {weekDelta >= 0 ? '+' : ''}{weekDelta} sets
                </strong>
              </div>
              {weekDelta < 0 && (
                <div className="dash-drawer-tip">
                  💡 You logged <strong>{Math.abs(weekDelta)} fewer sets</strong> than last week — time to step it up!
                </div>
              )}
              {weekDelta > 0 && (
                <div className="dash-drawer-tip" style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)', color: 'var(--accent-green)' }}>
                  🎉 You logged <strong>{weekDelta} more sets</strong> than last week — great progress!
                </div>
              )}
              <button className="btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => { setOpenDrawer(null); router.push('/log'); }}>
                <Plus size={16} /> Add a Set
              </button>
            </StatDrawer>
          )}

          {openDrawer === 'exercises' && (
            <StatDrawer title="🏋️ Tracked Exercises" onClose={() => setOpenDrawer(null)}>
              <div className="dash-drawer-stat-big">{stats.uniqueExercises}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                Different movements in your training history.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {personalBests.map((pb) => (
                  <div key={pb.name} className="dash-drawer-exercise-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: getExerciseColor(pb.name, pb.targetMuscles), display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{pb.name}</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--accent-cyan)', fontWeight: 700 }} title="Personal Best (Maximum weight lifted)">PB {pb.weight}kg</span>
                  </div>
                ))}
              </div>
              <button className="btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => { setOpenDrawer(null); router.push('/log'); }}>
                <Plus size={16} /> Log an Exercise
              </button>
            </StatDrawer>
          )}

          {openDrawer === 'bests' && (
            <StatDrawer title="🏆 Personal Bests" onClose={() => setOpenDrawer(null)}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Your all-time personal records.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {personalBests.map((pb) => (
                  <div key={pb.name} className="dash-drawer-pb-row">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: getExerciseColor(pb.name, pb.targetMuscles), display: 'inline-block', flexShrink: 0 }} />
                        {pb.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{pb.date}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: getExerciseColor(pb.name, pb.targetMuscles) }}>{pb.weight}kg</div>
                      {pb.reps && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>× {pb.reps} reps</div>}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-secondary" style={{ width: '100%', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => { setOpenDrawer(null); router.push('/leaderboard'); }}>
                <Trophy size={15} /> View Leaderboard <ArrowRight size={14} />
              </button>
            </StatDrawer>
          )}
        </>,
        document.body
      )}

      {mounted && logPopupExercise && createPortal(
        <div className="dash-drawer-overlay" onClick={() => setLogPopupExercise(null)}>
          <div className="dash-drawer animate-fade-in-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, height: 'auto', minHeight: 0, paddingBottom: 24, borderRadius: 16 }}>
            <div className="dash-drawer-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dumbbell size={18} style={{ color: getExerciseColor(logPopupExercise.name, logPopupExercise.targetMuscles) }} />
                Log {logPopupExercise.name}
              </span>
              <button className="dash-drawer-close" onClick={() => setLogPopupExercise(null)}><X size={18} /></button>
            </div>
            <div className="dash-drawer-body" style={{ padding: '0 24px' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!logWeight || !logReps) {
                  setLogError('Please enter weight and reps');
                  return;
                }
                setLogSubmitting(true);
                setLogError('');
                setLogSuccess('');
                
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { error: insertErr } = await supabase.from('workout_logs').insert({
                  user_id: user.id,
                  exercise_id: logPopupExercise.id,
                  weight_kg: parseFloat(logWeight),
                  reps: parseInt(logReps),
                  logged_at: logDate,
                });

                if (insertErr) {
                  setLogError(insertErr.message);
                } else {
                  setLogSuccess('Workout logged successfully!');
                  // Refresh dashboard data
                  fetchDashboardData();
                  // Close modal after a brief delay
                  setTimeout(() => {
                    setLogPopupExercise(null);
                  }, 1200);
                }
                setLogSubmitting(false);
              }}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="label">Weight (kg)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="0"
                    value={logWeight}
                    onChange={(e) => setLogWeight(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="label">Reps</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    placeholder="0"
                    value={logReps}
                    onChange={(e) => setLogReps(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label className="label">Date</label>
                  <input
                    className="input"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    required
                  />
                </div>

                {logError && <p className="error-text" style={{ marginBottom: 12 }}>{logError}</p>}
                {logSuccess && <p className="success-text" style={{ marginBottom: 12 }}>{logSuccess}</p>}

                <button type="submit" className="btn-primary" disabled={logSubmitting} style={{ width: '100%', gap: 8 }}>
                  {logSubmitting ? <span className="spinner" /> : <><Dumbbell size={16} /> Log Set</>}
                </button>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
