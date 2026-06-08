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
  data: { date: string; weight: number; volume: number }[];
  maxWeight: number;
  maxVolume: number;
  totalSessions: number;
  targetMuscles?: string[] | null;
}

interface Milestone {
  type: 'pr' | 'streak' | 'muscle';
  title: string;
  message: string;
  timestamp: number;
  meta: any;
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

const getHeatmapGrid = () => {
  const dates = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - 364);
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);
  
  const cursor = new Date(startDate);
  for (let i = 0; i < 371; i++) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

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
  const [showAllLeftMuscles, setShowAllLeftMuscles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(200);
  const [compactAxis, setCompactAxis] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const [chartMetric, setChartMetric] = useState<'pb' | 'volume'>('pb');
  const [recovery, setRecovery] = useState(100);
  const [hoursSinceLastLog, setHoursSinceLastLog] = useState<number | null>(null);
  const [fatigueScores, setFatigueScores] = useState<Record<MuscleKey, number>>({} as any);
  const [recentMilestones, setRecentMilestones] = useState<Milestone[]>([]);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const [dailyLogCounts, setDailyLogCounts] = useState<Record<string, number>>({});
  
  // Direct logging popup state
  const [logPopupExercise, setLogPopupExercise] = useState<{ id: string; name: string; targetMuscles?: string[] | null } | null>(null);
  const [logWeight, setLogWeight] = useState('');
  const [logReps, setLogReps] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState('');
  const [logSuccess, setLogSuccess] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const router = useRouter();
  const supabase = createClient();
  const { ripples: bestRipples, trigger: triggerBest } = useRipple();

  useEffect(() => {
    setMounted(true);
    const checkTheme = () => {
      const isL = document.documentElement.getAttribute('data-theme') === 'light';
      setTheme(isL ? 'light' : 'dark');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

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
        
        // Initialize fresh scores for all muscles
        const freshScores: Record<MuscleKey, number> = {} as any;
        (Object.keys(MUSCLE_META) as MuscleKey[]).forEach(m => {
          freshScores[m] = 0;
        });
        setFatigueScores(freshScores);
        
        setLoading(false);
        return;
      }

      // Heatmap daily log counts
      const dailyCounts: Record<string, number> = {};
      logs.forEach((l: any) => {
        if (l.logged_at) {
          dailyCounts[l.logged_at] = (dailyCounts[l.logged_at] || 0) + 1;
        }
      });
      setDailyLogCounts(dailyCounts);

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

        const byDate = exerciseLogs.reduce((acc: Record<string, { weight: number; volume: number }>, l: any) => {
          const vol = (l.weight_kg || 0) * (l.reps || 0);
          if (!acc[l.logged_at]) {
            acc[l.logged_at] = { weight: l.weight_kg, volume: vol };
          } else {
            acc[l.logged_at].volume += vol;
            if (l.weight_kg > acc[l.logged_at].weight) {
              acc[l.logged_at].weight = l.weight_kg;
            }
          }
          return acc;
        }, {} as Record<string, { weight: number; volume: number }>);

        const data = Object.entries(byDate)
          .map(([date, val]: [string, any]) => ({
            date,
            weight: Number(val.weight),
            volume: Number(val.volume),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        let maxVolume = 0;
        Object.values(byDate).forEach((val: any) => {
          if (val.volume > maxVolume) maxVolume = val.volume;
        });

        return {
          exerciseName: names[eid],
          exerciseId: eid,
          data,
          maxWeight: best.weight_kg,
          maxVolume,
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

      // Rest & Recovery calculations
      let lastLogTime = 0;
      logs.forEach((l: any) => {
        const t = new Date(l.created_at || (l.logged_at + 'T12:00:00Z')).getTime();
        if (t > lastLogTime) {
          lastLogTime = t;
        }
      });
      if (lastLogTime > 0) {
        const hours = (Date.now() - lastLogTime) / 3600000;
        setHoursSinceLastLog(hours);
        const recPercent = Math.min(100, Math.max(0, Math.floor((hours / 36) * 100)));
        setRecovery(recPercent);
      } else {
        setHoursSinceLastLog(null);
        setRecovery(100);
      }

      // Muscle Fatigue Score calculations
      const fatigueScoresObj: Record<MuscleKey, number> = {} as any;
      allMuscleKeys.forEach(m => { fatigueScoresObj[m] = 0; });

      const logsByMuscle: Record<MuscleKey, any[]> = {} as any;
      allMuscleKeys.forEach(m => { logsByMuscle[m] = []; });

      logs.forEach((log: any) => {
        const muscles = getMusclesForExercise(log.exercises?.name || '', log.exercises?.target_muscles);
        muscles.forEach(m => {
          if (logsByMuscle[m]) {
            logsByMuscle[m].push(log);
          }
        });
      });

      const nowTime = new Date();
      allMuscleKeys.forEach(m => {
        const mLogs = logsByMuscle[m];
        if (mLogs.length === 0) {
          fatigueScoresObj[m] = 0;
          return;
        }

        mLogs.sort((a, b) => {
          const tA = new Date(a.created_at || (a.logged_at + 'T12:00:00Z')).getTime();
          const tB = new Date(b.created_at || (b.logged_at + 'T12:00:00Z')).getTime();
          return tA - tB;
        });

        let fatigue = 0;
        let prevTime: Date | null = null;

        for (const log of mLogs) {
          const logTime = new Date(log.created_at || (log.logged_at + 'T12:00:00Z'));
          if (prevTime !== null) {
            const hours = (logTime.getTime() - prevTime.getTime()) / 3600000;
            if (hours > 0) {
              fatigue = fatigue * Math.pow(0.5, hours / 24);
            }
          }
          fatigue = Math.min(100, fatigue + 25);
          prevTime = logTime;
        }

        if (prevTime !== null) {
          const hours = (nowTime.getTime() - prevTime.getTime()) / 3600000;
          if (hours > 0) {
            fatigue = fatigue * Math.pow(0.5, hours / 24);
          }
        }

        fatigueScoresObj[m] = Math.round(fatigue);
      });
      setFatigueScores(fatigueScoresObj);

      // PR Milestone calculations
      const milestonesList: Milestone[] = [];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const logsByExercise: Record<string, any[]> = {};
      logs.forEach((l: any) => {
        if (!logsByExercise[l.exercise_id]) logsByExercise[l.exercise_id] = [];
        logsByExercise[l.exercise_id].push(l);
      });

      Object.entries(logsByExercise).forEach(([eid, eLogs]) => {
        eLogs.sort((a: any, b: any) => {
          const tA = new Date(a.created_at || (a.logged_at + 'T12:00:00Z')).getTime();
          const tB = new Date(b.created_at || (b.logged_at + 'T12:00:00Z')).getTime();
          return tA - tB;
        });

        let prevMax = 0;
        let highestRecentPR: Milestone | null = null;

        eLogs.forEach((log: any) => {
          const logTime = new Date(log.created_at || (log.logged_at + 'T12:00:00Z'));
          const isRecent = logTime.getTime() >= sevenDaysAgo.getTime();

          if (log.weight_kg > prevMax) {
            if (isRecent && prevMax > 0) {
              const diff = log.weight_kg - prevMax;
              const diffTime = Date.now() - logTime.getTime();
              const d = Math.floor(diffTime / 86400000);
              const h = Math.floor((diffTime % 86400000) / 3600000);
              const timeAgo = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : 'recently';

              highestRecentPR = {
                type: 'pr',
                title: '🏆 New Personal Record!',
                message: `You reached ${log.weight_kg}kg on ${log.exercises?.name || 'Exercise'} (a +${diff}kg increase) ${timeAgo}!`,
                timestamp: logTime.getTime(),
                meta: { exerciseName: log.exercises?.name, weight: log.weight_kg, diff }
              };
            }
            prevMax = log.weight_kg;
          }
        });

        if (highestRecentPR) {
          milestonesList.push(highestRecentPR);
        }
      });

      if (streak >= 3) {
        milestonesList.push({
          type: 'streak',
          title: '🔥 Consistency Milestone!',
          message: `You reached an active ${streak}-day workout streak! Keep pushing!`,
          timestamp: Date.now(),
          meta: { streak }
        });
      }

      const hitCountThisWeek = 16 - leftMusclesList.length;
      if (hitCountThisWeek >= 4) {
        milestonesList.push({
          type: 'muscle',
          title: '⚡ Muscle Mastery!',
          message: `You hit ${hitCountThisWeek} out of 16 muscle groups this week. Exceptional balance!`,
          timestamp: Date.now() - 1000,
          meta: { hitCount: hitCountThisWeek }
        });
      }

      milestonesList.sort((a, b) => b.timestamp - a.timestamp);
      setRecentMilestones(milestonesList.slice(0, 4));

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const isVol = chartMetric === 'volume';
      return (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          boxShadow: 'var(--shadow-card)',
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
            {isVol ? 'Total Volume: ' : 'Max Weight: '}
            <span style={{ color: isVol ? 'var(--accent-cyan)' : 'var(--accent-purple)' }}>{payload[0].value} kg</span>
          </p>
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

  const gridDates = getHeatmapGrid();
  const monthLabels: { label: string; index: number }[] = [];
  let prevMonth = -1;
  gridDates.forEach((d, i) => {
    if (i % 7 === 0) {
      const month = d.getMonth();
      if (month !== prevMonth) {
        monthLabels.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), index: Math.floor(i / 7) });
        prevMonth = month;
      }
    }
  });

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>Dashboard</h1>
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

      {/* 📅 Consistency Heatmap Card */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 28,
        animationDelay: '0.21s',
        border: '1px solid var(--border-color)',
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        overflow: 'hidden',
        maxWidth: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Calendar size={18} style={{ color: 'var(--accent-purple)' }} />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Consistency</h3>
          </div>
        </div>

        <div style={{ width: '100%', overflowX: 'auto', paddingBottom: 8 }} className="no-scrollbar">
          <div style={{ display: 'flex', gap: 8, minWidth: 720 }}>
            {/* Day labels on the left */}
            <div style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 10px)',
              gap: '3px',
              padding: '18px 0 4px',
              fontSize: 9,
              color: 'var(--text-muted)',
              textAlign: 'right',
              lineHeight: '10px',
              width: 24,
              flexShrink: 0
            }}>
              <div></div>
              <div>Mon</div>
              <div></div>
              <div>Wed</div>
              <div></div>
              <div>Fri</div>
              <div></div>
            </div>

            {/* Month labels + grid on the right */}
            <div style={{ flex: 1 }}>
              {/* Month Labels */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(53, 10px)',
                gap: '3px',
                fontSize: 9,
                color: 'var(--text-muted)',
                marginBottom: 4
              }}>
                {Array.from({ length: 53 }).map((_, i) => {
                  const labelObj = monthLabels.find(l => l.index === i);
                  return (
                    <div key={i} style={{ gridColumnStart: i + 1, gridColumnEnd: i + 3, gridRow: 1, whiteSpace: 'nowrap' }}>
                      {labelObj ? labelObj.label : ''}
                    </div>
                  );
                })}
              </div>

            {/* Heatmap Grid */}
            <div style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 10px)',
              gridAutoFlow: 'column',
              gap: '3px'
            }}>
              {gridDates.map((d, idx) => {
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const count = dailyLogCounts[dStr] || 0;
                const opacity = count === 0 ? 1 : count === 1 ? 0.35 : count === 2 ? 0.6 : count === 3 ? 0.8 : 1.0;
                const color = 'var(--accent-purple)';
                return (
                  <div
                    key={idx}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredDay({
                        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        count,
                        x: rect.left + window.scrollX + rect.width / 2,
                        y: rect.top + window.scrollY - 38
                      });
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: count === 0
                        ? (theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)')
                        : color,
                      opacity,
                      boxShadow: count > 3 ? `0 0 6px ${color}` : 'none',
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease, background-color 0.2s',
                    }}
                    className="heatmap-cell"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
          <span>Less</span>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.35 }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.6 }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.8 }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 1.0, boxShadow: '0 0 4px var(--accent-purple)' }} />
          <span>More</span>
        </div>
      </div>

      {/* Weekly Muscle Suggestion Board */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 28,
        animationDelay: '0.22s',
        border: '1px solid rgba(0, 245, 255, 0.12)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} style={{ color: 'var(--accent-cyan)' }} />
              Muscle Targets
            </h3>
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
              All muscles hit this week!
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Muscles left to hit:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              {(showAllLeftMuscles ? leftMuscles : leftMuscles.slice(0, 4)).map(m => {
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
              {leftMuscles.length > 4 && (
                <button
                  onClick={() => setShowAllLeftMuscles(!showAllLeftMuscles)}
                  style={{
                    background: 'rgba(0, 245, 255, 0.08)',
                    border: '1px solid rgba(0, 245, 255, 0.2)',
                    color: 'var(--accent-cyan)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '6px 14px',
                    borderRadius: 20,
                    transition: 'all 0.15s ease',
                  }}
                  className="show-more-btn"
                >
                  {showAllLeftMuscles ? 'Show Less' : `+ ${leftMuscles.length - 4} more`}
                </button>
              )}
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
                <strong>Suggestion:</strong> Add{' '}
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
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ⚡ Recovery & Muscle Fatigue Status Card */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 28,
        animationDelay: '0.23s',
        border: '1px solid var(--border-color)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: 32
        }}>
          {/* Left: Rest & Recovery Ring */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingRight: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={18} style={{ color: 'var(--accent-orange)' }} />
              Recovery
            </h3>
            
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="120" height="120" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="rec-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={recovery < 40 ? '#ef4444' : recovery < 80 ? '#c084fc' : '#00f5ff'} />
                    <stop offset="100%" stopColor={recovery < 40 ? '#f97316' : recovery < 80 ? '#a855f7' : '#10b981'} />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="transparent" />
                <circle cx="50" cy="50" r="40" stroke="url(#rec-gradient)" strokeWidth="6" fill="transparent"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * (1 - recovery / 100)}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{recovery}%</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {recovery < 40 ? 'Fatigued' : recovery < 80 ? 'Recovering' : 'Prime'}
                </span>
              </div>
            </div>
            
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                {hoursSinceLastLog !== null ? (
                  <>Last workout: <strong>{Math.round(hoursSinceLastLog)}h</strong> ago</>
                ) : (
                  <>Ready to start!</>
                )}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, maxWidth: 260, marginInline: 'auto' }}>
                {recovery < 40 ? 'Fatigued. Focus on rest.' :
                 recovery < 80 ? 'Recovering. Light training OK.' :
                 'Fully primed. Go for a PR!'}
              </p>
            </div>
          </div>

          {/* Right: Muscle Fatigue Scores */}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} style={{ color: 'var(--accent-cyan)' }} />
              Fatigue
            </h3>
            
            {/* Fatigued muscles list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(fatigueScores)
                .filter(([, score]) => score > 10)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 4) // show top 4 fatigued
                .map(([m, score]) => {
                  const meta = MUSCLE_META[m as MuscleKey];
                  return (
                    <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                          {meta.label}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{score}% fatigued</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${score}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${meta.color}, #ef4444)`,
                          borderRadius: 3
                        }} />
                      </div>
                    </div>
                  );
                })}
              
              {/* If no fatigued muscles */}
              {Object.values(fatigueScores).filter(s => s > 10).length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--accent-green)' }}>
                  <span>🌟</span>
                  <span>All muscle groups are fully recovered and fresh!</span>
                </div>
              )}

              {/* Fresh muscles sub-list */}
              <div style={{ marginTop: 14 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Fresh & Ready Muscles
                </h4>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {Object.entries(fatigueScores).filter(([, score]) => score <= 10).length === 16 ? (
                    <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>All muscle groups are fully recovered and ready!</span>
                  ) : Object.entries(fatigueScores).filter(([, score]) => score <= 10).length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>None - all muscles currently training/fatigued.</span>
                  ) : (
                    Object.entries(fatigueScores)
                      .filter(([, score]) => score <= 10)
                      .map(([m]) => MUSCLE_META[m as MuscleKey].label)
                      .join(', ')
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Community Log */}
      {recentLog && (
        <button
          className="card dash-recent dash-stat-btn animate-fade-in-up"
          style={{
            width: '100%',
            marginBottom: 28,
            animationDelay: '0.25s',
            borderLeft: '3px solid var(--accent-purple)',
            background: theme === 'light'
              ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
              : 'linear-gradient(145deg, rgba(14, 14, 22, 0.9), rgba(20, 20, 30, 0.9))',
            textAlign: 'left',
            cursor: 'pointer'
          }}
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

      {/* 🏆 PR Milestone Feed */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 28,
        animationDelay: '0.27s',
        border: '1px solid var(--border-color)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Trophy size={18} style={{ color: 'var(--accent-orange)' }} />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Achievements</h3>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recentMilestones.map((m, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: theme === 'light' ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '12px 16px',
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: m.type === 'pr' ? 'rgba(245,158,11,0.1)' : m.type === 'streak' ? 'rgba(249,115,22,0.1)' : 'rgba(0,245,255,0.1)',
                color: m.type === 'pr' ? 'var(--accent-orange)' : m.type === 'streak' ? 'var(--accent-orange)' : 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {m.type === 'pr' ? <Award size={18} /> : m.type === 'streak' ? <Flame size={18} /> : <Target size={18} />}
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{m.title}</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0', lineHeight: 1.4 }}>{m.message}</p>
              </div>
            </div>
          ))}

          {recentMilestones.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              <Trophy size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
              <p style={{ fontSize: 13, margin: 0 }}>No achievements logged in the last 7 days.</p>
              <p style={{ fontSize: 11, opacity: 0.7, margin: '2px 0 0 0' }}>Hit a new personal record or build your streak to unlock achievements!</p>
            </div>
          )}
        </div>
      </div>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Charts Header with Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Progress Charts</h2>
            <div style={{
              display: 'flex',
              background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              padding: 2,
              borderRadius: 8,
            }}>
              <button
                onClick={() => setChartMetric('pb')}
                style={{
                  background: chartMetric === 'pb' ? 'var(--bg-secondary)' : 'transparent',
                  color: chartMetric === 'pb' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: chartMetric === 'pb' ? 'var(--shadow-card)' : 'none',
                }}
              >
                Max Weight (PB)
              </button>
              <button
                onClick={() => setChartMetric('volume')}
                style={{
                  background: chartMetric === 'volume' ? 'var(--bg-secondary)' : 'transparent',
                  color: chartMetric === 'volume' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: chartMetric === 'volume' ? 'var(--shadow-card)' : 'none',
                }}
              >
                Total Volume
              </button>
            </div>
          </div>

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
                  <span className="dash-chart-meta-item" title={chartMetric === 'pb' ? "Personal Best (Maximum weight lifted)" : "Max Day Volume"}>
                    <Award size={11} style={{ color: chartColor }} />
                    {chartMetric === 'pb' ? <>PB: <strong>{chart.maxWeight}kg</strong></> : <>Max Vol: <strong>{chart.maxVolume}kg</strong></>}
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
                      dataKey={chartMetric === 'pb' ? 'weight' : 'volume'}
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
