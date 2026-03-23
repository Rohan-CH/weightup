'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, Dumbbell, Calendar, Award } from 'lucide-react';
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
}

interface RecentLog {
  exerciseName: string;
  weight: number;
  username: string;
  avatar_url: string | null;
  timeAgo: string;
}

const CHART_COLORS = ['#00f5ff', '#7c3aed', '#ec4899', '#10b981', '#f59e0b'];

export default function DashboardPage() {
  const [charts, setCharts] = useState<ExerciseChart[]>([]);
  const [stats, setStats] = useState<Stats>({ totalLogs: 0, uniqueExercises: 0, bestLift: null, thisWeekLogs: 0 });
  const [recentLog, setRecentLog] = useState<RecentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
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

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekStr = oneWeekAgo.toISOString().split('T')[0];
    const thisWeekLogs = logs.filter((l: any) => l.logged_at >= weekStr).length;

    setStats({ totalLogs: logs.length, uniqueExercises, bestLift, thisWeekLogs });
    setCharts(chartData);
    setLoading(false);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: '#ffffff',
          border: '2px dashed #2d2d2d',
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 15,
          fontFamily: "'Kalam', cursive",
          boxShadow: '2px 2px 0px rgba(0,0,0,0.2)'
        }}>
          <p style={{ color: '#555', marginBottom: 4, fontWeight: 700 }}>{label}</p>
          <p style={{ color: '#2d2d2d', fontWeight: 700, fontSize: 18 }}>{payload[0].value} kg</p>
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
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your training overview and progress</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Dumbbell size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Total Logs</span>
          </div>
          <div className="stat-value">{stats.totalLogs}</div>
        </div>
        <div className="stat-card" style={{ animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Calendar size={18} style={{ color: 'var(--accent-purple)' }} />
            <span className="stat-label" style={{ margin: 0 }}>This Week</span>
          </div>
          <div className="stat-value">{stats.thisWeekLogs}</div>
        </div>
        <div className="stat-card" style={{ animationDelay: '0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-green)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Exercises</span>
          </div>
          <div className="stat-value">{stats.uniqueExercises}</div>
        </div>
        <div className="stat-card" style={{ animationDelay: '0.4s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Award size={18} style={{ color: 'var(--accent-orange)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Best Lift</span>
          </div>
          <div className="stat-value">{stats.bestLift ? `${stats.bestLift.weight}kg` : '—'}</div>
          {stats.bestLift && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {stats.bestLift.name}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {recentLog && (
        <div className="card animate-fade-in-up" style={{ marginBottom: 32, animationDelay: '0.5s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: 'linear-gradient(145deg, rgba(14, 14, 22, 0.9), rgba(20, 20, 30, 0.9))', borderLeft: '3px solid var(--accent-purple)' }}>
          <div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} style={{ color: 'var(--accent-purple)' }}/> Most Recent Community Log
            </h3>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              {recentLog.exerciseName} <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: 18 }}>• {recentLog.weight}kg</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 20 }}>
          {charts.map((chart, i) => (
            <div key={chart.exerciseName} className="paper-chart-container animate-fade-in-up" style={{ animationDelay: `${0.1 * (i + 1)}s`, padding: '24px 16px 16px' }}>
              <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: 'center', fontFamily: "'Kalam', cursive", color: '#2d2d2d', letterSpacing: 1 }}>
                {chart.exerciseName}
              </h3>
              <ResponsiveContainer width="100%" height={220} style={{ zIndex: 1, position: 'relative' }}>
                <LineChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#d4d4d4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#444', fontSize: 14, fontFamily: "'Kalam', cursive" }}
                    axisLine={{ stroke: '#2d2d2d', strokeWidth: 2 }}
                    tickLine={{ stroke: '#2d2d2d', strokeWidth: 2 }}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#444', fontSize: 14, fontFamily: "'Kalam', cursive" }}
                    axisLine={{ stroke: '#2d2d2d', strokeWidth: 2 }}
                    tickLine={{ stroke: '#2d2d2d', strokeWidth: 2 }}
                    unit="kg"
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ccc', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#2d2d2d"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#ffffff', stroke: '#2d2d2d', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#ffffff', stroke: '#2d2d2d', strokeWidth: 3 }}
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
