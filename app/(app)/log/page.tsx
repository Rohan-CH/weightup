'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Dumbbell, Search, TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Exercise {
  id: string;
  name: string;
}

interface WorkoutLog {
  id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
  exercises: { name: string };
}

interface ExerciseChart {
  exerciseId: string;
  exerciseName: string;
  data: { date: string; weight: number }[];
}

const CHART_COLORS = ['#00f5ff', '#7c3aed', '#ec4899', '#10b981', '#f59e0b'];

export default function LogWorkoutPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [showNewExercise, setShowNewExercise] = useState(false);
  
  // Chart related state
  const [chartsData, setChartsData] = useState<ExerciseChart[]>([]);
  const [selectedChartExerciseId, setSelectedChartExerciseId] = useState<string>('');
  
  const supabase = createClient();

  useEffect(() => {
    fetchExercises();
    fetchLogs();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = exercises.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredExercises(filtered);
    } else {
      setFilteredExercises(exercises);
    }
  }, [searchTerm, exercises]);

  const fetchExercises = async () => {
    const { data } = await supabase
      .from('exercises')
      .select('id, name')
      .order('name');
    if (data) setExercises(data);
  };

  const fetchLogs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data } = await supabase
      .from('workout_logs')
      .select('*, exercises(name)')
      .eq('user_id', user.id)
      .gte('logged_at', sevenDaysAgo.toISOString().split('T')[0])
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (data) setLogs(data as any);

    // Fetch all logs to build charts and find best lift
    const { data: allLogs } = await supabase
      .from('workout_logs')
      .select('*, exercises(name)')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: true });
      
    if (allLogs && allLogs.length > 0) {
      // Group by exercise
      const exerciseLogs: Record<string, { name: string; logs: any[] }> = {};
      let bestLiftWeight = -1;
      let bestLiftExerciseId = '';

      allLogs.forEach((log: any) => {
        const eid = log.exercise_id;
        if (!exerciseLogs[eid]) {
          exerciseLogs[eid] = { name: log.exercises?.name || 'Unknown', logs: [] };
        }
        exerciseLogs[eid].logs.push(log);
        
        if (log.weight_kg > bestLiftWeight) {
          bestLiftWeight = log.weight_kg;
          bestLiftExerciseId = eid;
        }
      });

      const charts: ExerciseChart[] = Object.entries(exerciseLogs).map(([eid, { name, logs }]) => {
        // Get max weight per day
        const dailyMax = logs.reduce((acc: Record<string, number>, l: any) => {
          const date = l.logged_at;
          if (!acc[date] || l.weight_kg > acc[date]) {
            acc[date] = l.weight_kg;
          }
          return acc;
        }, {});

        return {
          exerciseId: eid,
          exerciseName: name,
          data: Object.entries(dailyMax)
            .map(([date, weight]) => ({ date, weight: Number(weight) }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        };
      });

      setChartsData(charts);
      if (bestLiftExerciseId && !selectedChartExerciseId) {
        setSelectedChartExerciseId(bestLiftExerciseId);
      } else if (charts.length > 0 && !selectedChartExerciseId) {
        setSelectedChartExerciseId(charts[0].exerciseId);
      }
    }
    
    setLogLoading(false);
  };

  const handleAddExercise = async () => {
    if (!newExerciseName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('exercises')
      .insert({ name: newExerciseName.trim(), is_custom: true, created_by: user.id })
      .select()
      .single();

    if (error) {
      setError(error.message.includes('duplicate') ? 'This exercise already exists' : error.message);
      return;
    }

    if (data) {
      setExercises([...exercises, data]);
      setSelectedExercise(data.id);
      setSearchTerm(data.name);
      setShowNewExercise(false);
      setNewExerciseName('');
      setShowDropdown(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedExercise || !weight || !reps) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('workout_logs').insert({
      user_id: user.id,
      exercise_id: selectedExercise,
      weight_kg: parseFloat(weight),
      reps: parseInt(reps),
      logged_at: date,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Workout logged!');
      setWeight('');
      setReps('');
      fetchLogs();
      setTimeout(() => setSuccess(''), 3000);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('workout_logs').delete().eq('id', id);
    if (!error) {
      setLogs(logs.filter(l => l.id !== id));
    }
  };

  const selectExercise = (ex: Exercise) => {
    setSelectedExercise(ex.id);
    setSearchTerm(ex.name);
    setShowDropdown(false);
  };

  const groupedLogs = logs.reduce((acc: Record<string, WorkoutLog[]>, log) => {
    if (!acc[log.logged_at]) acc[log.logged_at] = [];
    acc[log.logged_at].push(log);
    return acc;
  }, {});

  const selectedChart = chartsData.find(c => c.exerciseId === selectedChartExerciseId);

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

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1>Log Workout</h1>
        <p>Track your exercises, weights, and reps</p>
      </div>

      {/* Log Form */}
      <div className="card" style={{ marginBottom: 32, maxWidth: 600, position: 'relative', zIndex: showDropdown ? 60 : 'auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="label">Exercise</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  setSelectedExercise('');
                }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>
            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                maxHeight: 200,
                overflowY: 'auto',
                zIndex: 50,
                marginTop: 4,
              }}>
                {filteredExercises.map(ex => (
                  <div
                    key={ex.id}
                    onClick={() => selectExercise(ex)}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      fontSize: 14,
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {ex.name}
                  </div>
                ))}
                {filteredExercises.length === 0 && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 14 }}>
                    No exercises found
                  </div>
                )}
                <div
                  onClick={() => { setShowNewExercise(true); setShowDropdown(false); }}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'var(--accent-cyan)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,245,255,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Plus size={14} /> Add new exercise
                </div>
              </div>
            )}
          </div>

          {showNewExercise && (
            <div className="form-group" style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="New exercise name"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn-primary" onClick={handleAddExercise} style={{ whiteSpace: 'nowrap' }}>
                <Plus size={16} /> Add
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Weight (kg)</label>
              <input
                className="input"
                type="number"
                step="0.5"
                min="0"
                placeholder="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Reps</label>
              <input
                className="input"
                type="number"
                min="1"
                placeholder="0"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          {success && <p className="success-text" style={{ marginBottom: 12 }}>{success}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : <><Dumbbell size={16} /> Log Workout</>}
          </button>
        </form>
      </div>

      {chartsData.length > 0 && (
        <div className="card animate-fade-in-up" style={{ marginBottom: 32, animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} style={{ color: 'var(--accent-cyan)' }} /> 
              Progress Chart
            </h3>
            <select
              className="select"
              style={{ width: 'auto', padding: '6px 12px', fontSize: 14 }}
              value={selectedChartExerciseId}
              onChange={(e) => setSelectedChartExerciseId(e.target.value)}
            >
              {chartsData.map((chart) => (
                <option key={chart.exerciseId} value={chart.exerciseId}>
                  {chart.exerciseName}
                </option>
              ))}
            </select>
          </div>
          
          {selectedChart && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={selectedChart.data}>
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
                  stroke="#00f5ff"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#00f5ff" }}
                  activeDot={{ r: 5, stroke: "#00f5ff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Recent Logs */}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Recent Logs (7 days)</h2>

      {logLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : Object.keys(groupedLogs).length === 0 ? (
        <div className="card empty-state">
          <Dumbbell size={48} />
          <h3>No logs yet</h3>
          <p>Log your first workout above to start tracking!</p>
        </div>
      ) : (
        Object.entries(groupedLogs).map(([date, dateLogs]) => (
          <div key={date} style={{ marginBottom: 20 }} className="animate-fade-in">
            <h3 style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 8,
            }}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th>Weight</th>
                    <th>Reps</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {dateLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 500 }}>{log.exercises?.name}</td>
                      <td>
                        <span className="badge badge-cyan">{log.weight_kg} kg</span>
                      </td>
                      <td>
                        <span className="badge badge-purple">{log.reps} reps</span>
                      </td>
                      <td>
                        <button className="btn-danger" onClick={() => handleDelete(log.id)} style={{ padding: '6px 8px' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Click-away handler */}
      {showDropdown && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
