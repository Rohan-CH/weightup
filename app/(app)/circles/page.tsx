'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Pencil,
  Activity as ActivityIcon,
  Send,
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

interface FeedLog {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
}

interface Reaction {
  log_id: string;
  user_id: string;
  emoji: string;
}

interface Comment {
  id: string;
  log_id: string;
  user_id: string;
  username: string;
  body: string;
}

type View = 'list' | 'circle' | 'member';

const REACTION_EMOJIS = ['👍🏽', '😮‍💨', '🙄', '😱', '🤧'];

function CirclesPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const logParam = searchParams.get('log');

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
  const [circleTab, setCircleTab] = useState<'members' | 'activity'>('members');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // activity feed
  const [feed, setFeed] = useState<FeedLog[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [feedLoading, setFeedLoading] = useState(false);

  // member detail
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [memberLogs, setMemberLogs] = useState<MemberLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [memberReactions, setMemberReactions] = useState<Record<string, { emoji: string; count: number }[]>>({});

  // deep-link highlight (from notification click)
  const [highlightLog, setHighlightLog] = useState<string | null>(null);

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
    if (!newCircleName.trim() || !userId) return;
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
    const { error } = await supabase.rpc('join_circle_by_code', { _code: joinCode.trim() });
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
    const { error: memErr } = await supabase
      .from('circle_members')
      .insert({ circle_id: inv.circle_id, user_id: userId });
    if (memErr) {
      setError(memErr.message);
      return;
    }
    await supabase.from('circle_invites').update({ status: 'accepted' }).eq('id', inv.id);
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    await loadCircles(userId);
    flash(`Joined ${inv.circle_name}!`);
  };

  const declineInvite = async (inv: PendingInvite) => {
    await supabase.from('circle_invites').update({ status: 'declined' }).eq('id', inv.id);
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
  };

  const openCircle = async (circle: Circle) => {
    setActiveCircle(circle);
    setView('circle');
    setCircleTab('members');
    setRenaming(false);
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

  const handleRename = async () => {
    if (!activeCircle || !renameValue.trim()) return;
    const { error } = await supabase
      .from('circles')
      .update({ name: renameValue.trim() })
      .eq('id', activeCircle.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...activeCircle, name: renameValue.trim() };
    setActiveCircle(updated);
    setRenaming(false);
    if (userId) await loadCircles(userId);
    flash('Circle renamed!');
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
    await supabase.from('circle_members').delete().eq('circle_id', circle.id).eq('user_id', userId);
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
    setMemberReactions({});
    const { data } = await supabase
      .from('workout_logs')
      .select('id, weight_kg, reps, logged_at, exercises(name)')
      .eq('user_id', member.user_id)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setMemberLogs(data as any);

    // reactions on this member's logs (to orbit around the weight)
    if (data && data.length > 0) {
      const ids = (data as any[]).map((l) => l.id);
      const { data: rx } = await supabase
        .from('reactions')
        .select('log_id, emoji')
        .in('log_id', ids);
      if (rx) {
        const grouped: Record<string, Record<string, number>> = {};
        (rx as any[]).forEach((r) => {
          grouped[r.log_id] = grouped[r.log_id] || {};
          grouped[r.log_id][r.emoji] = (grouped[r.log_id][r.emoji] || 0) + 1;
        });
        const out: Record<string, { emoji: string; count: number }[]> = {};
        Object.entries(grouped).forEach(([logId, emojis]) => {
          out[logId] = Object.entries(emojis).map(([emoji, count]) => ({ emoji, count }));
        });
        setMemberReactions(out);
      }
    }
    setLogsLoading(false);
  };

  // ---- Activity feed ----
  const loadFeed = async () => {
    if (members.length === 0) { setFeed([]); return; }
    setFeedLoading(true);
    const memberIds = members.map((m) => m.user_id);

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('id, user_id, weight_kg, reps, logged_at, exercises(name), profiles(username, avatar_url)')
      .in('user_id', memberIds)
      .order('created_at', { ascending: false })
      .limit(40);

    const feedLogs: FeedLog[] = (logs || []).map((l: any) => ({
      id: l.id,
      user_id: l.user_id,
      username: l.profiles?.username || 'Unknown',
      avatar_url: l.profiles?.avatar_url || null,
      exercise_name: l.exercises?.name || 'Unknown',
      weight_kg: l.weight_kg,
      reps: l.reps,
      logged_at: l.logged_at,
    }));
    setFeed(feedLogs);

    const logIds = feedLogs.map((l) => l.id);
    if (logIds.length > 0) {
      const [{ data: rx }, { data: cm }] = await Promise.all([
        supabase.from('reactions').select('log_id, user_id, emoji').in('log_id', logIds),
        supabase
          .from('comments')
          .select('id, log_id, user_id, body, profiles(username)')
          .in('log_id', logIds)
          .order('created_at', { ascending: true }),
      ]);
      setReactions((rx as any) || []);
      setComments(
        ((cm as any) || []).map((c: any) => ({
          id: c.id,
          log_id: c.log_id,
          user_id: c.user_id,
          username: c.profiles?.username || 'Unknown',
          body: c.body,
        }))
      );
    } else {
      setReactions([]);
      setComments([]);
    }
    setFeedLoading(false);
  };

  useEffect(() => {
    if (view === 'circle' && circleTab === 'activity') loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, circleTab, members]);

  // Scroll the highlighted log into view once the feed has loaded.
  useEffect(() => {
    if (!highlightLog || feedLoading || feed.length === 0) return;
    const el = document.getElementById(`feedlog-${highlightLog}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightLog, feedLoading, feed]);

  const toggleReaction = async (logId: string, emoji: string) => {
    if (!userId) return;
    const existing = reactions.find(
      (r) => r.log_id === logId && r.user_id === userId && r.emoji === emoji
    );
    if (existing) {
      setReactions((prev) =>
        prev.filter((r) => !(r.log_id === logId && r.user_id === userId && r.emoji === emoji))
      );
      await supabase
        .from('reactions')
        .delete()
        .eq('log_id', logId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
    } else {
      setReactions((prev) => [...prev, { log_id: logId, user_id: userId, emoji }]);
      await supabase.from('reactions').insert({ log_id: logId, user_id: userId, emoji });
    }
  };

  const addComment = async (logId: string) => {
    const body = (commentDrafts[logId] || '').trim();
    if (!body || !userId) return;
    const { data, error } = await supabase
      .from('comments')
      .insert({ log_id: logId, user_id: userId, body })
      .select('id, profiles(username)')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    const myName =
      members.find((m) => m.user_id === userId)?.username ||
      (data as any)?.profiles?.username ||
      'You';
    setComments((prev) => [
      ...prev,
      { id: (data as any).id, log_id: logId, user_id: userId, username: myName, body },
    ]);
    setCommentDrafts((prev) => ({ ...prev, [logId]: '' }));
  };

  const deleteComment = async (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    await supabase.from('comments').delete().eq('id', id);
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

  // Handle ?log=ID deep links from notification clicks -> open that log's
  // circle activity feed and highlight it.
  useEffect(() => {
    if (loading || !userId || circles.length === 0) return;
    const logId = logParam;
    if (!logId) return;
    (async () => {
      const { data: log } = await supabase
        .from('workout_logs')
        .select('user_id')
        .eq('id', logId)
        .single();
      const ownerId = (log as any)?.user_id;
      if (ownerId) {
        const circleIds = circles.map((c) => c.id);
        const { data: mem } = await supabase
          .from('circle_members')
          .select('circle_id')
          .eq('user_id', ownerId)
          .in('circle_id', circleIds);
        const targetId = (mem as any)?.[0]?.circle_id;
        const target = circles.find((c) => c.id === targetId) || circles[0];
        if (target) {
          await openCircle(target);
          setCircleTab('activity');
          setHighlightLog(logId);
          setTimeout(() => setHighlightLog(null), 4000);
        }
      }
      window.history.replaceState({}, '', '/circles');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, circles, logParam]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const isAdmin = activeCircle && activeCircle.owner_id === userId;

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
            <div key={date} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Exercise</th><th>Weight</th><th>Reps</th></tr>
                  </thead>
                  <tbody>
                    {dateLogs.map((log) => {
                      const rx = memberReactions[log.id];
                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: 500 }}>{log.exercises?.name}</td>
                          <td style={{ overflow: 'visible' }}>
                            <span className="weight-orbit-host">
                              <span className="badge badge-cyan">{log.weight_kg} kg</span>
                              {rx && rx.length > 0 && (
                                <span className="orbit" aria-hidden="true">
                                  {rx.map((r, i) => {
                                    const angle = (360 / rx.length) * i;
                                    return (
                                      <span
                                        key={r.emoji}
                                        className="orbit-slot"
                                        style={{ transform: `rotate(${angle}deg) translateX(34px) rotate(${-angle}deg)` }}
                                      >
                                        <span className="orbit-emoji">{r.emoji}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              )}
                            </span>
                          </td>
                          <td><span className="badge badge-purple">{log.reps} reps</span></td>
                        </tr>
                      );
                    })}
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
          <div style={{ flex: 1, minWidth: 240 }}>
            {renaming ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 420 }}>
                <input
                  className="input"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                />
                <button className="btn-primary" onClick={handleRename}><Check size={16} /></button>
                <button className="btn-secondary" onClick={() => setRenaming(false)}><X size={16} /></button>
              </div>
            ) : (
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={26} style={{ color: 'var(--accent-cyan)' }} /> {activeCircle.name}
                {isAdmin && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={() => { setRenameValue(activeCircle.name); setRenaming(true); }}
                    aria-label="Rename circle"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </h1>
            )}
            <p>{members.length} member{members.length === 1 ? '' : 's'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => copyInviteLink(activeCircle)}>
              <LinkIcon size={16} /> Copy link
            </button>
            {isAdmin ? (
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

        {isAdmin && (
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

        {/* Sub-tabs */}
        <div className="tabs" style={{ maxWidth: 360 }}>
          <button className={`tab ${circleTab === 'members' ? 'active' : ''}`} onClick={() => setCircleTab('members')}>
            <Users size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Members
          </button>
          <button className={`tab ${circleTab === 'activity' ? 'active' : ''}`} onClick={() => setCircleTab('activity')}>
            <ActivityIcon size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Activity
          </button>
        </div>

        {circleTab === 'members' && (
          <>
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
                        {m.role === 'admin' ? (
                          <span className="badge badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Crown size={12} /> Admin
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Member</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isAdmin && m.user_id !== userId && (
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
          </>
        )}

        {circleTab === 'activity' && (
          <div>
            {feedLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner spinner-lg" />
              </div>
            ) : feed.length === 0 ? (
              <div className="card empty-state">
                <ActivityIcon size={48} />
                <h3>No activity yet</h3>
                <p>When members log workouts, they&apos;ll show up here to react and comment on.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {feed.map((log) => {
                  const logReactions = reactions.filter((r) => r.log_id === log.id);
                  const logComments = comments.filter((c) => c.log_id === log.id);
                  const highlighted = highlightLog === log.id;
                  return (
                    <div
                      key={log.id}
                      id={`feedlog-${log.id}`}
                      className="card"
                      style={highlighted ? { boxShadow: '0 0 0 2px var(--accent-cyan)', transition: 'box-shadow 0.3s' } : undefined}
                    >
                      {/* header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        {log.avatar_url ? (
                          <img src={log.avatar_url} alt="" className="avatar" style={{ width: 36, height: 36 }} />
                        ) : (
                          <div className="avatar-placeholder" style={{ width: 36, height: 36, fontSize: 14 }}>
                            {log.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{log.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {new Date(log.logged_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>{log.exercise_name}</div>
                          <div style={{ fontSize: 13 }}>
                            <span className="badge badge-cyan">{log.weight_kg} kg</span>{' '}
                            <span className="badge badge-purple">{log.reps} reps</span>
                          </div>
                        </div>
                      </div>

                      {/* reactions */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {REACTION_EMOJIS.map((emoji) => {
                          const count = logReactions.filter((r) => r.emoji === emoji).length;
                          const mine = logReactions.some((r) => r.emoji === emoji && r.user_id === userId);
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(log.id, emoji)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: 14,
                                cursor: 'pointer',
                                background: mine ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${mine ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'}`,
                                color: 'var(--text-primary)',
                                transition: 'all 0.15s',
                              }}
                            >
                              <span>{emoji}</span>
                              {count > 0 && <span style={{ fontSize: 12, fontWeight: 600 }}>{count}</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* comments */}
                      {logComments.length > 0 && (
                        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                          {logComments.map((c) => (
                            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14 }}>
                              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{c.username}</span>
                              <span style={{ flex: 1 }}>{c.body}</span>
                              {c.user_id === userId && (
                                <button
                                  onClick={() => deleteComment(c.id)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                  aria-label="Delete comment"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="input"
                          maxLength={200}
                          placeholder="Add a comment..."
                          value={commentDrafts[log.id] || ''}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [log.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && addComment(log.id)}
                        />
                        <button className="btn-primary" style={{ padding: '0 14px' }} onClick={() => addComment(log.id)}>
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
                      <Crown size={11} /> Admin
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

export default function CirclesPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <div className="spinner spinner-lg" />
        </div>
      }
    >
      <CirclesPageInner />
    </Suspense>
  );
}
