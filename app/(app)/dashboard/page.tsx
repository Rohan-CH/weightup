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

const CHART_COLORS = ['#00f5ff', '#7c3aed', '#ec4899', '#10b981', '#f59e0b'];

export default function DashboardPage() {
  const [charts, setCharts] = useState<ExerciseChart[]>([]);
  const [stats, setStats] = useState<Stats>({ totalLogs: 0, uniqueExercises: 0, bestLift: null, thisWeekLogs: 0 });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
            <div key={chart.exerciseName} className="card animate-fade-in-up" style={{ animationDelay: `${0.1 * (i + 1)}s` }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: CHART_COLORS[i % CHART_COLORS.length],
                  display: 'inline-block'
                }} />
                {chart.exerciseName}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#55556a', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#55556a', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
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
