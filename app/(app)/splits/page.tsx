'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MuscleKey, MUSCLE_META } from '@/lib/muscle-utils';
import {
  Layers, ChevronDown, ChevronUp, Plus, Dumbbell, Search,
  RefreshCw, X, Trash2, Sparkles, Calendar, Users, ArrowRight,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────── */
interface Split {
  id: string;
  name: string;
  description: string | null;
  frequency: string | null;
  best_for: string | null;
  advantage: string | null;
  is_default: boolean;
  created_by: string;
}

interface SplitDay {
  id: string;
  split_id: string;
  name: string;
  day_order: number;
  muscles: MuscleKey[];
}

interface SplitDayExercise {
  id: string;
  split_day_id: string;
  exercise_id: string;
  exercise_order: number;
  exercise_name: string;
}

interface CircleMember {
  user_id: string;
  username: string;
  avatar_url: string | null;
  split_id: string;
}

interface Exercise {
  id: string;
  name: string;
}

/* ─────────────────────────────────────────────────────────────
   CARD ACCENT COLOURS  (one per default split)
───────────────────────────────────────────────────────────── */
const SPLIT_ACCENTS: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': '#00f5ff',   // Full Body → cyan
  '22222222-2222-2222-2222-222222222222': '#7c3aed',   // Upper/Lower → purple
  '33333333-3333-3333-3333-333333333333': '#ec4899',   // PPL → pink
  '44444444-4444-4444-4444-444444444444': '#f59e0b',   // Bro → orange
};

function getAccent(id: string) {
  return SPLIT_ACCENTS[id] || '#00f5ff';
}

/* ─────────────────────────────────────────────────────────────
   CUSTOM BUILDER — day data shape
───────────────────────────────────────────────────────────── */
interface BuilderDay {
  name: string;
  muscles: MuscleKey[];
}

/* ─────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────── */
export default function SplitsPage() {
  const supabase = createClient();
  const router = useRouter();

  // View state: 'loading' | 'select' | 'detail'
  const [view, setView] = useState<'loading' | 'select' | 'detail'>('loading');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // All available splits (defaults + user customs)
  const [splits, setSplits] = useState<Split[]>([]);
  // Active user split
  const [activeSplit, setActiveSplit] = useState<Split | null>(null);
  // Days for the currently viewed split
  const [days, setDays] = useState<SplitDay[]>([]);
  // Exercises assigned per day
  const [dayExercises, setDayExercises] = useState<Record<string, SplitDayExercise[]>>({});
  // Expanded day cards
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  // Circle members on each split
  const [circleSplitMembers, setCircleSplitMembers] = useState<CircleMember[]>([]);

  // Exercise add UI
  const [addingToDayId, setAddingToDayId] = useState<string | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);

  // Custom split builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderName, setBuilderName] = useState('');
  const [builderDays, setBuilderDays] = useState<BuilderDay[]>([{ name: '', muscles: [] }]);
  const [builderSaving, setBuilderSaving] = useState(false);
  const [builderError, setBuilderError] = useState('');

  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* ─── Initial Data Load ─── */
  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    // 1. Fetch all splits user can see
    const { data: splitsData } = await supabase
      .from('splits')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    if (splitsData) setSplits(splitsData);

    // 2. Check active user split
    const { data: userSplit } = await supabase
      .from('user_splits')
      .select('*, splits(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (userSplit && userSplit.splits) {
      const s = userSplit.splits as unknown as Split;
      setActiveSplit(s);
      await loadSplitDetail(s.id, user.id);
      setView('detail');
    } else {
      setView('select');
    }

    // 3. Circle members' splits
    await loadCircleMembers(user.id);

    // 4. All exercises
    const { data: exData } = await supabase
      .from('exercises')
      .select('id, name')
      .order('name');
    if (exData) setAllExercises(exData);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── Load detail for a specific split ─── */
  const loadSplitDetail = async (splitId: string, userId: string) => {
    // Days + muscles
    const { data: daysData } = await supabase
      .from('split_days')
      .select('id, split_id, name, day_order, split_day_muscles(muscle_key)')
      .eq('split_id', splitId)
      .order('day_order');

    let parsed: SplitDay[] = [];
    if (daysData) {
      parsed = daysData.map((d: any) => ({
        id: d.id,
        split_id: d.split_id,
        name: d.name,
        day_order: d.day_order,
        muscles: (d.split_day_muscles || []).map((m: any) => m.muscle_key as MuscleKey),
      }));
      setDays(parsed);

      // Expand first day by default
      if (parsed.length > 0) {
        setExpandedDays(new Set([parsed[0].id]));
      }
    }

    // Exercises for each day
    const { data: exData } = await supabase
      .from('split_day_exercises')
      .select('id, split_day_id, exercise_id, exercise_order, exercises(name)')
      .in('split_day_id', parsed.map(d => d.id))
      .order('exercise_order');

    if (exData) {
      const grouped: Record<string, SplitDayExercise[]> = {};
      exData.forEach((e: any) => {
        const dayId = e.split_day_id;
        if (!grouped[dayId]) grouped[dayId] = [];
        grouped[dayId].push({
          id: e.id,
          split_day_id: dayId,
          exercise_id: e.exercise_id,
          exercise_order: e.exercise_order,
          exercise_name: e.exercises?.name || 'Unknown',
        });
      });
      setDayExercises(grouped);
    }
  };

  /* ─── Load circle members' splits ─── */
  const loadCircleMembers = async (userId: string) => {
    // Get user's circle-mates
    const { data: myCircles } = await supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', userId);

    if (!myCircles || myCircles.length === 0) return;

    const circleIds = myCircles.map((c: any) => c.circle_id);

    const { data: mates } = await supabase
      .from('circle_members')
      .select('user_id, profiles(username, avatar_url)')
      .in('circle_id', circleIds)
      .neq('user_id', userId);

    if (!mates) return;

    // Unique mates
    const uniqueMateIds = [...new Set(mates.map((m: any) => m.user_id))];

    // Get their active splits
    const { data: mateSplits } = await supabase
      .from('user_splits')
      .select('user_id, split_id')
      .in('user_id', uniqueMateIds)
      .eq('is_active', true);

    if (!mateSplits) return;

    const result: CircleMember[] = mateSplits.map((ms: any) => {
      const mate = mates.find((m: any) => m.user_id === ms.user_id);
      return {
        user_id: ms.user_id,
        username: (mate as any)?.profiles?.username || 'User',
        avatar_url: (mate as any)?.profiles?.avatar_url || null,
        split_id: ms.split_id,
      };
    });

    setCircleSplitMembers(result);
  };

  /* ─── Select a split ─── */
  const selectSplit = async (split: Split) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Deactivate current
    await supabase
      .from('user_splits')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Activate new (upsert)
    await supabase
      .from('user_splits')
      .upsert({
        user_id: user.id,
        split_id: split.id,
        is_active: true,
        activated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,split_id' });

    setActiveSplit(split);
    await loadSplitDetail(split.id, user.id);
    setView('detail');
  };

  /* ─── Change split (go back to selection) ─── */
  const changeSplit = () => {
    setView('select');
  };

  /* ─── Toggle day expansion ─── */
  const toggleDay = (dayId: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  /* ─── Add exercise to a day ─── */
  const addExerciseToDay = async (dayId: string, exercise: Exercise) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const existingForDay = dayExercises[dayId] || [];
    const alreadyAdded = existingForDay.some(e => e.exercise_id === exercise.id);
    if (alreadyAdded) return;

    const { data, error } = await supabase
      .from('split_day_exercises')
      .insert({
        split_day_id: dayId,
        exercise_id: exercise.id,
        exercise_order: existingForDay.length,
      })
      .select('id')
      .single();

    if (!error && data) {
      setDayExercises(prev => ({
        ...prev,
        [dayId]: [
          ...(prev[dayId] || []),
          {
            id: data.id,
            split_day_id: dayId,
            exercise_id: exercise.id,
            exercise_order: existingForDay.length,
            exercise_name: exercise.name,
          },
        ],
      }));
    }

    setAddingToDayId(null);
    setExerciseSearch('');
  };

  /* ─── Remove exercise from a day ─── */
  const removeExerciseFromDay = async (dayId: string, exerciseRowId: string) => {
    await supabase
      .from('split_day_exercises')
      .delete()
      .eq('id', exerciseRowId);

    setDayExercises(prev => ({
      ...prev,
      [dayId]: (prev[dayId] || []).filter(e => e.id !== exerciseRowId),
    }));
  };

  /* ─── Filter exercises for dropdown ─── */
  useEffect(() => {
    if (exerciseSearch) {
      setFilteredExercises(
        allExercises.filter(e => e.name.toLowerCase().includes(exerciseSearch.toLowerCase()))
      );
    } else {
      setFilteredExercises(allExercises);
    }
  }, [exerciseSearch, allExercises]);

  /* ─── Custom split builder ─── */
  const saveCustomSplit = async () => {
    if (!builderName.trim()) { setBuilderError('Please give your split a name.'); return; }
    if (builderDays.length === 0 || builderDays.every(d => !d.name.trim())) {
      setBuilderError('Add at least one day with a name.');
      return;
    }

    setBuilderSaving(true);
    setBuilderError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Create split
    const { data: splitData, error: splitErr } = await supabase
      .from('splits')
      .insert({
        name: builderName.trim(),
        description: `Custom split: ${builderDays.filter(d => d.name.trim()).map(d => d.name.trim()).join(', ')}`,
        frequency: `${builderDays.filter(d => d.name.trim()).length} days/week`,
        is_default: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (splitErr || !splitData) {
      setBuilderError(splitErr?.message || 'Failed to create split.');
      setBuilderSaving(false);
      return;
    }

    // Create days + muscles
    for (let i = 0; i < builderDays.length; i++) {
      const bd = builderDays[i];
      if (!bd.name.trim()) continue;

      const { data: dayData } = await supabase
        .from('split_days')
        .insert({ split_id: splitData.id, name: bd.name.trim(), day_order: i + 1 })
        .select()
        .single();

      if (dayData && bd.muscles.length > 0) {
        await supabase
          .from('split_day_muscles')
          .insert(bd.muscles.map(m => ({ split_day_id: dayData.id, muscle_key: m })));
      }
    }

    // Activate this split
    await selectSplit(splitData as Split);

    // Reset builder
    setShowBuilder(false);
    setBuilderName('');
    setBuilderDays([{ name: '', muscles: [] }]);
    setBuilderSaving(false);

    // Refresh splits list
    const { data: splitsData } = await supabase
      .from('splits')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    if (splitsData) setSplits(splitsData);
  };

  /* ─── Circle members for a specific split ─── */
  const getMembersForSplit = (splitId: string) =>
    circleSplitMembers.filter(m => m.split_id === splitId);

  /* ─── Avatar bubble helper ─── */
  const renderBubbles = (members: CircleMember[], max = 5) => {
    const shown = members.slice(0, max);
    const extra = members.length - max;
    return (
      <div className="split-card-bubbles">
        {shown.map(m => (
          <div key={m.user_id} className="split-card-bubble" title={m.username}>
            {m.avatar_url ? (
              <img src={m.avatar_url} alt={m.username} />
            ) : (
              m.username.charAt(0).toUpperCase()
            )}
          </div>
        ))}
        {extra > 0 && (
          <div className="split-card-bubble split-card-bubble-more">+{extra}</div>
        )}
      </div>
    );
  };

  /* ─── Render: Loading ─── */
  if (view === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  /* ─── Render: Selection Screen ─── */
  if (view === 'select') {
    const defaultSplits = splits.filter(s => s.is_default);
    const customSplits = splits.filter(s => !s.is_default && s.created_by === currentUserId);
    const circleSplits = splits.filter(s => !s.is_default && s.created_by !== currentUserId);

    return (
      <div className="animate-fade-in-up">
        <div className="page-header">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={26} style={{ color: 'var(--accent-cyan)' }} />
            Choose Your Split
          </h1>
          <p>Select a training split that matches your schedule and goals</p>
        </div>

        {/* Default splits — large title cards */}
        <div className="split-grid">
          {defaultSplits.map((split, i) => {
            const accent = getAccent(split.id);
            const members = getMembersForSplit(split.id);
            const isActive = activeSplit?.id === split.id;

            return (
              <div
                key={split.id}
                className={`split-card animate-fade-in-up ${isActive ? 'active' : ''}`}
                style={{
                  animationDelay: `${i * 0.08}s`,
                  '--split-accent': accent,
                } as React.CSSProperties}
                onClick={() => selectSplit(split)}
              >
                <div className="split-card-number">{i + 1}</div>
                <div className="split-card-title">{split.name}</div>
                <div
                  className="split-card-freq"
                  style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
                >
                  <Calendar size={12} />
                  {split.frequency}
                </div>
                <div className="split-card-desc" style={{ display: 'none' }}>{split.description}</div>
                <div className="split-card-footer" style={{ marginTop: 'auto', paddingTop: 16 }}>
                  {members.length > 0 && renderBubbles(members, 4)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom splits */}
        {customSplits.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
              Your Custom Splits
            </h2>
            <div className="split-grid">
              {customSplits.map((split, i) => {
                const members = getMembersForSplit(split.id);
                const isActive = activeSplit?.id === split.id;
                return (
                  <div
                    key={split.id}
                    className={`split-card animate-fade-in-up ${isActive ? 'active' : ''}`}
                    style={{
                      animationDelay: `${(defaultSplits.length + i) * 0.08}s`,
                      '--split-accent': '#10b981',
                    } as React.CSSProperties}
                    onClick={() => selectSplit(split)}
                  >
                    <div className="split-card-title">{split.name}</div>
                    {split.frequency && (
                      <div className="split-card-freq" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <Calendar size={12} />
                        {split.frequency}
                      </div>
                    )}
                    <div className="split-card-desc" style={{ display: 'none' }}>{split.description}</div>
                    <div className="split-card-footer" style={{ marginTop: 'auto', paddingTop: 16 }}>
                      {members.length > 0 && renderBubbles(members, 4)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Circle splits */}
        {circleSplits.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
              Circle Splits
            </h2>
            <div className="split-grid">
              {circleSplits.map((split, i) => {
                const members = getMembersForSplit(split.id);
                const isActive = activeSplit?.id === split.id;
                // find creator info from circleSplitMembers if they are using it, otherwise we might not have their avatar.
                // It's okay, we just show it's a circle split.
                return (
                  <div
                    key={split.id}
                    className={`split-card animate-fade-in-up ${isActive ? 'active' : ''}`}
                    style={{
                      animationDelay: `${(defaultSplits.length + customSplits.length + i) * 0.08}s`,
                      '--split-accent': '#3b82f6',
                    } as React.CSSProperties}
                    onClick={() => selectSplit(split)}
                  >
                    <div className="split-card-title">{split.name}</div>
                    {split.frequency && (
                      <div className="split-card-freq" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <Calendar size={12} />
                        {split.frequency}
                      </div>
                    )}
                    <div className="split-card-desc" style={{ display: 'none' }}>{split.description}</div>
                    <div className="split-card-footer" style={{ marginTop: 'auto', paddingTop: 16 }}>
                      {members.length > 0 && renderBubbles(members, 4)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create custom button */}
        <button
          className="btn-primary"
          style={{ gap: 8, fontSize: 15, padding: '14px 28px' }}
          onClick={() => setShowBuilder(true)}
        >
          <Plus size={18} />
          Create Custom Split
        </button>

        {/* Builder Modal */}
        {mounted && showBuilder && createPortal(
          <div className="split-builder-overlay" onClick={() => setShowBuilder(false)}>
            <div className="split-builder" onClick={e => e.stopPropagation()}>
              <div className="split-builder-head">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={20} style={{ color: 'var(--accent-purple)' }} />
                  Create Custom Split
                </span>
                <button className="dash-drawer-close" onClick={() => setShowBuilder(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="split-builder-body">
                <div className="form-group">
                  <label className="label">Split Name</label>
                  <input
                    className="input"
                    placeholder="e.g. My PPL Variant"
                    value={builderName}
                    onChange={e => setBuilderName(e.target.value)}
                    autoFocus
                  />
                </div>

                <label className="label" style={{ marginBottom: 12 }}>Training Days</label>

                {builderDays.map((day, di) => (
                  <div key={di} className="split-builder-day">
                    <div className="split-builder-day-head">
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-purple)' }}>Day {di + 1}</span>
                      {builderDays.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setBuilderDays(prev => prev.filter((_, i) => i !== di))}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <input
                      className="input"
                      placeholder="Day name (e.g. Push, Upper Body)"
                      value={day.name}
                      onChange={e => {
                        const updated = [...builderDays];
                        updated[di] = { ...updated[di], name: e.target.value };
                        setBuilderDays(updated);
                      }}
                      style={{ marginBottom: 12 }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Target Muscles
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(Object.keys(MUSCLE_META) as MuscleKey[]).map(key => {
                        const selected = day.muscles.includes(key);
                        const meta = MUSCLE_META[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const updated = [...builderDays];
                              updated[di] = {
                                ...updated[di],
                                muscles: selected
                                  ? updated[di].muscles.filter(m => m !== key)
                                  : [...updated[di].muscles, key],
                              };
                              setBuilderDays(updated);
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: selected ? `${meta.color}20` : 'rgba(255,255,255,0.03)',
                              color: selected ? meta.color : 'var(--text-muted)',
                              border: `1px solid ${selected ? meta.color : 'rgba(255,255,255,0.08)'}`,
                            }}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="split-builder-add-day"
                  onClick={() => setBuilderDays(prev => [...prev, { name: '', muscles: [] }])}
                >
                  <Plus size={16} />
                  Add Another Day
                </button>

                {builderError && <p className="error-text" style={{ marginBottom: 12 }}>{builderError}</p>}

                <button
                  className="btn-primary"
                  style={{ width: '100%', gap: 8 }}
                  onClick={saveCustomSplit}
                  disabled={builderSaving}
                >
                  {builderSaving ? <span className="spinner" /> : <><Layers size={16} /> Create & Activate Split</>}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  /* ─── Render: Detail View ─── */
  if (view === 'detail' && activeSplit) {
    const accent = getAccent(activeSplit.id);
    const members = getMembersForSplit(activeSplit.id);

    return (
      <div className="animate-fade-in-up">
        {/* Header */}
        <div className="split-detail-header">
          <div>
            <div className="split-detail-meta">
              {activeSplit.frequency && (
                <span
                  className="badge"
                  style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
                >
                  <Calendar size={12} />
                  {activeSplit.frequency}
                </span>
              )}
              {activeSplit.is_default && (
                <span className="badge badge-purple" style={{ gap: 4 }}>
                  <Sparkles size={11} />
                  Default
                </span>
              )}
            </div>
            <h1 className="split-detail-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Layers size={28} style={{ color: accent, flexShrink: 0 }} />
              {activeSplit.name}
            </h1>
            <div className="split-detail-desc">{activeSplit.description}</div>
          </div>
          <button className="split-change-btn" onClick={changeSplit}>
            <RefreshCw size={15} />
            Change Split
          </button>
        </div>

        {/* Advantage callout */}
        {activeSplit.advantage && (
          <div className="split-advantage">
            <span style={{ fontSize: 16, marginTop: -1 }}>💡</span>
            <div>
              <strong>The Advantage: </strong>
              {activeSplit.advantage}
            </div>
          </div>
        )}

        {/* Circle members */}
        {members.length > 0 && (
          <div className="split-members-row">
            <Users size={18} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
            <div className="split-members-avatars">
              {renderBubbles(members, 8)}
            </div>
            <div className="split-members-label">
              <strong>{members.length}</strong> {members.length === 1 ? 'friend' : 'friends'} in your circle also {members.length === 1 ? 'follows' : 'follow'} this split
            </div>
          </div>
        )}

        {/* Day cards */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Training Days — {days.length} {days.length === 1 ? 'day' : 'days'}
        </h2>

        <div className="split-days-grid">
          {days.map(day => {
            const isExpanded = expandedDays.has(day.id);
            const exercises = dayExercises[day.id] || [];
            const isAddingHere = addingToDayId === day.id;

            return (
              <div key={day.id} className="split-day-card">
                <div className="split-day-header" onClick={() => toggleDay(day.id)}>
                  <div className="split-day-info">
                    <div className="split-day-name">
                      <span className="split-day-order">{day.day_order}</span>
                      {day.name}
                    </div>
                    <div className="split-day-muscles">
                      {day.muscles.map(m => {
                        const meta = MUSCLE_META[m];
                        if (!meta) return null;
                        return (
                          <span
                            key={m}
                            className="muscles-muscle-tag"
                            style={{
                              background: `${meta.color}18`,
                              color: meta.color,
                              borderColor: `${meta.color}30`,
                              cursor: 'default',
                            }}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {exercises.length > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="split-day-body">
                    {exercises.length > 0 && (
                      <div className="split-day-exercises">
                        {exercises.map(ex => (
                          <div key={ex.id} className="split-day-exercise-row">
                            <div className="split-day-exercise-name">
                              <Dumbbell size={14} style={{ color: accent, flexShrink: 0 }} />
                              {ex.exercise_name}
                            </div>
                            {(!activeSplit.is_default && activeSplit.created_by === currentUserId) && (
                              <button
                                className="btn-danger"
                                style={{ padding: '4px 6px', minHeight: 0 }}
                                onClick={() => removeExerciseFromDay(day.id, ex.id)}
                                title="Remove exercise"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {exercises.length === 0 && !isAddingHere && (
                      <div style={{ padding: '16px 0 4px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                        No exercises added yet. Add exercises to plan your workout.
                      </div>
                    )}

                    {/* Add exercise */}
                    {(!activeSplit.is_default && activeSplit.created_by === currentUserId) && (
                      isAddingHere ? (
                        <div style={{ marginTop: 12, position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                              className="input"
                              style={{ paddingLeft: 36 }}
                              placeholder="Search exercises..."
                              value={exerciseSearch}
                              onChange={e => setExerciseSearch(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <div style={{
                            marginTop: 4,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            maxHeight: 200,
                            overflowY: 'auto',
                          }}>
                            {filteredExercises.map(ex => {
                              const alreadyAdded = exercises.some(e => e.exercise_id === ex.id);
                              return (
                                <div
                                  key={ex.id}
                                  onClick={() => !alreadyAdded && addExerciseToDay(day.id, ex)}
                                  style={{
                                    padding: '10px 16px',
                                    cursor: alreadyAdded ? 'default' : 'pointer',
                                    fontSize: 14,
                                    borderBottom: '1px solid var(--border-color)',
                                    opacity: alreadyAdded ? 0.4 : 1,
                                    transition: 'background 0.15s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                  }}
                                  onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = 'var(--bg-input)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <span>{ex.name}</span>
                                  {alreadyAdded && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Added</span>}
                                </div>
                              );
                            })}
                            {filteredExercises.length === 0 && (
                              <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 14 }}>
                                No exercises found
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ marginTop: 8, width: '100%', fontSize: 13 }}
                            onClick={() => { setAddingToDayId(null); setExerciseSearch(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="split-day-add-btn"
                          onClick={() => { setAddingToDayId(day.id); setExerciseSearch(''); }}
                        >
                          <Plus size={15} />
                          Add Exercise
                        </button>
                      )
                    )}

                    {/* Quick log */}
                    <button
                      className="btn-primary"
                      style={{ width: '100%', marginTop: 14, gap: 8, fontSize: 13 }}
                      onClick={() => router.push('/log')}
                    >
                      <Dumbbell size={15} />
                      Log {day.name} Workout
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
