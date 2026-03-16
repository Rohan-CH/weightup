'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Camera, Save, User, Dumbbell, Trophy, Calendar } from 'lucide-react';

interface Profile {
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface PersonalStats {
  totalLogs: number;
  uniqueExercises: number;
  totalDays: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<PersonalStats>({ totalLogs: 0, uniqueExercises: 0, totalDays: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('username, avatar_url, created_at')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
      setUsername(data.username);
      setAvatarUrl(data.avatar_url);
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
    }
  };

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
      .update({ username: username.trim() })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message.includes('duplicate') ? 'Username is already taken' : updateError.message);
    } else {
      setMessage('Profile updated!');
      setTimeout(() => setMessage(''), 3000);
    }
    setSaving(false);
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
        <h1>Profile</h1>
        <p>Manage your account and view your stats</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
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

          <div className="form-group">
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
            />
          </div>

          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}

          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
            {saving ? <span className="spinner" /> : <><Save size={16} /> Save Changes</>}
          </button>
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
        </div>
      </div>
    </div>
  );
}
