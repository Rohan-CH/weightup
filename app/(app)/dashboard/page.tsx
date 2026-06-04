'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, TrendingDown, Dumbbell, Calendar, Award, Flame } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ExerciseChart {
  exerciseName: string;
  data: { date: string; weight: number }[];
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

const CHART_COLORS = ['#00f5ff', '#7c3aed', '#ec4899', '#10b981', '#f59e0b'];

// Animated number that counts up from 0 to `value` on mount / change.
function CountUp({ value, suffix = '', duration = 700 }: { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{display}{suffix}</>;
}

function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  if (value === 0) {
    return <div className="stat-delta neutral">No change{unit}</div>;
  }
  const up = value > 0;
  return (
    <div className={`stat-delta ${up ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{value}{unit} vs last week
    </div>
  );
}

export default function DashboardPage() {
  const [charts, setCharts] = useState<ExerciseChart[]>([]);
  const [stats, setStats] = useState<Stats>({ totalLogs: 0, uniqueExercises: 0, bestLift: null, thisWeekLogs: 0, lastWeekLogs: 0, streak: 0 });
  const [recentLog, setRecentLog] = useState<RecentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(220);
  const [compactAxis, setCompactAxis] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 520;
      setChartHeight(mobile ? 170 : 220);
      setCompactAxis(mobile);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch the recent log globally
    try {
      const { data: latestLogs } = await supabase
        .from('workout_logs')
        .select('user_id, weight_kg, created_at, exercises(name)')
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestLogs && latestLogs.length > 0) {
        const globalLog = latestLogs[0];
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', globalLog.user_id)
          .single();

        if (profile) {
          const date = new Date(globalLog.created_at);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          let timeAgo = 'Just now';
          if (diffDays > 0) timeAgo = `${diffDays}d ago`;
          else if (diffHours > 0) timeAgo = `${diffHours}h ago`;
          else if (diffMins > 0) timeAgo = `${diffMins}m ago`;

          setRecentLog({
            exerciseName: globalLog.exercises?.name || 'Unknown',
            weight: globalLog.weight_kg,
            username: profile.username || 'Unknown',
            avatar_url: profile.avatar_url,
            timeAgo
          });
        }
      }
    } catch (err) {
      console.error('Error fetching recent log:', err);
    }

    // Get all logs for this user
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('*, exercises(name)')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: true });

    if (!logs || logs.length === 0) {
      setLoading(false);
      return;
    }

    // Count logs per exercise
    const exerciseCounts: Record<string, number> = {};
    const exerciseNames: Record<string, string> = {};
    logs.forEach((log: any) => {
      const eid = log.exercise_id;
      exerciseCounts[eid] = (exerciseCounts[eid] || 0) + 1;
      exerciseNames[eid] = log.exercises?.name || 'Unknown';
    });

    // Top 5 most logged
    const topExercises = Object.entries(exerciseCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);

    // Build chart data
    const chartData: ExerciseChart[] = topExercises.map((eid) => {
      const exerciseLogs = logs
        .filter((l: any) => l.exercise_id === eid)
        .reduce((acc: Record<string, number>, l: any) => {
          const date = l.logged_at;
          if (!acc[date] || l.weight_kg > acc[date]) {
            acc[date] = l.weight_kg;
          }
          return acc;
        }, {});

      return {
        exerciseName: exerciseNames[eid],
        data: Object.entries(exerciseLogs)
          .map(([date, weight]) => ({ date, weight: Number(weight) }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    });

    // Stats
    const uniqueExercises = new Set(logs.map((l: any) => l.exercise_id)).size;
    let bestLift: { name: string; weight: number } | null = null;
    logs.forEach((l: any) => {
      if (!bestLift || l.weight_kg > bestLift.weight) {
        bestLift = { name: l.exercises?.name || 'Unknown', weight: l.weight_kg };
      }
    });

    const today = new Date();
    const dayStr = (d: Date) => d.toISOString().split('T')[0];
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    const weekStr = dayStr(oneWeekAgo);
    const twoWeekStr = dayStr(twoWeeksAgo);
    const thisWeekLogs = logs.filter((l: any) => l.logged_at >= weekStr).length;
    const lastWeekLogs = logs.filter((l: any) => l.logged_at >= twoWeekStr && l.logged_at < weekStr).length;

    // Streak: consecutive active days ending today or yesterday
    const activeDays = new Set(logs.map((l: any) => l.logged_at));
    let streak = 0;
    const cursor = new Date(today);
    // allow streak to count if logged today OR yesterday (grace for not-yet-logged today)
    if (!activeDays.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (activeDays.has(dayStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    setStats({ totalLogs: logs.length, uniqueExercises, bestLift, thisWeekLogs, lastWeekLogs, streak });
    setCharts(chartData);
    setLoading(false);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'rgba(14, 14, 22, 0.95)',
          border: '1px solid rgba(0, 245, 255, 0.15)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
        }}>
          <p style={{ color: '#8888a0', marginBottom: 4 }}>{label}</p>
          <p style={{ color: '#00f5ff', fontWeight: 600 }}>{payload[0].value} kg</p>
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

  return (
    <div className="animate-fade-in-up">
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>Dashboard</h1>
          <p>Your training overview and progress</p>
        </div>
        {stats.streak > 0 && (
          <div className="streak-chip" title={`${stats.streak}-day active streak`}>
            <Flame size={16} />
            <span><strong><CountUp value={stats.streak} /></strong> day streak</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="dash-stats">
        <div className="stat-card dash-stat" style={{ animationDelay: '0.05s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Dumbbell size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Total Logs</span>
          </div>
          <div className="stat-value"><CountUp value={stats.totalLogs} /></div>
          {stats.thisWeekLogs > 0 && <div className="stat-delta up"><TrendingUp size={12} />+{stats.thisWeekLogs} this week</div>}
        </div>
        <div className="stat-card dash-stat" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Calendar size={18} style={{ color: 'var(--accent-purple)' }} />
            <span className="stat-label" style={{ margin: 0 }}>This Week</span>
          </div>
          <div className="stat-value"><CountUp value={stats.thisWeekLogs} /></div>
          <Delta value={stats.thisWeekLogs - stats.lastWeekLogs} />
        </div>
        <div className="stat-card dash-stat" style={{ animationDelay: '0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-green)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Exercises</span>
          </div>
          <div className="stat-value"><CountUp value={stats.uniqueExercises} /></div>
          <div className="stat-delta neutral">{stats.uniqueExercises === 1 ? 'movement tracked' : 'movements tracked'}</div>
        </div>
        <div className="stat-card dash-stat" style={{ animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Award size={18} style={{ color: 'var(--accent-orange)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Best Lift</span>
          </div>
          <div className="stat-value">{stats.bestLift ? <><CountUp value={stats.bestLift.weight} />kg</> : '—'}</div>
          {stats.bestLift && (
            <div className="stat-delta neutral" style={{ color: 'var(--text-secondary)' }}>
              {stats.bestLift.name}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {recentLog && (
        <div className="card dash-recent animate-fade-in-up" style={{ marginBottom: 32, animationDelay: '0.25s', borderLeft: '3px solid var(--accent-purple)', background: 'linear-gradient(145deg, rgba(14, 14, 22, 0.9), rgba(20, 20, 30, 0.9))' }}>
          <div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} style={{ color: 'var(--accent-purple)' }}/> Most Recent Community Log
            </h3>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              {recentLog.exerciseName} <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: 18 }}>• {recentLog.weight}kg</span>
            </div>
          </div>
          <div className="dash-recent-user">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{recentLog.username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{recentLog.timeAgo}</div>
            </div>
            {recentLog.avatar_url ? (
              <img src={recentLog.avatar_url} alt="" className="avatar" style={{ width: 44, height: 44, border: '2px solid rgba(124, 58, 237, 0.3)' }} />
            ) : (
              <div className="avatar-placeholder" style={{ width: 44, height: 44, fontSize: 16, background: 'rgba(124, 58, 237, 0.1)', color: 'var(--accent-purple)', border: '2px solid rgba(124, 58, 237, 0.3)' }}>
                {recentLog.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      {charts.length === 0 ? (
        <div className="card empty-state">
          <Dumbbell size={48} />
          <h3>No workout data yet</h3>
          <p>Start logging your workouts to see your progress charts here.</p>
        </div>
      ) : (
        <div className="dash-charts">
          {charts.map((chart, i) => (
            <div key={chart.exerciseName} className="card dash-stat animate-fade-in-up" style={{ animationDelay: `${0.1 * (i + 1)}s` }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: CHART_COLORS[i % CHART_COLORS.length],
                  display: 'inline-block'
                }} />
                {chart.exerciseName}
              </h3>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart data={chart.data} margin={{ top: 4, right: 8, left: compactAxis ? -24 : 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#55556a', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                    minTickGap={compactAxis ? 24 : 8}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#55556a', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                    width={compactAxis ? 28 : 40}
                    unit="kg"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                    activeDot={{ r: 5, stroke: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2 }}
                    isAnimationActive
                    animationDuration={900}
                    animationBegin={150 * i}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
