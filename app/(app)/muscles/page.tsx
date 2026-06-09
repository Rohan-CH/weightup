'use client';

import { useState, useEffect } from 'react';
import Model from 'react-body-highlighter';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Dumbbell, Plus, Zap } from 'lucide-react';

import { MuscleKey, MUSCLE_META, HIGHLIGHTER_MAP, getMusclesForExercise, hexToRgba } from '@/lib/muscle-utils';

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
  exercises: { name: string; target_muscles: string[] | null } | null;
}

export default function MusclesPage() {
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MuscleKey | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [activeWeeks, setActiveWeeks] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
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
        .select('id, exercise_id, logged_at, weight_kg, reps, exercises(name, target_muscles)')
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
      const muscles = getMusclesForExercise(name, log.exercises?.target_muscles);
      muscles.forEach(m => { totals[m] = (totals[m] ?? 0) + 1; });
    });
    return totals;
  })();

  // Exercises worked this week
  const exerciseMap = (() => {
    const map: Record<string, { name: string; sets: number; muscles: MuscleKey[] }> = {};
    logs.forEach(log => {
      const name = log.exercises?.name ?? 'Unknown';
      const customMuscles = log.exercises?.target_muscles;
      if (!map[log.exercise_id]) {
        map[log.exercise_id] = { name, sets: 0, muscles: getMusclesForExercise(name, customMuscles) };
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
            {(() => {
              const keys = Object.keys(MUSCLE_META) as MuscleKey[];
              
              // Build per-slug data: each library slug gets exactly one entry
              // to avoid frequency accumulation when multiple MuscleKeys share a slug
              const slugColor: Record<string, string> = {};
              const slugName: Record<string, MuscleKey> = {};
              
              for (const k of keys) {
                const isSelected = selected === k;
                const sets = muscleWork[k] ?? 0;
                const baseColor = MUSCLE_META[k].color;
                const color = isSelected
                  ? hexToRgba(baseColor, 1)
                  : sets > 0
                    ? hexToRgba(baseColor, 0.55)
                    : theme === 'light'
                      ? 'rgba(0,0,0,0.06)'
                      : 'rgba(255,255,255,0.12)';
                
                for (const slug of HIGHLIGHTER_MAP[k]) {
                  const unworkedColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
                  // Higher priority wins: selected > worked > unworked
                  if (!slugColor[slug] || isSelected || (sets > 0 && slugColor[slug] === unworkedColor)) {
                    slugColor[slug] = color;
                    slugName[slug] = k;
                  }
                }
              }
              
              const slugs = Object.keys(slugColor);
              // Each slug gets frequency = index+1 → maps to highlightedColors[index]
              const data = slugs.map((slug, i) => ({
                name: slugName[slug],
                muscles: [slug] as any[],
                frequency: i + 1
              }));
              const highlightedColors = slugs.map(slug => slugColor[slug]);
              
              // Reverse-map for click handling
              const reverseMap: Record<string, MuscleKey> = {};
              for (const k of keys) {
                for (const slug of HIGHLIGHTER_MAP[k]) {
                  if (!reverseMap[slug]) reverseMap[slug] = k;
                }
              }
              
              const handleClick = (ex: any) => {
                const slug = ex.muscle as string;
                const k = reverseMap[slug];
                if (k) setSelected(s => s === k ? null : k);
              };
              
              return (
                <div className="muscles-diagrams">
                  <div className="muscles-diagram-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Model
                      data={data}
                      bodyColor="rgba(255,255,255,0.12)"
                      style={{ width: '100%', height: 'auto' }}
                      svgStyle={{ overflow: 'visible' }}
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
                      svgStyle={{ overflow: 'visible' }}
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
  const curr = new Date(month);
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
