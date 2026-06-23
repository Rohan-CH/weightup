-- =============================================================
-- WeightUp — Performance optimization migration
-- Run in the Supabase SQL Editor AFTER schema.sql, circles.sql,
-- social.sql, and splits.sql. Safe to re-run (IF NOT EXISTS).
--
-- This migration is purely additive (indexes only) — it does not
-- change any data, RLS policy, or client contract, so it can be
-- applied independently of a client deploy.
--
-- NOTE: on a large production table, prefer running each statement
-- with CREATE INDEX CONCURRENTLY (outside a transaction) to avoid
-- locking writes. The IF NOT EXISTS form below is fine for beta-size
-- tables and matches the existing migration style.
-- =============================================================

-- ---- workout_logs: the hot table ----

-- Dashboard "recent global activity" filters/sorts by created_at
-- (gte 48h + order created_at desc). Previously unindexed → seq scan.
CREATE INDEX IF NOT EXISTS idx_workout_logs_created_at
  ON workout_logs (created_at DESC);

-- Circle activity feed: logs for a set of members, newest first.
-- Serves `.in('user_id', memberIds).order('created_at', desc)`.
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_created
  ON workout_logs (user_id, created_at DESC);

-- Streaks / weekly volume / muscles-week / profile: a user's logs
-- inside a trailing date window. Serves
-- `.eq('user_id', x).gte('logged_at', d)` and member streak scans.
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_logged
  ON workout_logs (user_id, logged_at);

-- Leaderboards: one exercise across many members
-- (`.eq('exercise_id', x).in('user_id', members)`). The existing
-- (user_id, exercise_id) index leads with user_id and can't serve an
-- exercise-equality probe efficiently; this one leads with exercise_id.
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise_user
  ON workout_logs (exercise_id, user_id);

-- =============================================================
-- Notification fan-out (social.sql notify_activity)
-- =============================================================
-- The trigger already does a single set-based INSERT ... SELECT (not a
-- per-member loop) and the membership lookup is covered by
-- idx_circle_members_user / idx_circle_members_circle, so query cost is
-- fine. The remaining cost is write amplification: one notifications row
-- per circle co-member, inside the log-insert transaction.
--
-- For beta scale this is acceptable. If circles grow large, move
-- notification creation out of the insert path (e.g. pg_cron batch or a
-- queue via pg_net) rather than expanding the synchronous fan-out. No
-- schema change is made here — documenting the ceiling intentionally.

-- Speeds the unread-badge count the NotificationBell polls every 60s.
-- (idx_notifications_user already covers (user_id, read, created_at);
--  this partial index makes the common "unread only" probe smaller.)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read = false;
