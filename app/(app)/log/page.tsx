'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Dumbbell, Search, TrendingUp, X, Layers, ArrowRight } from 'lucide-react';
import { MuscleKey, MUSCLE_META, getMusclesForExercise } from '@/lib/muscle-utils';
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
  target_muscles?: string[] | null;
}

interface WorkoutLog {
  id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
  exercises: { name: string; target_muscles?: string[] | null };
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
  const [sets, setSets] = useState([{ weight: '', reps: '' }]);
  const [restTimer, setRestTimer] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscles, setNewExerciseMuscles] = useState<MuscleKey[]>([]);
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [visibleLogsCount, setVisibleLogsCount] = useState(10);
  // emoji reactions left by circle members, keyed by log id
  const [reactions, setReactions] = useState<Record<string, { emoji: string; count: number }[]>>({});
  
  const [fatigueScores, setFatigueScores] = useState<Record<string, number>>({});
  
  // Split Execution state
  const [splitQueue, setSplitQueue] = useState<{ id: string; name: string }[]>([]);
  const [splitDayName, setSplitDayName] = useState('');
  
  // Chart related state
  const [chartsData, setChartsData] = useState<ExerciseChart[]>([]);
  const [chartSearch, setChartSearch] = useState('');
  const [visibleChartsCount, setVisibleChartsCount] = useState(4);

  const supabase = createClient();


  const fetchExercises = async () => {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, target_muscles')
      .order('name');
    if (data) setExercises(data);
  };

  const fetchLogs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('workout_logs')
      .select('*, exercises(name, target_muscles)')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (data) setLogs(data as any);

    // Fetch reactions circle members left on these logs
    if (data && data.length > 0) {
      const logIds = data.map((l: any) => l.id);
      const { data: rxData } = await supabase
        .from('reactions')
        .select('log_id, emoji')
        .in('log_id', logIds);
      if (rxData) {
        const grouped: Record<string, Record<string, number>> = {};
        rxData.forEach((r: any) => {
          grouped[r.log_id] = grouped[r.log_id] || {};
          grouped[r.log_id][r.emoji] = (grouped[r.log_id][r.emoji] || 0) + 1;
        });
        const out: Record<string, { emoji: string; count: number }[]> = {};
        Object.entries(grouped).forEach(([logId, emojis]) => {
          out[logId] = Object.entries(emojis).map(([emoji, count]) => ({ emoji, count }));
        });
        setReactions(out);
      }
    }

    // Fetch all logs to build charts and find best lift
    const { data: allLogs } = await supabase
      .from('workout_logs')
      .select('*, exercises(name, target_muscles)')
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

      // Show the heaviest-lift exercise first, then alphabetical.
      charts.sort((a, b) => {
        if (a.exerciseId === bestLiftExerciseId) return -1;
        if (b.exerciseId === bestLiftExerciseId) return 1;
        return a.exerciseName.localeCompare(b.exerciseName);
      });

      setChartsData(charts);

      // Compute fatigue scores for warnings
      const allMuscleKeys = Object.keys(MUSCLE_META) as MuscleKey[];
      const fatigueScoresObj: Record<string, number> = {};
      const logsByMuscle: Record<string, any[]> = {};
      allMuscleKeys.forEach(m => { fatigueScoresObj[m] = 0; logsByMuscle[m] = []; });

      allLogs.forEach((log: any) => {
        const muscles = getMusclesForExercise(log.exercises?.name || '', log.exercises?.target_muscles);
        muscles.forEach(m => {
          if (logsByMuscle[m]) logsByMuscle[m].push(log);
        });
      });

      const nowTime = new Date();
      allMuscleKeys.forEach(m => {
        const mLogs = logsByMuscle[m];
        if (mLogs.length === 0) return;

        let fatigue = 0;
        let prevTime: Date | null = null;

        for (const log of mLogs) {
          const logTime = new Date(log.created_at || (log.logged_at + 'T12:00:00Z'));
          if (prevTime !== null) {
            const hours = (logTime.getTime() - prevTime.getTime()) / 3600000;
            if (hours > 0) fatigue = fatigue * Math.pow(0.5, hours / 24);
          }
          fatigue = Math.min(100, fatigue + 25);
          prevTime = logTime;
        }

        if (prevTime !== null) {
          const hours = (nowTime.getTime() - prevTime.getTime()) / 3600000;
          if (hours > 0) fatigue = fatigue * Math.pow(0.5, hours / 24);
        }
        fatigueScoresObj[m] = Math.round(fatigue);
      });
      setFatigueScores(fatigueScoresObj);
    }
    
    setLogLoading(false);
  };

  useEffect(() => {
    fetchExercises();
    fetchLogs();

    // Check for split execution
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const splitDayId = params.get('split_day_id');
      if (splitDayId) {
        loadSplitQueue(splitDayId);
      }
    }
  }, []);

  const loadSplitQueue = async (splitDayId: string) => {
    const { data: dayData } = await supabase.from('split_days').select('name').eq('id', splitDayId).single();
    if (dayData) setSplitDayName(dayData.name);

    const { data } = await supabase
      .from('split_day_exercises')
      .select('exercise_id, exercises(name)')
      .eq('split_day_id', splitDayId)
      .order('exercise_order', { ascending: true });
      
    if (data && data.length > 0) {
      const queue = data.map((d: any) => ({
        id: d.exercise_id,
        name: d.exercises?.name || 'Unknown',
      }));
      setSplitQueue(queue);
      setSelectedExercise(queue[0].id);
      setSearchTerm(queue[0].name);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [restTimer]);

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


  const handleAddExercise = async () => {
    if (!newExerciseName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name: newExerciseName.trim(),
        is_custom: true,
        created_by: user.id,
        target_muscles: newExerciseMuscles,
      })
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
      setNewExerciseMuscles([]);
      setShowDropdown(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validSets = sets.filter(s => s.weight.trim() !== '' && s.reps.trim() !== '');

    if (!selectedExercise || validSets.length === 0) {
      setError('Please select an exercise and fill at least one valid set');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = validSets.map(s => ({
      user_id: user.id,
      exercise_id: selectedExercise,
      weight_kg: parseFloat(s.weight),
      reps: parseInt(s.reps),
      logged_at: date,
    }));

    const { error } = await supabase.from('workout_logs').insert(payload);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(`Logged ${validSets.length} set(s)!`);
      
      // Auto-advance if in split queue
      if (splitQueue.length > 1 && splitQueue[0].id === selectedExercise) {
        const nextQueue = splitQueue.slice(1);
        setSplitQueue(nextQueue);
        setSelectedExercise(nextQueue[0].id);
        setSearchTerm(nextQueue[0].name);
        setSets([{ weight: '', reps: '' }]); // reset sets for next exercise
      } else if (splitQueue.length === 1 && splitQueue[0].id === selectedExercise) {
        setSplitQueue([]); // finished the split!
        setSplitDayName('');
        setSets([{ weight: '', reps: '' }]);
      } else {
        // Keep one empty set, or carry over last weight
        const lastSet = validSets[validSets.length - 1];
        setSets([{ weight: lastSet ? lastSet.weight : '', reps: '' }]);
      }
      
      // Start 90s rest timer
      setRestTimer(90);
      
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

  const displayedLogs = logs.slice(0, visibleLogsCount);
  const groupedLogs = displayedLogs.reduce((acc: Record<string, WorkoutLog[]>, log) => {
    if (!acc[log.logged_at]) acc[log.logged_at] = [];
    acc[log.logged_at].push(log);
    return acc;
  }, {});

  const filteredCharts = chartsData.filter(c =>
    c.exerciseName.toLowerCase().includes(chartSearch.toLowerCase())
  );
  const visibleCharts = filteredCharts.slice(0, visibleChartsCount);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
          <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{payload[0].value} kg</p>
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

      {/* Split Execution Banner */}
      {splitQueue.length > 0 && (
        <div style={{ marginBottom: 16, background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.3)', padding: '12px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--accent-purple)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Layers size={12} />
              Executing Split Day
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>
              {splitDayName || 'Loading...'}
            </div>
          </div>
          {splitQueue.length > 1 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px', minHeight: 0, background: 'rgba(255,255,255,0.05)', border: 'none' }}
                onClick={() => {
                  const nextQueue = splitQueue.slice(1);
                  setSplitQueue(nextQueue);
                  setSelectedExercise(nextQueue[0].id);
                  setSearchTerm(nextQueue[0].name);
                }}
              >
                Skip Exercise
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: 12, padding: '6px 12px', minHeight: 0, gap: 4, background: 'linear-gradient(135deg, var(--accent-purple), #9333ea)' }}
                onClick={() => {
                  const nextQueue = splitQueue.slice(1);
                  setSplitQueue(nextQueue);
                  setSelectedExercise(nextQueue[0].id);
                  setSearchTerm(nextQueue[0].name);
                }}
              >
                Next Exercise
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px', minHeight: 0, background: 'rgba(255,255,255,0.05)', border: 'none' }}
                onClick={() => {
                  setSplitQueue([]);
                  setSplitDayName('');
                }}
              >
                Skip Exercise
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px', minHeight: 0 }}
                onClick={() => {
                  setSplitQueue([]);
                  setSplitDayName('');
                }}
              >
                Finish Split
              </button>
            </div>
          )}
        </div>
      )}

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
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
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
            <div style={{
              border: '1px solid rgba(0, 245, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.02)',
              padding: 16,
              marginBottom: 16,
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} style={{ color: 'var(--accent-cyan)' }} />
                Create Custom Exercise
              </h4>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="label" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Exercise Name</label>
                <input
                  className="input"
                  placeholder="e.g. Incline DB Hammer Press"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="label" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Target Muscles (Select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto', padding: '2px 0' }}>
                  {(Object.keys(MUSCLE_META) as MuscleKey[]).map(key => {
                    const selected = newExerciseMuscles.includes(key);
                    const meta = MUSCLE_META[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setNewExerciseMuscles(prev =>
                            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                          );
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: selected ? `${meta.color}20` : 'rgba(255,255,255,0.03)',
                          color: selected ? meta.color : 'var(--text-muted)',
                          border: `1px solid ${selected ? meta.color : 'rgba(255,255,255,0.08)'}`,
                          boxShadow: selected ? `0 0 6px ${meta.color}15` : 'none',
                        }}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowNewExercise(false);
                    setNewExerciseName('');
                    setNewExerciseMuscles([]);
                  }}
                  style={{ padding: '6px 12px', fontSize: 12, height: 'auto', minHeight: 0 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAddExercise}
                  disabled={!newExerciseName.trim()}
                  style={{ padding: '6px 12px', fontSize: 12, height: 'auto', minHeight: 0, gap: 4 }}
                >
                  <Plus size={14} /> Add Exercise
                </button>
              </div>
            </div>
          )}

          {/* Auto-Regulation Warning removed due to inaccuracy during active workouts */}

          {/* Rest Timer */}
          {restTimer > 0 && (
            <div style={{ padding: 12, marginBottom: 16, background: 'rgba(0,245,255,0.1)', border: '1px solid var(--accent-cyan)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⏱️</span>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: 16 }}>Rest Timer: {Math.floor(restTimer / 60)}:{(restTimer % 60).toString().padStart(2, '0')}</span>
              <button type="button" onClick={() => setRestTimer(0)} style={{ background: 'rgba(0,245,255,0.2)', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', marginLeft: 'auto', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Skip Rest</button>
            </div>
          )}

          {/* Set Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 40px', gap: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, padding: '0 4px' }}>
              <div style={{ textAlign: 'center' }}>SET</div>
              <div>KG</div>
              <div>REPS</div>
              <div></div>
            </div>
            
            {sets.map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 40px', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 600, background: 'rgba(255,255,255,0.03)', height: '40px', borderRadius: 4 }}>
                  {idx + 1}
                </div>
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="0"
                  value={s.weight}
                  onChange={(e) => {
                    const newSets = [...sets];
                    newSets[idx].weight = e.target.value;
                    setSets(newSets);
                  }}
                  style={{ height: '40px', padding: '0 12px' }}
                />
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="0"
                  value={s.reps}
                  onChange={(e) => {
                    const newSets = [...sets];
                    newSets[idx].reps = e.target.value;
                    setSets(newSets);
                  }}
                  style={{ height: '40px', padding: '0 12px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (sets.length > 1) {
                      setSets(sets.filter((_, i) => i !== idx));
                    } else {
                      setSets([{ weight: '', reps: '' }]);
                    }
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40px' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const lastSet = sets[sets.length - 1];
                setSets([...sets, { weight: lastSet ? lastSet.weight : '', reps: '' }]);
              }}
              style={{ padding: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4, transition: 'background 0.2s' }}
            >
              <Plus size={14} /> Add Set
            </button>
          </div>

          <div className="form-group" style={{ maxWidth: 200 }}>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          {success && <p className="success-text" style={{ marginBottom: 12 }}>{success}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : <><Dumbbell size={16} /> Log Workout</>}
          </button>
        </form>
      </div>

      {chartsData.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={20} style={{ color: 'var(--accent-cyan)' }} />
              Progress Charts
            </h2>
            <div style={{ position: 'relative', minWidth: 220 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="Search exercises..."
                value={chartSearch}
                onChange={(e) => { setChartSearch(e.target.value); setVisibleChartsCount(4); }}
              />
            </div>
          </div>

          {filteredCharts.length === 0 ? (
            <div className="card empty-state">
              <Search size={48} />
              <h3>No matching exercises</h3>
              <p>No logged exercises match &ldquo;{chartSearch}&rdquo;.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 20 }}>
              {visibleCharts.map((chart, i) => (
                <div key={chart.exerciseId} className="card">
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], display: 'inline-block' }} />
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

          {filteredCharts.length > visibleChartsCount && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setVisibleChartsCount(prev => prev + 4)}
                style={{
                  padding: '10px 24px', fontSize: 14, borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
              >
                Show More Charts ({filteredCharts.length - visibleChartsCount} more)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recent Logs */}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>All Logs</h2>

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
          <div key={date} style={{ marginBottom: 20 }}>
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
                      <td style={{ overflow: 'visible' }}>
                        <span style={{ position: 'relative', display: 'inline-block' }}>
                          <span className="weight-orbit-host">
                            <span className="badge badge-cyan">{log.weight_kg} kg</span>
                            {(() => {
                              const distinct = (reactions[log.id] || []).map((r) => r.emoji);
                              if (distinct.length === 0) return null;
                              return (
                                <span className="orbit" aria-hidden="true">
                                  {distinct.map((emoji, i) => {
                                    const angle = (360 / distinct.length) * i;
                                    return (
                                      <span
                                        key={emoji}
                                        className="orbit-slot"
                                        style={{ transform: `rotate(${angle}deg) translateX(34px) rotate(${-angle}deg)` }}
                                      >
                                        <span className="orbit-emoji">{emoji}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              );
                            })()}
                          </span>
                        </span>
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

      {!logLoading && logs.length > visibleLogsCount && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, marginBottom: 32 }}>
          <button 
            type="button"
            onClick={() => setVisibleLogsCount(prev => prev + 10)}
            style={{ 
              padding: '10px 24px', 
              fontSize: 14, 
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-card-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-input)';
            }}
          >
            Show More
          </button>
        </div>
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
