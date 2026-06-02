'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  Plus,
  ArrowLeft,
  Mail,
  Check,
  X,
  LogOut,
  Trash2,
  Crown,
  Link as LinkIcon,
  Dumbbell,
} from 'lucide-react';

interface Circle {
  id: string;
  name: string;
  owner_id: string;
  join_code: string;
  created_at: string;
  role?: string;
}

interface Member {
  user_id: string;
  username: string;
  avatar_url: string | null;
  role: string;
}

interface PendingInvite {
  id: string;
  circle_id: string;
  circle_name: string;
}

interface MemberLog {
  id: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
  exercises: { name: string } | null;
}

type View = 'list' | 'circle' | 'member';

export default function CirclesPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [circles, setCircles] = useState<Circle[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  // create / join
  const [newCircleName, setNewCircleName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // circle detail
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');

  // member detail
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [memberLogs, setMemberLogs] = useState<MemberLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await Promise.all([loadCircles(user.id), loadInvites(user.email || '')]);
    setLoading(false);
  };

  const loadCircles = async (uid: string) => {
    const { data } = await supabase
      .from('circle_members')
      .select('role, circles(id, name, owner_id, join_code, created_at)')
      .eq('user_id', uid);

    if (data) {
      const list: Circle[] = data
        .filter((row: any) => row.circles)
        .map((row: any) => ({ ...row.circles, role: row.role }))
        .sort((a: Circle, b: Circle) => a.name.localeCompare(b.name));
      setCircles(list);
    }
  };

  const loadInvites = async (email: string) => {
    if (!email) return;
    const { data } = await supabase
      .from('circle_invites')
      .select('id, circle_id, circles(name)')
      .ilike('invited_email', email)
      .eq('status', 'pending');

    if (data) {
      setInvites(
        data.map((i: any) => ({
          id: i.id,
          circle_id: i.circle_id,
          circle_name: i.circles?.name || 'A circle',
        }))
      );
    }
  };

  const handleCreateCircle = async () => {
    setError('');
    if (!newCircleName.trim()) return;
    if (!userId) return;
    const { error } = await supabase
      .from('circles')
      .insert({ name: newCircleName.trim(), owner_id: userId });
    if (error) {
      setError(error.message);
      return;
    }
    setNewCircleName('');
    await loadCircles(userId);
    flash('Circle created!');
  };

  const handleJoinByCode = async () => {
    setError('');
    if (!joinCode.trim() || !userId) return;
    const { error } = await supabase.rpc('join_circle_by_code', {
      _code: joinCode.trim(),
    });
    if (error) {
      setError(error.message);
      return;
    }
    setJoinCode('');
    await loadCircles(userId);
    flash('Joined circle!');
  };

  const acceptInvite = async (inv: PendingInvite) => {
    if (!userId) return;
    setError('');
    // Insert membership first (RLS requires the invite to still be pending),
    // then mark the invite accepted.
    const { error: memErr } = await supabase
      .from('circle_members')
      .insert({ circle_id: inv.circle_id, user_id: userId });
    if (memErr) {
      setError(memErr.message);
      return;
    }
    await supabase
      .from('circle_invites')
      .update({ status: 'accepted' })
      .eq('id', inv.id);
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    await loadCircles(userId);
    flash(`Joined ${inv.circle_name}!`);
  };

  const declineInvite = async (inv: PendingInvite) => {
    await supabase
      .from('circle_invites')
      .update({ status: 'declined' })
      .eq('id', inv.id);
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
  };

  const openCircle = async (circle: Circle) => {
    setActiveCircle(circle);
    setView('circle');
    setError('');
    setInviteEmail('');
    const { data } = await supabase
      .from('circle_members')
      .select('user_id, role, profiles(username, avatar_url)')
      .eq('circle_id', circle.id);
    if (data) {
      setMembers(
        data.map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          username: m.profiles?.username || 'Unknown',
          avatar_url: m.profiles?.avatar_url || null,
        }))
      );
    }
  };

  const handleInviteEmail = async () => {
    setError('');
    if (!inviteEmail.trim() || !activeCircle || !userId) return;
    const { error } = await supabase.from('circle_invites').insert({
      circle_id: activeCircle.id,
      invited_email: inviteEmail.trim().toLowerCase(),
      invited_by: userId,
    });
    if (error) {
      setError(
        error.message.includes('duplicate')
          ? 'That email has already been invited.'
          : error.message
      );
      return;
    }
    setInviteEmail('');
    flash('Invite sent!');
  };

  const copyInviteLink = (circle: Circle) => {
    const link = `${window.location.origin}/circles?join=${circle.join_code}`;
    navigator.clipboard?.writeText(link);
    flash('Invite link copied!');
  };

  const leaveCircle = async (circle: Circle) => {
    if (!userId) return;
    await supabase
      .from('circle_members')
      .delete()
      .eq('circle_id', circle.id)
      .eq('user_id', userId);
    setView('list');
    setActiveCircle(null);
    await loadCircles(userId);
    flash('Left circle.');
  };

  const deleteCircle = async (circle: Circle) => {
    if (!userId) return;
    await supabase.from('circles').delete().eq('id', circle.id);
    setView('list');
    setActiveCircle(null);
    await loadCircles(userId);
    flash('Circle deleted.');
  };

  const removeMember = async (member: Member) => {
    if (!activeCircle) return;
    await supabase
      .from('circle_members')
      .delete()
      .eq('circle_id', activeCircle.id)
      .eq('user_id', member.user_id);
    setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
  };

  const openMember = async (member: Member) => {
    setActiveMember(member);
    setView('member');
    setLogsLoading(true);
    setMemberLogs([]);
    const { data } = await supabase
      .from('workout_logs')
      .select('id, weight_kg, reps, logged_at, exercises(name)')
      .eq('user_id', member.user_id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setMemberLogs(data as any);
    setLogsLoading(false);
  };

  // Handle ?join=CODE deep links from invite links.
  useEffect(() => {
    if (loading || !userId) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      (async () => {
        const { error } = await supabase.rpc('join_circle_by_code', { _code: code });
        if (!error) {
          await loadCircles(userId);
          flash('Joined circle!');
        } else {
          setError(error.message);
        }
        window.history.replaceState({}, '', '/circles');
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const isOwner = activeCircle && activeCircle.owner_id === userId;

  // ---------------- MEMBER LOGS VIEW ----------------
  if (view === 'member' && activeMember) {
    const grouped = memberLogs.reduce((acc: Record<string, MemberLog[]>, log) => {
      (acc[log.logged_at] = acc[log.logged_at] || []).push(log);
      return acc;
    }, {});

    return (
      <div className="animate-fade-in-up">
        <button className="btn-secondary" style={{ marginBottom: 20 }} onClick={() => setView('circle')}>
          <ArrowLeft size={16} /> Back to {activeCircle?.name}
        </button>

        <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {activeMember.avatar_url ? (
            <img src={activeMember.avatar_url} alt="" className="avatar" style={{ width: 48, height: 48 }} />
          ) : (
            <div className="avatar-placeholder" style={{ width: 48, height: 48, fontSize: 18 }}>
              {activeMember.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1>{activeMember.username}</h1>
            <p>Workout history</p>
          </div>
        </div>

        {logsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : memberLogs.length === 0 ? (
          <div className="card empty-state">
            <Dumbbell size={48} />
            <h3>No logs yet</h3>
            <p>{activeMember.username} hasn&apos;t logged any workouts.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, dateLogs]) => (
            <div key={date} style={{ marginBottom: 20 }} className="animate-fade-in">
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Exercise</th><th>Weight</th><th>Reps</th></tr>
                  </thead>
                  <tbody>
                    {dateLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontWeight: 500 }}>{log.exercises?.name}</td>
                        <td><span className="badge badge-cyan">{log.weight_kg} kg</span></td>
                        <td><span className="badge badge-purple">{log.reps} reps</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ---------------- CIRCLE DETAIL VIEW ----------------
  if (view === 'circle' && activeCircle) {
    return (
      <div className="animate-fade-in-up">
        <button className="btn-secondary" style={{ marginBottom: 20 }} onClick={() => { setView('list'); setActiveCircle(null); }}>
          <ArrowLeft size={16} /> All Circles
        </button>

        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={26} style={{ color: 'var(--accent-cyan)' }} /> {activeCircle.name}
            </h1>
            <p>{members.length} member{members.length === 1 ? '' : 's'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => copyInviteLink(activeCircle)}>
              <LinkIcon size={16} /> Copy link
            </button>
            {isOwner ? (
              <button className="btn-danger" onClick={() => deleteCircle(activeCircle)}>
                <Trash2 size={16} /> Delete
              </button>
            ) : (
              <button className="btn-danger" onClick={() => leaveCircle(activeCircle)}>
                <LogOut size={16} /> Leave
              </button>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="card" style={{ marginBottom: 24, maxWidth: 560 }}>
            <label className="label">Invite by email</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="input"
                  style={{ paddingLeft: 36 }}
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <button className="btn-primary" onClick={handleInviteEmail} style={{ whiteSpace: 'nowrap' }}>
                <Plus size={16} /> Invite
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              They&apos;ll see a pending invite in their Circles tab. Or share the join code:{' '}
              <span style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{activeCircle.join_code}</span>
            </p>
          </div>
        )}

        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
        {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Members</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Athlete</th><th>Role</th><th style={{ width: 60 }}></th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} style={{ cursor: 'pointer' }} onClick={() => openMember(m)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="avatar" style={{ width: 32, height: 32 }} />
                      ) : (
                        <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                          {m.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontWeight: 500 }}>{m.username}</span>
                    </div>
                  </td>
                  <td>
                    {m.role === 'owner' ? (
                      <span className="badge badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Crown size={12} /> Owner
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Member</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {isOwner && m.user_id !== userId && (
                      <button className="btn-danger" style={{ padding: '6px 8px' }} onClick={() => removeMember(m)}>
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Tip: click a member to view their workout logs.
        </p>
      </div>
    );
  }

  // ---------------- LIST VIEW ----------------
  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1>Circles</h1>
        <p>Train together — create a circle and invite your friends</p>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--accent-purple)' }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={14} style={{ color: 'var(--accent-purple)' }} /> Pending Invites
          </h3>
          {invites.map((inv) => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 500 }}>{inv.circle_name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ padding: '6px 12px' }} onClick={() => acceptInvite(inv)}>
                  <Check size={14} /> Accept
                </button>
                <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={() => declineInvite(inv)}>
                  <X size={14} /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create + Join */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <label className="label">Create a circle</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="e.g. Gym Bros"
              value={newCircleName}
              onChange={(e) => setNewCircleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCircle()}
            />
            <button className="btn-primary" onClick={handleCreateCircle} style={{ whiteSpace: 'nowrap' }}>
              <Plus size={16} /> Create
            </button>
          </div>
        </div>
        <div className="card">
          <label className="label">Join with a code</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Enter invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
            />
            <button className="btn-secondary" onClick={handleJoinByCode} style={{ whiteSpace: 'nowrap' }}>
              <LinkIcon size={16} /> Join
            </button>
          </div>
        </div>
      </div>

      {/* Circle list */}
      {circles.length === 0 ? (
        <div className="card empty-state">
          <Users size={48} />
          <h3>No circles yet</h3>
          <p>Create your first circle above, or join one with an invite code.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          {circles.map((c) => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openCircle(c)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div className="avatar-placeholder" style={{ width: 40, height: 40, fontSize: 16, background: 'rgba(0,245,255,0.1)', color: 'var(--accent-cyan)' }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                  {c.owner_id === userId && (
                    <span className="badge badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Crown size={11} /> Owner
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
