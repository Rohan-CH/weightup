'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trophy, Crown, Medal, Award, Users } from 'lucide-react';
import UserProfileModal from '../UserProfileModal';

interface Exercise {
  id: string;
  name: string;
}

interface Circle {
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
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedCircle, setSelectedCircle] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [powerlifterBoard, setPowerlifterBoard] = useState<PowerlifterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: exData } = await supabase
      .from('exercises')
      .select('id, name')
      .order('name');
    if (exData) {
      setExercises(exData);
      if (exData.length > 0) setSelectedExercise(exData[0].id);
    }

    if (user) {
      const { data: circleRows } = await supabase
        .from('circle_members')
        .select('circles(id, name)')
        .eq('user_id', user.id);
      if (circleRows) {
        const list: Circle[] = circleRows
          .filter((r: any) => r.circles)
          .map((r: any) => r.circles)
          .sort((a: Circle, b: Circle) => a.name.localeCompare(b.name));
        setCircles(list);
        if (list.length > 0) setSelectedCircle(list[0].id);
      }
    }
    setInitLoading(false);
  };

  // Load the member ids whenever the selected circle changes.
  useEffect(() => {
    if (!selectedCircle) {
      setMemberIds([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', selectedCircle);
      setMemberIds(data ? data.map((m: any) => m.user_id) : []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircle]);

  useEffect(() => {
    if (memberIds.length === 0) {
      setLeaderboard([]);
      setPowerlifterBoard([]);
      return;
    }
    if (tab === 'powerlifter') fetchPowerlifterLeaderboard();
    else if (selectedExercise) fetchExerciseLeaderboard(selectedExercise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedExercise, memberIds]);

  const fetchExerciseLeaderboard = async (exerciseId: string) => {
    setLoading(true);

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('user_id, weight_kg')
      .eq('exercise_id', exerciseId)
      .in('user_id', memberIds);

    if (!logs) { setLoading(false); return; }

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
      .in('exercise_id', exerciseIds)
      .in('user_id', memberIds);

    if (!logs) { setLoading(false); return; }

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

  if (initLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1>Leaderboard</h1>
        <p>See how you stack up against your circle</p>
      </div>

      {circles.length === 0 ? (
        <div className="card empty-state">
          <Users size={48} />
          <h3>Join a circle first</h3>
          <p>Leaderboards are scoped to your circles. Head to the Circles tab to create or join one.</p>
        </div>
      ) : (
        <>
          {/* Circle selector */}
          <div className="form-group" style={{ maxWidth: 320, marginBottom: 20 }}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} style={{ color: 'var(--accent-cyan)' }} /> Circle
            </label>
            <select
              className="select"
              value={selectedCircle}
              onChange={(e) => setSelectedCircle(e.target.value)}
            >
              {circles.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
                  <p>No one in this circle has logged this exercise yet.</p>
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
                              <button 
                                type="button" 
                                style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={() => setProfileModalUserId(entry.user_id)}
                              >
                                {entry.avatar_url ? (
                                  <img src={entry.avatar_url} alt="" className="avatar" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                                ) : (
                                  <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                                    {entry.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </button>
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
                  <p>No one in this circle has logged Deadlift, Bench Press, or Squat yet.</p>
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
                              <button 
                                type="button" 
                                style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={() => setProfileModalUserId(entry.user_id)}
                              >
                                {entry.avatar_url ? (
                                  <img src={entry.avatar_url} alt="" className="avatar" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                                ) : (
                                  <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                                    {entry.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </button>
                              <span style={{ fontWeight: 500 }}>{entry.username}</span>
                            </div>
                          </td>
                          <td>{entry.deadlift} kg</td>
                          <td>{entry.bench} kg</td>
                          <td>{entry.squat} kg</td>
                          <td>
                            <span className={i < 3 ? getRankBadge(i) : ''} style={{ fontWeight: 700 }}>
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
        </>
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
