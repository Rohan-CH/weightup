'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trophy, Crown, Medal, Award } from 'lucide-react';

interface Exercise {
  id: string;
  name: string;
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  max_weight: number;
}

interface PowerlifterEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total: number;
  deadlift: number;
  bench: number;
  squat: number;
}

const POWERLIFTING_EXERCISES = ['Deadlift', 'Flat Barbell Bench Press', 'Squat'];

export default function LeaderboardPage() {
  const [tab, setTab] = useState<'exercise' | 'powerlifter'>('exercise');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [powerlifterBoard, setPowerlifterBoard] = useState<PowerlifterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchExercises();
  }, []);

  useEffect(() => {
    if (tab === 'powerlifter') {
      fetchPowerlifterLeaderboard();
    }
  }, [tab]);

  useEffect(() => {
    if (selectedExercise) {
      fetchExerciseLeaderboard(selectedExercise);
    }
  }, [selectedExercise]);

  const fetchExercises = async () => {
    const { data } = await supabase
      .from('exercises')
      .select('id, name')
      .order('name');
    if (data) {
      setExercises(data);
      if (data.length > 0) setSelectedExercise(data[0].id);
    }
  };

  const fetchExerciseLeaderboard = async (exerciseId: string) => {
    setLoading(true);

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('user_id, weight_kg')
      .eq('exercise_id', exerciseId);

    if (!logs) { setLoading(false); return; }

    // Get max weight per user
    const userMax: Record<string, number> = {};
    logs.forEach((l: any) => {
      if (!userMax[l.user_id] || l.weight_kg > userMax[l.user_id]) {
        userMax[l.user_id] = l.weight_kg;
      }
    });

    const userIds = Object.keys(userMax);
    if (userIds.length === 0) { setLeaderboard([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    const entries: LeaderboardEntry[] = userIds.map(uid => ({
      user_id: uid,
      username: profiles?.find((p: any) => p.id === uid)?.username || 'Unknown',
      avatar_url: profiles?.find((p: any) => p.id === uid)?.avatar_url || null,
      max_weight: userMax[uid],
    })).sort((a, b) => b.max_weight - a.max_weight);

    setLeaderboard(entries);
    setLoading(false);
  };

  const fetchPowerlifterLeaderboard = async () => {
    setLoading(true);

    // Get exercise IDs for the 3 powerlifts
    const { data: plExercises } = await supabase
      .from('exercises')
      .select('id, name')
      .in('name', POWERLIFTING_EXERCISES);

    if (!plExercises || plExercises.length === 0) {
      setPowerlifterBoard([]);
      setLoading(false);
      return;
    }

    const exerciseMap: Record<string, string> = {};
    plExercises.forEach((e: any) => { exerciseMap[e.id] = e.name; });
    const exerciseIds = plExercises.map((e: any) => e.id);

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('user_id, exercise_id, weight_kg')
      .in('exercise_id', exerciseIds);

    if (!logs) { setLoading(false); return; }

    // Max per user per exercise
    const userExerciseMax: Record<string, Record<string, number>> = {};
    logs.forEach((l: any) => {
      if (!userExerciseMax[l.user_id]) userExerciseMax[l.user_id] = {};
      const exName = exerciseMap[l.exercise_id];
      if (!userExerciseMax[l.user_id][exName] || l.weight_kg > userExerciseMax[l.user_id][exName]) {
        userExerciseMax[l.user_id][exName] = l.weight_kg;
      }
    });

    const userIds = Object.keys(userExerciseMax);
    if (userIds.length === 0) { setPowerlifterBoard([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    const entries: PowerlifterEntry[] = userIds.map(uid => {
      const maxes = userExerciseMax[uid];
      const deadlift = maxes['Deadlift'] || 0;
      const bench = maxes['Flat Barbell Bench Press'] || 0;
      const squat = maxes['Squat'] || 0;
      return {
        user_id: uid,
        username: profiles?.find((p: any) => p.id === uid)?.username || 'Unknown',
        avatar_url: profiles?.find((p: any) => p.id === uid)?.avatar_url || null,
        total: deadlift + bench + squat,
        deadlift,
        bench,
        squat,
      };
    }).sort((a, b) => b.total - a.total);

    setPowerlifterBoard(entries);
    setLoading(false);
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown size={18} style={{ color: '#f59e0b' }} />;
    if (index === 1) return <Medal size={18} style={{ color: '#94a3b8' }} />;
    if (index === 2) return <Medal size={18} style={{ color: '#cd7f32' }} />;
    return <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 14 }}>#{index + 1}</span>;
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return 'badge badge-gold';
    if (index === 1) return 'badge badge-cyan';
    if (index === 2) return 'badge badge-purple';
    return '';
  };

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1>Leaderboard</h1>
        <p>See how you stack up against the community</p>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ maxWidth: 460 }}>
        <button className={`tab ${tab === 'exercise' ? 'active' : ''}`} onClick={() => setTab('exercise')}>
          <Trophy size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Exercise
        </button>
        <button className={`tab ${tab === 'powerlifter' ? 'active' : ''}`} onClick={() => setTab('powerlifter')}>
          <Award size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Powerlifter
        </button>
      </div>

      {tab === 'exercise' && (
        <>
          <div className="form-group" style={{ maxWidth: 320, marginBottom: 24 }}>
            <label className="label">Select Exercise</label>
            <select
              className="select"
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
            >
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="card empty-state">
              <Trophy size={48} />
              <h3>No entries yet</h3>
              <p>Be the first to log this exercise and claim the top spot!</p>
            </div>
          ) : (
            <div className="table-wrapper animate-fade-in">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Athlete</th>
                    <th>Max Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.user_id} style={{ background: i < 3 ? 'rgba(0, 245, 255, 0.02)' : 'transparent' }}>
                      <td style={{ textAlign: 'center' }}>{getRankIcon(i)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {entry.avatar_url ? (
                            <img src={entry.avatar_url} alt="" className="avatar" style={{ width: 32, height: 32 }} />
                          ) : (
                            <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                              {entry.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span style={{ fontWeight: 500 }}>{entry.username}</span>
                        </div>
                      </td>
                      <td>
                        <span className={i < 3 ? getRankBadge(i) : ''} style={i >= 3 ? { fontWeight: 500 } : {}}>
                          {entry.max_weight} kg
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'powerlifter' && (
        <>
          <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.15)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-secondary)' }}>
            Total = max Deadlift + max Flat Barbell Bench Press + max Squat
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : powerlifterBoard.length === 0 ? (
            <div className="card empty-state">
              <Award size={48} />
              <h3>No powerlifting data yet</h3>
              <p>Log your Deadlift, Bench Press, and Squat to appear on the board!</p>
            </div>
          ) : (
            <div className="table-wrapper animate-fade-in">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Athlete</th>
                    <th>Deadlift</th>
                    <th>Bench</th>
                    <th>Squat</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {powerlifterBoard.map((entry, i) => (
                    <tr key={entry.user_id} style={{ background: i < 3 ? 'rgba(124, 58, 237, 0.02)' : 'transparent' }}>
                      <td style={{ textAlign: 'center' }}>{getRankIcon(i)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {entry.avatar_url ? (
                            <img src={entry.avatar_url} alt="" className="avatar" style={{ width: 32, height: 32 }} />
                          ) : (
                            <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                              {entry.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span style={{ fontWeight: 500 }}>{entry.username}</span>
                        </div>
                      </td>
                      <td>{entry.deadlift} kg</td>
                      <td>{entry.bench} kg</td>
                      <td>{entry.squat} kg</td>
                      <td>
                        <span className={i < 3 ? getRankBadge(i) : ''} style={{ fontWeight: 700, ...(i >= 3 ? {} : {}) }}>
                          {entry.total} kg
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
