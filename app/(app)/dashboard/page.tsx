'use client';

import { createPortal } from 'react-dom';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MuscleKey, MUSCLE_META, getMusclesForExercise } from '@/lib/muscle-utils';
import { computeStreak, dayStr, estimateOneRepMax, setVolume, totalVolume } from '@/lib/metrics';
import UserProfileModal from '../UserProfileModal';
import {
  TrendingUp, TrendingDown, Dumbbell, Calendar, Award, Flame,
  ChevronRight, Plus, Trophy, Users, X, ArrowRight, BarChart2, Target, Activity
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';

interface ExerciseChart {
  exerciseName: string;
  exerciseId: string;
  data: { date: string; weight: number; volume: number; estimated1RM: number }[];
  maxWeight: number;
  maxVolume: number;
  max1RM: number;
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
  consistency30: number;
  consistency30Days: string[];
}

interface GroupedLog {
  user_id: string;
  username: string;
  avatar_url: string | null;
  timeAgo: string;
  timestamp: number;
  exercises: {
    name: string;
    weight: number;
    isPR: boolean;
  }[];
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
  const [stats, setStats] = useState<Stats>({ totalLogs: 0, uniqueExercises: 0, bestLift: null, thisWeekLogs: 0, lastWeekLogs: 0, streak: 0, consistency30: 0, consistency30Days: [] });
  const [recentLogs, setRecentLogs] = useState<GroupedLog[]>([]);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([]);
  const [leftMuscles, setLeftMuscles] = useState<MuscleKey[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [showAllLeftMuscles, setShowAllLeftMuscles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(200);
  const [compactAxis, setCompactAxis] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const [chartMetric, setChartMetric] = useState<'pb' | 'volume' | '1rm'>('pb');
  const [recovery, setRecovery] = useState(100);
  const [hoursSinceLastLog, setHoursSinceLastLog] = useState<number | null>(null);
  const [fatigueScores, setFatigueScores] = useState<Record<MuscleKey, number>>({} as any);
  const [recentMilestones, setRecentMilestones] = useState<Milestone[]>([]);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const [dailyLogCounts, setDailyLogCounts] = useState<Record<string, number>>({});
  const [weeklyVolume, setWeeklyVolume] = useState<number>(0);
  
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

      // Recent global logs
      try {
        const fortyEightHoursAgo = new Date();
        fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

        const { data: latestLogs } = await supabase
          .from('workout_logs')
          .select('user_id, exercise_id, weight_kg, reps, created_at, logged_at, exercises(name)')
          .gte('created_at', fortyEightHoursAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(30);

        if (latestLogs && latestLogs.length > 0) {
          const userIds = [...new Set(latestLogs.map((l: any) => l.user_id))];
          const exerciseIds = [...new Set(latestLogs.map((l: any) => l.exercise_id))];
          
          // These two lookups are independent of each other — run them in
          // parallel instead of waterfalling profiles → historicalLogs.
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60); // Check last 60 days for PRs to limit data size
          const [{ data: profiles }, { data: historicalLogs }] = await Promise.all([
            supabase.from('profiles').select('id, username, avatar_url').in('id', userIds),
            supabase
              .from('workout_logs')
              .select('user_id, exercise_id, weight_kg, created_at')
              .in('user_id', userIds)
              .in('exercise_id', exerciseIds)
              .gte('created_at', thirtyDaysAgo.toISOString()),
          ]);
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

          // Group by user and time window (e.g. 2 hours)
          const groups: Record<string, GroupedLog> = {};

          latestLogs.forEach((log: any) => {
            const profile = profileMap.get(log.user_id) || {} as any;
            // time bucket is roughly 2 hours
            const bucketMs = 2 * 60 * 60 * 1000; 
            const logTime = new Date(log.created_at).getTime();
            const bucket = Math.floor(logTime / bucketMs);
            const key = `${log.user_id}_${bucket}`;

            let isPR = false;
            if (historicalLogs) {
              const prevMax = historicalLogs
                .filter((hl: any) => hl.user_id === log.user_id && hl.exercise_id === log.exercise_id && new Date(hl.created_at).getTime() < logTime)
                .reduce((max: number, hl: any) => Math.max(max, hl.weight_kg), 0);
              if (log.weight_kg > prevMax && prevMax > 0) {
                isPR = true;
              }
            }

            if (!groups[key]) {
              const diff = Date.now() - logTime;
              const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
              const timeAgo = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'Just now';
              groups[key] = {
                user_id: log.user_id,
                username: profile.username || 'Unknown',
                avatar_url: profile.avatar_url || null,
                timeAgo,
                timestamp: logTime,
                exercises: []
              };
            }
            
            // avoid duplicates if same exercise logged multiple times in window
            const existingEx = groups[key].exercises.find(e => e.name === log.exercises?.name);
            if (existingEx) {
              if (log.weight_kg > existingEx.weight) {
                existingEx.weight = log.weight_kg;
                existingEx.isPR = existingEx.isPR || isPR;
              }
            } else {
              groups[key].exercises.push({
                name: log.exercises?.name || 'Unknown',
                weight: log.weight_kg,
                isPR
              });
            }
          });

          // Fetch weekly volume for the current user
        const volumeDaysAgo = new Date();
        volumeDaysAgo.setDate(volumeDaysAgo.getDate() - 7);
        const { data: volumeLogs } = await supabase
          .from('workout_logs')
          .select('weight_kg, reps')
          .eq('user_id', user.id)
          .gte('logged_at', volumeDaysAgo.toISOString().split('T')[0]);
        
        setWeeklyVolume(totalVolume(volumeLogs || []));

        setRecentLogs(Object.values(groups).sort((a, b) => b.timestamp - a.timestamp));
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
      const top5 = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 2).map(([id]) => id);

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

        const byDate = exerciseLogs.reduce((acc: Record<string, { weight: number; volume: number; estimated1RM: number }>, l: any) => {
          const vol = setVolume(l.weight_kg, l.reps);
          const e1RM = estimateOneRepMax(l.weight_kg, l.reps);

          if (!acc[l.logged_at]) {
            acc[l.logged_at] = { weight: l.weight_kg, volume: vol, estimated1RM: e1RM };
          } else {
            acc[l.logged_at].volume += vol;
            if (l.weight_kg > acc[l.logged_at].weight) {
              acc[l.logged_at].weight = l.weight_kg;
            }
            if (e1RM > acc[l.logged_at].estimated1RM) {
              acc[l.logged_at].estimated1RM = e1RM;
            }
          }
          return acc;
        }, {} as Record<string, { weight: number; volume: number; estimated1RM: number }>);

        const data = Object.entries(byDate)
          .map(([date, val]: [string, any]) => ({
            date,
            weight: Number(val.weight),
            volume: Number(val.volume),
            estimated1RM: Math.round(Number(val.estimated1RM)),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        let maxVolume = 0;
        let max1RM = 0;
        Object.values(byDate).forEach((val: any) => {
          if (val.volume > maxVolume) maxVolume = val.volume;
          if (val.estimated1RM > max1RM) max1RM = Math.round(val.estimated1RM);
        });

        return {
          exerciseName: names[eid],
          exerciseId: eid,
          data,
          maxWeight: best.weight_kg,
          maxVolume,
          max1RM,
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

      const activeDays = new Set<string>(logs.map((l: any) => l.logged_at));
      const streak = computeStreak(activeDays, today);

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (29 - i));
        return dayStr(d);
      });
      const active30Days = last30Days.filter(d => activeDays.has(d)).length;
      const consistency30 = Math.round((active30Days / 30) * 100);

      setStats({ totalLogs: logs.length, uniqueExercises, bestLift, thisWeekLogs, lastWeekLogs, streak, consistency30, consistency30Days: last30Days.map(d => activeDays.has(d) ? 'active' : 'rest') });
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
      const metricType = chartMetric;
      let labelText = 'Max Weight: ';
      let color = 'var(--accent-purple)';
      
      if (metricType === 'volume') {
        labelText = 'Total Volume: ';
        color = 'var(--accent-cyan)';
      } else if (metricType === '1rm') {
        labelText = 'Estimated 1RM: ';
        color = 'var(--accent-orange)';
      }

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
            {labelText}
            <span style={{ color }}>{payload[0].value} kg</span>
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

  // Deriving "What to Train Today" CTA
  const recoveredMuscles = Object.entries(fatigueScores)
    .filter(([_, score]) => score < 30)
    .map(([key]) => key as MuscleKey);
  
  let ctaTitle = "Rest Day Recommended";
  let ctaText = "Most of your muscles are heavily fatigued. Consider taking a rest day or doing light cardio!";
  let ctaAction = "Log Active Recovery";
  let ctaIcon = <Activity size={24} style={{ color: 'var(--accent-cyan)' }} />;
  let ctaPath = "/log";

  if (recoveredMuscles.length > 0) {
    if (recoveredMuscles.length === Object.keys(MUSCLE_META).length) {
      ctaTitle = "Fully Recovered!";
      ctaText = "All your muscle groups are fully recovered. It's a great day to start a new split!";
      ctaAction = "Start a Split";
      ctaIcon = <Target size={24} style={{ color: 'var(--accent-green)' }} />;
      ctaPath = "/splits";
    } else {
      const topRecovered = recoveredMuscles.slice(0, 3).map(m => MUSCLE_META[m].label);
      ctaTitle = "Ready to Train";
      ctaText = `Your ${topRecovered.join(', ')} are recovered. Today is a great day to target them!`;
      ctaAction = "Log Workout";
      ctaIcon = <Flame size={24} style={{ color: 'var(--accent-orange)' }} />;
      ctaPath = "/log";
    }
  }

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

      {/* What to Train Today CTA Banner */}
      <div className="card animate-fade-in-up" style={{
        marginBottom: 24,
        border: '1px solid var(--border-color)',
        padding: '20px',
        borderRadius: 'var(--radius-lg)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(30, 30, 40, 0.8), rgba(20, 20, 30, 0.8))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 250 }}>
          <div style={{ 
            width: 48, height: 48, borderRadius: '50%', 
            background: 'var(--bg-tertiary)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {ctaIcon}
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 18 }}>{ctaTitle}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>{ctaText}</p>
          </div>
        </div>
        <button 
          onClick={() => router.push(ctaPath)}
          className="btn btn-primary"
          style={{ whiteSpace: 'nowrap' }}
        >
          {ctaAction}
          <ArrowRight size={16} style={{ marginLeft: 6 }} />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="dash-quick-actions">
        <button className="dash-quick-btn" onClick={() => router.push('/log')}>
          <div className="dash-quick-icon" style={{ background: 'rgba(0,245,255,0.1)', color: 'var(--accent-cyan)' }}>
            <Plus size={18} />
          </div>
          <span>Log Workout</span>
        </button>
        <button className="dash-quick-btn" onClick={() => router.push('/circles?tab=leaderboard')}>
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

      {/* 🐘 Fun Volume Card */}
      {weeklyVolume > 0 && (() => {
        const TIERS = [
          { ceil: 50,       name: 'a microwave',          icon: '📦', color: '#a1a1aa' },
          { ceil: 200,      name: 'a baby hippo',         icon: '🦛', color: '#f472b6' },
          { ceil: 500,      name: 'a grizzly bear',       icon: '🐻', color: '#fb923c' },
          { ceil: 1000,     name: 'a grand piano',        icon: '🎹', color: '#a78bfa' },
          { ceil: 2500,     name: 'a small car',          icon: '🚗', color: '#38bdf8' },
          { ceil: 6000,     name: 'an African elephant',  icon: '🐘', color: '#4ade80' },
          { ceil: 15000,    name: 'a T-Rex',              icon: '🦖', color: '#facc15' },
          { ceil: Infinity, name: 'an F-16 fighter jet',  icon: '✈️', color: '#f87171' },
        ];
        const idx = TIERS.findIndex(t => weeklyVolume < t.ceil);
        const eq = TIERS[idx];
        const next = TIERS[idx + 1];
        const prevCeil = idx === 0 ? 0 : TIERS[idx - 1].ceil;
        const hasNext = !!next && eq.ceil !== Infinity;
        const progress = hasNext
          ? Math.min(100, Math.max(4, Math.round(((weeklyVolume - prevCeil) / (eq.ceil - prevCeil)) * 100)))
          : 100;
        const toNext = hasNext ? Math.max(1, Math.ceil(eq.ceil - weeklyVolume)) : 0;

        return (
          <div className="card dash-volume-card" style={{
            marginBottom: 28,
            padding: 20,
            borderRadius: 'var(--radius-lg)',
            background: theme === 'light'
              ? `linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,245,255,0.95))`
              : `linear-gradient(135deg, rgba(20,20,30,0.9), rgba(10,10,18,0.9))`,
            border: `1px solid ${eq.color}40`,
            boxShadow: `0 8px 32px -8px ${eq.color}30`,
            animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Background glow */}
            <div style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, background: eq.color, filter: 'blur(80px)', opacity: 0.18, borderRadius: '50%', zIndex: 0 }} />
            {/* Light sheen sweeping across the card */}
            <div className="dash-volume-sheen" style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', zIndex: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
              pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 2 }}>
              {/* Icon with pulsing halo */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div className="dash-volume-halo" style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  background: eq.color, opacity: 0.25, filter: 'blur(14px)',
                }} />
                <div style={{ fontSize: 48, lineHeight: 1, filter: `drop-shadow(0 4px 12px ${eq.color}60)`, position: 'relative', animation: 'float 2.6s infinite ease-in-out' }}>
                  {eq.icon}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                  Weekly Volume
                </div>
                <div style={{ marginBottom: 2, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: 34, fontWeight: 900, letterSpacing: '-1px',
                    background: `linear-gradient(135deg, ${eq.color}, var(--text-primary))`,
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                    <CountUp value={weeklyVolume} />
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>kg</span>
                </div>
                <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                  That&apos;s like lifting <span style={{ color: eq.color, fontWeight: 700 }}>{eq.name}</span> {eq.icon}
                </div>
              </div>
            </div>

            {/* Progress toward the next tier */}
            <div style={{ position: 'relative', zIndex: 2, marginTop: 16 }}>
              <div style={{
                height: 8, borderRadius: 999, overflow: 'hidden',
                background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
              }}>
                <div className="dash-volume-fill" style={{
                  width: `${progress}%`, height: '100%', borderRadius: 999,
                  transformOrigin: 'left center',
                  background: `linear-gradient(90deg, ${eq.color}, ${(next || eq).color})`,
                  boxShadow: `0 0 10px ${eq.color}90`,
                }} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, fontWeight: 600 }}>
                {hasNext
                  ? <>Only <span style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>{toNext.toLocaleString()} kg</span> until you&apos;re hoisting {next.name} {next.icon}</>
                  : <>🏆 Top tier reached — nothing heavier left to lift!</>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📅 30-Day Consistency Card */}
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
        {(() => {
          const activeCount = stats.consistency30Days.filter(s => s === 'active').length;
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(0,245,255,0.12)', flexShrink: 0 }}>
                  <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>30-Day Consistency</h3>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                    {activeCount} of 30 days active
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <span style={{
                    fontSize: 26, fontWeight: 900, letterSpacing: '-1px',
                    background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                    {stats.consistency30}<span style={{ fontSize: 15 }}>%</span>
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }} className="no-scrollbar">
                {stats.consistency30Days.map((status, i) => {
                  const active = status === 'active';
                  return (
                    <div
                      key={i}
                      className="dash-consistency-bar"
                      title={`${active ? 'Workout completed' : 'Rest day'} — ${30 - i} day${30 - i === 1 ? '' : 's'} ago`}
                      style={{
                        flex: 1,
                        minWidth: 3,
                        height: active ? '100%' : '34%',
                        borderRadius: 999,
                        transformOrigin: 'bottom center',
                        animationDelay: `${i * 22}ms`,
                        background: active
                          ? 'linear-gradient(180deg, var(--accent-cyan), var(--accent-purple))'
                          : (theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'),
                        boxShadow: active ? '0 0 10px rgba(0, 245, 255, 0.45)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      <div className="dash-bento-grid">
      {/* Weekly Muscle Suggestion Board */}
      <div className="card animate-fade-in-up" style={{
        height: '100%',
        animationDelay: '0.22s',
        border: '1px solid rgba(0, 245, 255, 0.12)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} style={{ color: 'var(--accent-cyan)' }} />
              Coverage
            </h3>
            
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="120" height="120" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="cov-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00f5ff" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="transparent" />
                <circle cx="50" cy="50" r="40" stroke="url(#cov-gradient)" strokeWidth="6" fill="transparent"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * (1 - hitCount / 16)}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{hitCount}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  / 16 HIT
                </span>
              </div>
            </div>
            
            <div style={{ marginTop: 16, textAlign: 'center', width: '100%' }}>
              {leftMuscles.length === 0 ? (
                 <p style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 500, margin: 0 }}>All muscles hit!</p>
              ) : (
                 <>
                   <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>Focus on:</p>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                     {leftMuscles.slice(0, 3).map(m => (
                        <span key={m} style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: 'var(--text-primary)' }}>
                          {MUSCLE_META[m].label}
                        </span>
                     ))}
                     {leftMuscles.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', padding: '4px 6px' }}>+{leftMuscles.length - 3}</span>}
                   </div>
                 </>
              )}
            </div>
          </div>
      </div>

      {/* ⚡ Recovery Card */}
      <div className="card animate-fade-in-up" style={{
        height: '100%',
        animationDelay: '0.23s',
        border: '1px solid var(--border-color)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
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
      </div>

      {/* Muscle Fatigue Status Card */}
      <div className="card animate-fade-in-up" style={{
        height: '100%',
        animationDelay: '0.24s',
        border: '1px solid var(--border-color)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} style={{ color: 'var(--accent-cyan)' }} />
              Muscle Fatigue
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

      <div className="dash-two-col-grid">
      {/* Recent Community Logs */}
      <div className="card animate-fade-in-up" style={{
        animationDelay: '0.25s',
        border: '1px solid var(--border-color)',
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(245, 245, 250, 0.9))'
          : 'linear-gradient(135deg, rgba(14, 14, 22, 0.8), rgba(20, 20, 30, 0.8))',
        padding: 24,
        borderRadius: 'var(--radius-lg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={18} style={{ color: 'var(--accent-purple)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Community Logs</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recentLogs.map((log, idx) => (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: theme === 'light' ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '16px',
            }}>
              {/* Header: User & Time */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button 
                    type="button" 
                    style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={(e) => { e.stopPropagation(); setProfileModalUserId(log.user_id); }}
                  >
                    {log.avatar_url ? (
                      <img src={log.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        {log.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{log.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.timeAgo}</div>
                  </div>
                </div>
                <button 
                  onClick={() => router.push('/circles')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: 4 }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Exercises List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 32 }}>
                {log.exercises.slice(0, 4).map((ex, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{ex.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {ex.isPR && (
                        <span style={{ 
                          fontSize: 10, 
                          fontWeight: 700, 
                          color: '#fbbf24', 
                          background: 'rgba(251,191,36,0.1)', 
                          padding: '2px 6px', 
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3
                        }}>
                          <Trophy size={10} /> PR
                        </span>
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{ex.weight}kg</span>
                    </div>
                  </div>
                ))}
                {log.exercises.length > 4 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                    +{log.exercises.length - 4} more exercises
                  </div>
                )}
              </div>
            </div>
          ))}
          {recentLogs.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '12px 0' }}>No community logs found.</p>
          )}
        </div>
      </div>

      {/* 🏆 PR Milestone Feed */}
      <div className="card animate-fade-in-up" style={{
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
              <button
                onClick={() => setChartMetric('1rm')}
                style={{
                  background: chartMetric === '1rm' ? 'var(--bg-secondary)' : 'transparent',
                  color: chartMetric === '1rm' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: chartMetric === '1rm' ? 'var(--shadow-card)' : 'none',
                }}
              >
                Est. 1RM
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
                  <span className="dash-chart-meta-item" title={chartMetric === 'pb' ? "Personal Best (Maximum weight lifted)" : chartMetric === '1rm' ? "Estimated 1 Rep Max" : "Max Day Volume"}>
                    <Award size={11} style={{ color: chartColor }} />
                    {chartMetric === 'pb' ? <>PB: <strong>{chart.maxWeight}kg</strong></> : chartMetric === '1rm' ? <>1RM: <strong>{chart.max1RM}kg</strong></> : <>Max Vol: <strong>{chart.maxVolume}kg</strong></>}
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
                      dataKey={chartMetric === 'pb' ? 'weight' : chartMetric === '1rm' ? 'estimated1RM' : 'volume'}
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

      {profileModalUserId && (
        <UserProfileModal 
          userId={profileModalUserId} 
          onClose={() => setProfileModalUserId(null)} 
        />
      )}
    </div>
  );
}
