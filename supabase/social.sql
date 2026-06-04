-- =============================================================
-- WeightUp — Social features migration
-- Run in the Supabase SQL Editor AFTER schema.sql and circles.sql
-- Adds: reactions, comments, notifications (+ triggers),
--       a can_see_log() helper, and renames the 'owner' role to 'admin'.
-- Safe to re-run.
-- =============================================================

-- ===================== ROLE RENAME: owner -> admin =====================
UPDATE circle_members SET role = 'admin' WHERE role = 'owner';

-- ===================== HELPER: can the current user see a log? =====================
-- You can see a log if you own it or you share a circle with its owner.
CREATE OR REPLACE FUNCTION public.can_see_log(_log UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workout_logs wl
    WHERE wl.id = _log
      AND (wl.user_id = auth.uid() OR public.shares_circle(auth.uid(), wl.user_id))
  );
$$;

-- ===================== REACTIONS =====================
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍🏽', '😮‍💨', '🙄', '😱', '🤧')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (log_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_log ON reactions(log_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View reactions on visible logs" ON reactions;
CREATE POLICY "View reactions on visible logs"
  ON reactions FOR SELECT USING (public.can_see_log(log_id));

DROP POLICY IF EXISTS "React to visible logs" ON reactions;
CREATE POLICY "React to visible logs"
  ON reactions FOR INSERT WITH CHECK (
    user_id = auth.uid() AND public.can_see_log(log_id)
  );

DROP POLICY IF EXISTS "Remove your own reactions" ON reactions;
CREATE POLICY "Remove your own reactions"
  ON reactions FOR DELETE USING (user_id = auth.uid());

-- ===================== COMMENTS =====================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_log ON comments(log_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View comments on visible logs" ON comments;
CREATE POLICY "View comments on visible logs"
  ON comments FOR SELECT USING (public.can_see_log(log_id));

DROP POLICY IF EXISTS "Comment on visible logs" ON comments;
CREATE POLICY "Comment on visible logs"
  ON comments FOR INSERT WITH CHECK (
    user_id = auth.uid() AND public.can_see_log(log_id)
  );

DROP POLICY IF EXISTS "Delete your comment or comments on your log" ON comments;
CREATE POLICY "Delete your comment or comments on your log"
  ON comments FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM workout_logs wl WHERE wl.id = log_id AND wl.user_id = auth.uid())
  );

-- ===================== NOTIFICATIONS =====================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- recipient
  type TEXT NOT NULL, -- 'reaction' | 'comment' | 'activity'
  actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,         -- who triggered it
  log_id UUID REFERENCES workout_logs(id) ON DELETE CASCADE,
  data JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read / mark-read / delete their own notifications.
-- Inserts happen only through SECURITY DEFINER triggers below (no INSERT policy).
DROP POLICY IF EXISTS "View your notifications" ON notifications;
CREATE POLICY "View your notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Update your notifications" ON notifications;
CREATE POLICY "Update your notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Delete your notifications" ON notifications;
CREATE POLICY "Delete your notifications"
  ON notifications FOR DELETE USING (user_id = auth.uid());

-- ---- Trigger: reaction -> notify the log owner ----
CREATE OR REPLACE FUNCTION public.notify_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner UUID; _ex TEXT; _w NUMERIC;
BEGIN
  SELECT wl.user_id, e.name, wl.weight_kg
    INTO _owner, _ex, _w
  FROM workout_logs wl
  JOIN exercises e ON e.id = wl.exercise_id
  WHERE wl.id = NEW.log_id;

  IF _owner IS NOT NULL AND _owner <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, actor_id, log_id, data)
    VALUES (_owner, 'reaction', NEW.user_id, NEW.log_id,
            jsonb_build_object('emoji', NEW.emoji, 'exercise', _ex, 'weight', _w));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reaction_created ON reactions;
CREATE TRIGGER on_reaction_created
  AFTER INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_reaction();

-- ---- Trigger: comment -> notify the log owner ----
CREATE OR REPLACE FUNCTION public.notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner UUID; _ex TEXT; _w NUMERIC;
BEGIN
  SELECT wl.user_id, e.name, wl.weight_kg
    INTO _owner, _ex, _w
  FROM workout_logs wl
  JOIN exercises e ON e.id = wl.exercise_id
  WHERE wl.id = NEW.log_id;

  IF _owner IS NOT NULL AND _owner <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, actor_id, log_id, data)
    VALUES (_owner, 'comment', NEW.user_id, NEW.log_id,
            jsonb_build_object('body', NEW.body, 'exercise', _ex, 'weight', _w));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_comment_created ON comments;
CREATE TRIGGER on_comment_created
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment();

-- ---- Trigger: new workout log -> notify circle co-members ----
CREATE OR REPLACE FUNCTION public.notify_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ex TEXT;
BEGIN
  SELECT name INTO _ex FROM exercises WHERE id = NEW.exercise_id;

  INSERT INTO notifications (user_id, type, actor_id, log_id, data)
  SELECT DISTINCT cm.user_id, 'activity', NEW.user_id, NEW.id,
         jsonb_build_object('exercise', _ex, 'weight', NEW.weight_kg, 'reps', NEW.reps)
  FROM circle_members cm
  WHERE cm.user_id <> NEW.user_id
    AND cm.circle_id IN (
      SELECT circle_id FROM circle_members WHERE user_id = NEW.user_id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_log_created ON workout_logs;
CREATE TRIGGER on_log_created
  AFTER INSERT ON workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_activity();
