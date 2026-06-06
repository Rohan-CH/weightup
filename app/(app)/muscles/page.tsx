'use client';

import { useState, useEffect } from 'react';
import Model from 'react-body-highlighter';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Dumbbell, Plus, Zap } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   MUSCLE DEFINITIONS
───────────────────────────────────────────────────────────── */
type MuscleKey =
  | 'chest' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'traps' | 'lats' | 'upper_back' | 'lower_back'
  | 'biceps' | 'triceps' | 'forearms' | 'abs'
  | 'glutes' | 'quads' | 'hamstrings' | 'calves';

const MUSCLE_META: Record<MuscleKey, { label: string; color: string; view: 'front' | 'back' | 'both' }> = {
  chest:       { label: 'Chest',        color: '#00f5ff', view: 'front' },
  front_delts: { label: 'Front Delts',  color: '#7c3aed', view: 'front' },
  side_delts:  { label: 'Side Delts',   color: '#a855f7', view: 'front' },
  rear_delts:  { label: 'Rear Delts',   color: '#7c3aed', view: 'back'  },
  traps:       { label: 'Traps',        color: '#00f5ff', view: 'back'  },
  lats:        { label: 'Lats',         color: '#38bdf8', view: 'back'  },
  upper_back:  { label: 'Upper Back',   color: '#0ea5e9', view: 'back'  },
  lower_back:  { label: 'Lower Back',   color: '#f59e0b', view: 'back'  },
  biceps:      { label: 'Biceps',       color: '#10b981', view: 'front' },
  triceps:     { label: 'Triceps',      color: '#f97316', view: 'both'  },
  forearms:    { label: 'Forearms',     color: '#34d399', view: 'both'  },
  abs:         { label: 'Abs',          color: '#ec4899', view: 'front' },
  glutes:      { label: 'Glutes',       color: '#a855f7', view: 'back'  },
  quads:       { label: 'Quads',        color: '#10b981', view: 'front' },
  hamstrings:  { label: 'Hamstrings',   color: '#f59e0b', view: 'back'  },
  calves:      { label: 'Calves',       color: '#ec4899', view: 'both'  },
};


/* ─────────────────────────────────────────────────────────────
   BODY HIGHLIGHTER MAPPING
───────────────────────────────────────────────────────────── */
const HIGHLIGHTER_MAP: Record<MuscleKey, string[]> = {
  chest: ['chest'],
  front_delts: ['front-deltoids'],
  side_delts: ['front-deltoids', 'back-deltoids'],
  rear_delts: ['back-deltoids'],
  traps: ['trapezius'],
  lats: ['upper-back'],
  upper_back: ['upper-back'],
  lower_back: ['lower-back'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abs: ['abs'],
  glutes: ['gluteal'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  calves: ['calves'],
};

// Convert hex to rgba to support opacity
function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.length === 3 ? h.charAt(0)+h.charAt(0) : h.substring(0,2), 16);
  const g = parseInt(h.length === 3 ? h.charAt(1)+h.charAt(1) : h.substring(2,4), 16);
  const b = parseInt(h.length === 3 ? h.charAt(2)+h.charAt(2) : h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────────────────────────────────────────────────────────────
   EXERCISE → MUSCLE MAPPING
───────────────────────────────────────────────────────────── */
function getMusclesForExercise(name: string): MuscleKey[] {
  const n = name.toLowerCase();
  const m = new Set<MuscleKey>();

  // ── Chest ──
  if (n.includes('bench') || n.includes('chest press')) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }
  if (n.includes('fly') || n.includes('flye') || n.includes('pec deck') || n.includes('cable cross')) m.add('chest');
  if (n.includes('push up') || n.includes('push-up') || n.includes('pushup')) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }
  if (n.includes('dip') && !n.includes('hip')) { m.add('chest'); m.add('triceps'); }
  if (n.includes('incline') && !n.includes('row')) { m.add('chest'); m.add('front_delts'); m.add('triceps'); }
  if (n.includes('decline')) { m.add('chest'); m.add('triceps'); }

  // ── Back ──
  if (n.includes('deadlift')) { m.add('hamstrings'); m.add('glutes'); m.add('lower_back'); m.add('traps'); m.add('lats'); }
  if (n.includes('rdl') || n.includes('romanian') || n.includes('stiff')) { m.add('hamstrings'); m.add('glutes'); m.add('lower_back'); }
  if (n.includes('row') && !n.includes('cable cross')) { m.add('lats'); m.add('upper_back'); m.add('biceps'); m.add('rear_delts'); }
  if (n.includes('pull up') || n.includes('pull-up') || n.includes('pullup') || n.includes('chin up') || n.includes('chin-up')) { m.add('lats'); m.add('biceps'); m.add('upper_back'); }
  if (n.includes('pulldown') || n.includes('pull-down') || n.includes('lat pull')) { m.add('lats'); m.add('biceps'); }
  if (n.includes('shrug')) m.add('traps');
  if (n.includes('face pull')) { m.add('rear_delts'); m.add('traps'); }
  if (n.includes('back extension') || n.includes('hyperextension') || n.includes('good morning')) { m.add('lower_back'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('seated cable row') || n.includes('cable row')) { m.add('lats'); m.add('upper_back'); m.add('biceps'); }

  // ── Shoulders ──
  const isShoulderPress = (n.includes('press') && (n.includes('shoulder') || n.includes('overhead') || n.includes('ohp') || n.includes('military') || n.includes('arnold') || n.includes('push press')));
  if (isShoulderPress) { m.add('front_delts'); m.add('side_delts'); m.add('triceps'); }
  if (n.includes('lateral raise') || n.includes('side raise') || n.includes('db lateral') || n.includes('cable lateral')) m.add('side_delts');
  if (n.includes('front raise')) m.add('front_delts');
  if (n.includes('reverse fly') || n.includes('reverse flye') || n.includes('rear delt fly') || n.includes('face pull')) m.add('rear_delts');
  if (n.includes('upright row')) { m.add('side_delts'); m.add('traps'); m.add('biceps'); }

  // ── Biceps ──
  if (n.includes('curl') && !n.includes('leg curl') && !n.includes('hamstring')) { m.add('biceps'); if (n.includes('hammer') || n.includes('reverse')) m.add('forearms'); }
  if (n.includes('bicep') || n.includes('biceps')) m.add('biceps');
  if (n.includes('preacher')) m.add('biceps');

  // ── Triceps ──
  if (n.includes('tricep') || n.includes('triceps') || n.includes('skull') || n.includes('pushdown') || n.includes('kickback') || n.includes('overhead extension') || n.includes('close grip')) m.add('triceps');
  if (n.includes('extension') && (n.includes('tricep') || n.includes('arm') || n.includes('cable'))) m.add('triceps');

  // ── Forearms ──
  if (n.includes('forearm') || n.includes('wrist curl') || n.includes('reverse curl')) m.add('forearms');

  // ── Abs / Core ──
  if (n.includes('crunch') || n.includes('sit up') || n.includes('situp') || n.includes('ab ') || n.includes('abs') || n.includes('core') || n.includes('hollow') || n.includes('l-sit') || n.includes('dragon flag')) m.add('abs');
  if (n.includes('plank')) { m.add('abs'); m.add('lower_back'); }
  if (n.includes('russian twist') || n.includes('woodchop') || n.includes('pallof') || n.includes('cable crunch') || n.includes('hanging leg') || n.includes('leg raise')) m.add('abs');

  // ── Legs ──
  if (n.includes('squat') || n.includes('hack squat') || n.includes('front squat') || n.includes('goblet squat')) { m.add('quads'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('leg press')) { m.add('quads'); m.add('glutes'); }
  if (n.includes('lunge') || n.includes('step up') || n.includes('step-up') || n.includes('split squat') || n.includes('bulgarian')) { m.add('quads'); m.add('glutes'); m.add('hamstrings'); }
  if (n.includes('leg extension')) m.add('quads');
  if (n.includes('leg curl') || n.includes('hamstring curl') || n.includes('nordic')) m.add('hamstrings');
  if (n.includes('hip thrust') || n.includes('glute bridge') || n.includes('hip hinge')) { m.add('glutes'); m.add('hamstrings'); }
  if ((n.includes('glute') && !n.includes('bridge')) || n.includes('donkey kick') || n.includes('cable kickback')) m.add('glutes');
  if (n.includes('calf') || n.includes('calves') || n.includes('standing calf') || n.includes('seated calf')) m.add('calves');
  if (n.includes('abductor') || n.includes('adductor')) m.add('quads');

  // Fallback: if "press" with no muscles yet → assume chest press
  if (n.includes('press') && m.size === 0) { m.add('chest'); m.add('triceps'); m.add('front_delts'); }

  return Array.from(m);
}

/* ─────────────────────────────────────────────────────────────
   INTENSITY HELPERS
───────────────────────────────────────────────────────────── */
function intensityOpacity(sets: number): number {
  if (sets === 0) return 0;
  if (sets <= 2) return 0.28;
  if (sets <= 5) return 0.52;
  if (sets <= 9) return 0.76;
  return 1.0;
}

function intensityLabel(sets: number): string {
  if (sets === 0) return 'Rest';
  if (sets <= 2) return 'Light';
  if (sets <= 5) return 'Moderate';
  if (sets <= 9) return 'High';
  return 'Intense';
}

/* ─────────────────────────────────────────────────────────────
   BODY SVG COMPONENTS
───────────────────────────────────────────────────────────── */
interface BodyProps {
  worked: Partial<Record<MuscleKey, number>>;
  selected: MuscleKey | null;
  onSelect: (m: MuscleKey | null) => void;
}



/* ─────────────────────────────────────────────────────────────
   WEEK HELPERS
───────────────────────────────────────────────────────────── */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // Mon as first day
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

/* ─────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────── */
interface WorkoutLog {
  id: string;
  exercise_id: string;
  logged_at: string;
  weight_kg: number;
  reps: number | null;
  sets: number | null;
  exercises: { name: string } | null;
}

export default function MusclesPage() {
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MuscleKey | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [activeWeeks, setActiveWeeks] = useState<Set<string>>(new Set());
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchActiveWeeks() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('workout_logs').select('logged_at').eq('user_id', user.id);
      if (data) {
        const weeks = new Set<string>();
        data.forEach((d: any) => {
          const datePart = d.logged_at.split('T')[0];
          const ws = getWeekStart(new Date(datePart + 'T00:00:00'));
          weeks.add(dayStr(ws));
        });
        setActiveWeeks(weeks);
      }
    }
    fetchActiveWeeks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('workout_logs')
        .select('id, exercise_id, logged_at, weight_kg, reps, exercises(name)')
        .eq('user_id', user.id)
        .gte('logged_at', dayStr(weekStart))
        .lte('logged_at', dayStr(weekEnd) + 'T23:59:59.999Z')
        .order('logged_at', { ascending: true });

      setLogs((data ?? []) as WorkoutLog[]);
      setLoading(false);
    };
    fetch();
  }, [weekStart]);

  // Compute sets per muscle group
  const muscleWork = (() => {
    const totals: Partial<Record<MuscleKey, number>> = {};
    logs.forEach(log => {
      const name = log.exercises?.name ?? '';
      const muscles = getMusclesForExercise(name);
      muscles.forEach(m => { totals[m] = (totals[m] ?? 0) + 1; });
    });
    return totals;
  })();

  // Exercises worked this week
  const exerciseMap = (() => {
    const map: Record<string, { name: string; sets: number; muscles: MuscleKey[] }> = {};
    logs.forEach(log => {
      const name = log.exercises?.name ?? 'Unknown';
      if (!map[log.exercise_id]) {
        map[log.exercise_id] = { name, sets: 0, muscles: getMusclesForExercise(name) };
      }
      map[log.exercise_id].sets++;
    });
    return Object.values(map).sort((a, b) => b.sets - a.sets);
  })();

  const workedMuscles = Object.entries(muscleWork)
    .filter(([, sets]) => sets > 0)
    .sort(([, a], [, b]) => b - a) as [MuscleKey, number][];

  const selectedExercises = selected
    ? exerciseMap.filter(e => e.muscles.includes(selected))
    : [];

  const isCurrentWeek = dayStr(weekStart) === dayStr(getWeekStart(new Date()));

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={26} style={{ color: 'var(--accent-cyan)' }} />
            Muscles Worked
          </h1>
          <p>See which muscle groups you trained this week</p>
        </div>
        <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => router.push('/log')}>
          <Plus size={15} /> Log Workout
        </button>
      </div>

      {/* Week Navigation */}
      <div className="muscles-week-nav">
        <button className="muscles-week-btn" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ position: 'relative' }}>
          <button 
            className="muscles-week-label" 
            style={{ width: '100%', cursor: 'pointer', textAlign: 'left', display: 'flex' }}
            onClick={() => setShowCalendar(!showCalendar)}
          >
            <Calendar size={14} style={{ flexShrink: 0 }} />
            <span>{formatWeekRange(weekStart)}</span>
            {isCurrentWeek && <span className="muscles-week-badge">This Week</span>}
          </button>
          
          {showCalendar && (
            <WeekCalendar 
              weekStart={weekStart} 
              setWeekStart={(d: Date) => { setWeekStart(d); setShowCalendar(false); }} 
              activeWeeks={activeWeeks} 
              onClose={() => setShowCalendar(false)} 
            />
          )}
        </div>
        <button
          className="muscles-week-btn"
          onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
          disabled={isCurrentWeek}
          style={{ opacity: isCurrentWeek ? 0.35 : 1 }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card empty-state">
          <Dumbbell size={48} />
          <h3>No workouts this week</h3>
          <p>Log a workout to see your muscle map come to life.</p>
          <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => router.push('/log')}>
            <Plus size={15} /> Log Workout
          </button>
        </div>
      ) : (
        <>
          {/* Body diagram + muscle detail panel */}
          <div className="muscles-layout">
            {/* SVG diagrams */}
            {(() => {
              // Only pass muscles that were actually worked (sets > 0) or selected
              const keys = Object.keys(MUSCLE_META) as MuscleKey[];
              const workedKeys = keys.filter(k => (muscleWork[k] ?? 0) > 0 || selected === k);
              
              // Build data array - only for worked/selected muscles
              // Each entry gets frequency=1 so it maps to highlightedColors[0]
              const data = workedKeys.map(k => ({
                name: k,
                muscles: HIGHLIGHTER_MAP[k] as any[],
                frequency: 1
              }));
              
              // Build a single color array matching the data entries
              const highlightedColors = workedKeys.map(k => {
                const isSelected = selected === k;
                const baseColor = MUSCLE_META[k].color;
                return hexToRgba(baseColor, isSelected ? 1 : 0.55);
              });
              
              const handleClick = (ex: any) => {
                if (ex.data && ex.data.exercises && ex.data.exercises.length > 0) {
                  const k = ex.data.exercises[0] as MuscleKey;
                  setSelected(s => s === k ? null : k);
                }
              };
              
              return (
                <div className="muscles-diagrams">
                  <div className="muscles-diagram-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Model
                      data={data}
                      bodyColor="rgba(255,255,255,0.12)"
                      style={{ width: '100%', height: 'auto' }}
                      highlightedColors={highlightedColors}
                      onClick={handleClick}
                      type="anterior"
                    />
                    <div className="text-center mt-2 text-[rgba(255,255,255,0.2)] font-['Inter',sans-serif] tracking-[4px] text-lg">
                      FRONT
                    </div>
                  </div>
                  <div className="muscles-diagram-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Model
                      data={data}
                      bodyColor="rgba(255,255,255,0.12)"
                      style={{ width: '100%', height: 'auto' }}
                      highlightedColors={highlightedColors}
                      onClick={handleClick}
                      type="posterior"
                    />
                    <div className="text-center mt-2 text-[rgba(255,255,255,0.2)] font-['Inter',sans-serif] tracking-[4px] text-lg">
                      BACK
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Side panel: legend + detail */}
            <div className="muscles-side">
              {/* Intensity legend */}
              <div className="card muscles-legend">
                <div className="muscles-legend-title">Intensity</div>
                <div className="muscles-legend-row"><span className="muscles-legend-swatch" style={{ background: 'rgba(255,255,255,0.08)' }} />Rest</div>
                <div className="muscles-legend-row"><span className="muscles-legend-swatch" style={{ background: 'rgba(0,245,255,0.28)' }} />Light (1–2 sets)</div>
                <div className="muscles-legend-row"><span className="muscles-legend-swatch" style={{ background: 'rgba(0,245,255,0.55)' }} />Moderate (3–5)</div>
                <div className="muscles-legend-row"><span className="muscles-legend-swatch" style={{ background: 'rgba(0,245,255,0.8)' }} />High (6–9)</div>
                <div className="muscles-legend-row">
                  <span className="muscles-legend-swatch" style={{ background: '#00f5ff', boxShadow: '0 0 6px #00f5ff' }} />
                  Intense (10+)
                </div>
              </div>

              {/* Selected muscle detail */}
              {selected && (
                <div className="card muscles-detail animate-scale-in">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: MUSCLE_META[selected].color, display: 'inline-block', boxShadow: `0 0 6px ${MUSCLE_META[selected].color}` }} />
                      <strong style={{ fontSize: 15 }}>{MUSCLE_META[selected].label}</strong>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: MUSCLE_META[selected].color, marginBottom: 4 }}>
                    {muscleWork[selected] ?? 0} sets
                  </div>
                  <div className="stat-delta neutral" style={{ marginTop: 0, marginBottom: 14 }}>
                    {intensityLabel(muscleWork[selected] ?? 0)} volume this week
                  </div>
                  {selectedExercises.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Exercises</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedExercises.map(ex => (
                          <div key={ex.name} className="muscles-detail-exercise">
                            <span>{ex.name}</span>
                            <span style={{ color: MUSCLE_META[selected].color, fontWeight: 700, fontSize: 13 }}>{ex.sets} sets</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {!selected && (
                <div className="card muscles-hint">
                  <Zap size={20} style={{ color: 'var(--accent-cyan)', marginBottom: 8 }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    Tap a highlighted muscle on the diagram to see exercise details.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Worked muscles grid */}
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Muscles Worked — {workedMuscles.length} groups
            </h2>
            <div className="muscles-cards">
              {workedMuscles.map(([key, sets]) => {
                const meta = MUSCLE_META[key];
                const opacity = intensityOpacity(sets);
                return (
                  <button
                    key={key}
                    className={`muscles-card ${selected === key ? 'active' : ''}`}
                    style={{ '--muscle-color': meta.color } as React.CSSProperties}
                    onClick={() => setSelected(s => s === key ? null : key)}
                  >
                    <div className="muscles-card-glow" style={{ background: meta.color, opacity: opacity * 0.12 }} />
                    <div className="muscles-card-indicator" style={{ background: meta.color, opacity }} />
                    <div className="muscles-card-label">{meta.label}</div>
                    <div className="muscles-card-count" style={{ color: meta.color }}>{sets}</div>
                    <div className="muscles-card-sub">{intensityLabel(sets)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exercise breakdown */}
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Exercise Breakdown — {exerciseMap.length} exercises
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {exerciseMap.map(ex => (
                <div key={ex.name} className="card muscles-exercise-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <Dumbbell size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {ex.muscles.map(m => (
                          <span
                            key={m}
                            className="muscles-muscle-tag"
                            style={{ background: `${MUSCLE_META[m].color}18`, color: MUSCLE_META[m].color, borderColor: `${MUSCLE_META[m].color}30` }}
                            onClick={e => { e.stopPropagation(); setSelected(s => s === m ? null : m); }}
                          >
                            {MUSCLE_META[m].label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>{ex.sets}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>sets</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function WeekCalendar({ weekStart, setWeekStart, activeWeeks, onClose }: any) {
  const [month, setMonth] = useState(() => {
    const d = new Date(weekStart);
    d.setDate(1);
    return d;
  });

  const nextMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const prevMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));

  const weeks = [];
  let curr = new Date(month);
  curr.setDate(1);
  while (curr.getDay() !== 1) curr.setDate(curr.getDate() - 1); // Rewind to Monday
  
  for (let i = 0; i < 6; i++) {
    const weekDays = [];
    for (let j = 0; j < 7; j++) {
      weekDays.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    weeks.push(weekDays);
  }

  return (
    <div className="card animate-fade-in" style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 50, width: 280, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button type="button" onClick={prevMonth} className="btn-secondary" style={{ padding: 4 }}><ChevronLeft size={16} /></button>
        <span style={{ fontWeight: 600 }}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={nextMonth} className="btn-secondary" style={{ padding: 4 }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {weeks.map((days, i) => {
          const wStart = days[0];
          const isSelected = dayStr(wStart) === dayStr(weekStart);
          const hasWorkout = activeWeeks.has(dayStr(wStart));
          
          return (
            <button 
              key={i} 
              type="button"
              onClick={() => setWeekStart(wStart)}
              style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', 
                textAlign: 'center', fontSize: 13, padding: '4px 0', 
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: isSelected ? 'var(--accent-purple)' : 'transparent',
                border: hasWorkout && !isSelected ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                color: 'var(--text-primary)'
              }}
              title={hasWorkout ? 'Workouts logged this week' : 'No workouts this week'}
            >
              {days.map(d => (
                <div key={d.toISOString()} style={{ opacity: d.getMonth() === month.getMonth() ? 1 : 0.3 }}>
                  {d.getDate()}
                </div>
              ))}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, border: '1px solid var(--accent-cyan)', display: 'inline-block' }} /> 
          Has logs
        </span>
      </div>
    </div>
  );
}
