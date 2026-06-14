'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Camera, Save, User, Dumbbell, Trophy, Calendar, Activity, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Profile {
  username: string;
  avatar_url: string | null;
  height_cm: number | null;
  created_at: string;
}

interface BodyMetric {
  id: string;
  weight_kg: number;
  logged_at: string;
}

interface PersonalStats {
  totalLogs: number;
  uniqueExercises: number;
  totalDays: number;
}

const getHeatmapGrid = () => {
  const dates = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - 364);
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);
  
  const cursor = new Date(startDate);
  for (let i = 0; i < 371; i++) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [height, setHeight] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<PersonalStats>({ totalLogs: 0, uniqueExercises: 0, totalDays: 0 });
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fatigue, setFatigue] = useState({ score: 1.0, label: 'Optimal', color: 'var(--accent-cyan)' });
  const [dailyLogCounts, setDailyLogCounts] = useState<Record<string, number>>({});
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const checkTheme = () => {
      const isL = document.documentElement.getAttribute('data-theme') === 'light';
      setTheme(isL ? 'light' : 'dark');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      observer.disconnect();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);


  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('username, avatar_url, height_cm, created_at')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
      setUsername(data.username);
      setHeight(data.height_cm ? data.height_cm.toString() : '');
      setAvatarUrl(data.avatar_url);
    }
    
    // Fetch body metrics
    const { data: metricsData } = await supabase
      .from('body_metrics')
      .select('id, weight_kg, logged_at')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: true });
      
    if (metricsData) {
      setBodyMetrics(metricsData);
    }
    
    setLoading(false);
  };

  const fetchStats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('exercise_id, logged_at')
      .eq('user_id', user.id);

    if (logs) {
      const uniqueExercises = new Set(logs.map((l: any) => l.exercise_id)).size;
      const uniqueDays = new Set(logs.map((l: any) => l.logged_at)).size;
      setStats({
        totalLogs: logs.length,
        uniqueExercises,
        totalDays: uniqueDays,
      });

      const counts: Record<string, number> = {};
      const today = new Date();
      const dayStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const date7 = new Date(today); date7.setDate(today.getDate() - 7);
      const str7 = dayStr(date7);
      
      const date28 = new Date(today); date28.setDate(today.getDate() - 28);
      const str28 = dayStr(date28);
      
      let acuteSets = 0;
      let total28Sets = 0;

      logs.forEach((l: any) => {
        if (l.logged_at) {
          counts[l.logged_at] = (counts[l.logged_at] || 0) + 1;
          if (l.logged_at >= str28) {
            total28Sets++;
            if (l.logged_at >= str7) {
              acuteSets++;
            }
          }
        }
      });
      setDailyLogCounts(counts);

      const chronicWeekly = total28Sets / 4;
      let ratio = 1.0;
      if (chronicWeekly > 0) {
        ratio = acuteSets / chronicWeekly;
      } else if (acuteSets > 0) {
        ratio = 1.5;
      }
      
      let fLabel = 'Optimal';
      let fColor = 'var(--accent-cyan)';
      
      // Prevent false "Overreaching" alerts when total volume is very low
      if (acuteSets < 12) {
        fLabel = 'Under-trained';
        fColor = 'var(--text-muted)';
      } else if (ratio < 0.8) {
        fLabel = 'Under-trained';
        fColor = 'var(--text-muted)';
      } else if (ratio > 1.5) {
        fLabel = 'Overreaching';
        fColor = 'var(--accent-orange)';
      } else if (ratio > 1.3) {
        fLabel = 'High Fatigue';
        fColor = '#ff4d4d';
      }
      
      setFatigue({ score: ratio, label: fLabel, color: fColor });
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB');
      return;
    }

    setUploading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Add cache buster
    const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: urlWithCacheBust })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setAvatarUrl(urlWithCacheBust);
      setMessage('Avatar updated!');
      window.dispatchEvent(new Event('profile-updated'));
      setTimeout(() => setMessage(''), 3000);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!username.trim() || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setSaving(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        username: username.trim(),
        height_cm: height ? parseFloat(height) : null
      })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message.includes('duplicate') ? 'Username is already taken' : updateError.message);
    } else {
      setMessage('Profile updated!');
      window.dispatchEvent(new Event('profile-updated'));
      setTimeout(() => setMessage(''), 3000);
    }
    setSaving(false);
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleSaveWeight = async () => {
    if (!newWeight || isNaN(parseFloat(newWeight))) return;
    
    setSavingWeight(true);
    setError('');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error: insertError } = await supabase
      .from('body_metrics')
      .insert({
        user_id: user.id,
        weight_kg: parseFloat(newWeight)
      })
      .select()
      .single();
      
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setBodyMetrics([...bodyMetrics, data]);
      setNewWeight('');
      setMessage('Weight logged successfully!');
      setTimeout(() => setMessage(''), 3000);
    }
    setSavingWeight(false);
  };

  const gridDates = getHeatmapGrid();
  const monthLabels: { label: string; index: number }[] = [];
  let prevMonth = -1;
  gridDates.forEach((d, i) => {
    if (i % 7 === 0) {
      const month = d.getMonth();
      if (month !== prevMonth) {
        monthLabels.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), index: Math.floor(i / 7) });
        prevMonth = month;
      }
    }
  });

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
        <h1>Profile</h1>
        <p>Manage your account and view your stats</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24, marginBottom: 24 }}>
        {/* Fatigue Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={18} style={{ color: fatigue.color }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Systemic Fatigue</h3>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: fatigue.color }}>
            {fatigue.label}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Acute:Chronic Workload Ratio ({fatigue.score.toFixed(2)})
          </p>
        </div>

        {/* 📅 Consistency Heatmap Card */}
        <div className="card" style={{
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Calendar size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Yearly Consistency</h3>
          </div>
          <div style={{ width: '100%', overflowX: 'auto', paddingBottom: 8 }} className="no-scrollbar">
            <div style={{ display: 'flex', gap: 8, minWidth: 720 }}>
              {/* Day labels on the left */}
              <div style={{
                display: 'grid',
                gridTemplateRows: 'repeat(7, 10px)',
                gap: '3px',
                padding: '18px 0 4px',
                fontSize: 9,
                color: 'var(--text-muted)',
                textAlign: 'right',
                lineHeight: '10px',
                width: 24,
                flexShrink: 0
              }}>
                <div></div><div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div>
              </div>

              {/* Month labels + grid on the right */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(53, 10px)', gap: '3px', fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {Array.from({ length: 53 }).map((_, i) => {
                    const labelObj = monthLabels.find(l => l.index === i);
                    return <div key={i} style={{ gridColumnStart: i + 1, gridColumnEnd: i + 3, gridRow: 1, whiteSpace: 'nowrap' }}>{labelObj ? labelObj.label : ''}</div>;
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 10px)', gridAutoFlow: 'column', gap: '3px' }}>
                  {gridDates.map((d, idx) => {
                    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const count = dailyLogCounts[dStr] || 0;
                    const opacity = count === 0 ? 1 : count === 1 ? 0.35 : count === 2 ? 0.6 : count === 3 ? 0.8 : 1.0;
                    const color = 'var(--accent-purple)';
                    return (
                      <div
                        key={idx}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                            count,
                            x: rect.left + window.scrollX + rect.width / 2,
                            y: rect.top + window.scrollY - 38
                          });
                        }}
                        onMouseLeave={() => setHoveredDay(null)}
                        style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: count === 0 ? (theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)') : color,
                          opacity,
                          boxShadow: count > 3 ? `0 0 6px ${color}` : 'none',
                          cursor: 'pointer', transition: 'transform 0.1s ease, background-color 0.2s',
                        }}
                        className="heatmap-cell"
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
            <span>Less</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)' }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.35 }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.6 }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 0.8 }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-purple)', opacity: 1.0, boxShadow: '0 0 4px var(--accent-purple)' }} />
            <span>More</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24, alignItems: 'start' }}>
        {/* Profile Card */}
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="avatar avatar-lg" />
              ) : (
                <div className="avatar-placeholder avatar-placeholder-lg">
                  {username?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  border: '2px solid var(--bg-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'transform var(--transition-fast)',
                }}
              >
                {uploading ? (
                  <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                ) : (
                  <Camera size={12} color="var(--bg-primary)" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{profile?.username}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Member since {new Date(profile?.created_at || '').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
            />
          </div>
          
          <div className="form-group">
            <label className="label">Height (cm)</label>
            <input
              className="input"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 180"
            />
          </div>

          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}

          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
            {saving ? <span className="spinner" /> : <><Save size={16} /> Save Changes</>}
          </button>

          {deferredPrompt && (
            <button className="btn-secondary" onClick={handleInstallApp} style={{ width: '100%', marginTop: 12 }}>
              <Download size={16} /> Add to Homescreen
            </button>
          )}
        </div>

        {/* Stats Card */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} style={{ color: 'var(--accent-cyan)' }} /> Your Stats
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Dumbbell size={18} style={{ color: 'var(--accent-cyan)' }} />
                <span className="stat-label" style={{ margin: 0 }}>Total Workouts Logged</span>
              </div>
              <div className="stat-value">{stats.totalLogs}</div>
            </div>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Trophy size={18} style={{ color: 'var(--accent-purple)' }} />
                <span className="stat-label" style={{ margin: 0 }}>Exercises Trained</span>
              </div>
              <div className="stat-value">{stats.uniqueExercises}</div>
            </div>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Calendar size={18} style={{ color: 'var(--accent-green)' }} />
                <span className="stat-label" style={{ margin: 0 }}>Active Days</span>
              </div>
              <div className="stat-value">{stats.totalDays}</div>
            </div>
          </div>
          
          {/* Weight Tracking Section */}
          <div style={{ marginTop: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} style={{ color: 'var(--accent-orange)' }} /> Body Weight Progress
            </h3>
            
            <div className="card" style={{ marginBottom: 16, padding: '16px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="label" style={{ fontSize: 12, marginBottom: 4 }}>Log Current Weight (kg)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="e.g. 75.5"
                    style={{ padding: '10px 14px' }}
                  />
                </div>
                <button 
                  className="btn-primary" 
                  onClick={handleSaveWeight} 
                  disabled={savingWeight || !newWeight}
                  style={{ height: 42, padding: '0 20px', background: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }}
                >
                  {savingWeight ? <span className="spinner" /> : 'Log Weight'}
                </button>
              </div>
            </div>
            
            {bodyMetrics.length > 0 ? (
              <div className="card" style={{ padding: '20px 16px', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bodyMetrics.map(m => ({
                    date: new Date(m.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    weight: m.weight_kg
                  }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--text-muted)" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="var(--text-muted)" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tickFormatter={(val) => val.toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 13 }}
                      itemStyle={{ color: 'var(--accent-orange)', fontWeight: 600 }}
                      formatter={(value: any) => [`${Number(value).toFixed(1)} kg`, 'Weight']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="weight" 
                      stroke="var(--accent-orange)" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'var(--bg-primary)', stroke: 'var(--accent-orange)', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: 'var(--accent-orange)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)' }}>
                <Activity size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ fontSize: 14 }}>No weight logs yet.</p>
                <p style={{ fontSize: 12, opacity: 0.7 }}>Log your current weight to start tracking your progress!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {hoveredDay && (
        <div style={{
          position: 'absolute',
          left: hoveredDay.x,
          top: hoveredDay.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-color)',
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text-primary)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 100,
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hoveredDay.count} workouts</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{hoveredDay.date}</div>
        </div>
      )}
    </div>
  );
}
