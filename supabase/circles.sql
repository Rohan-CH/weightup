-- =============================================================
-- WeightUp — Circles feature migration
-- Run this in the Supabase SQL Editor AFTER schema.sql
-- Adds: circles, circle_members, circle_invites,
--       helper functions, RLS, join-by-code RPC, and
--       circle-member-only visibility for workout_logs.
-- =============================================================

-- ===================== TABLES =====================
CREATE TABLE IF NOT EXISTS circles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  join_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS circle_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (circle_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON circle_members(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_invites_email ON circle_invites(lower(invited_email));

-- ===================== HELPER FUNCTIONS =====================
-- SECURITY DEFINER functions bypass RLS internally, which prevents
-- infinite recursion when a table's policy needs to query itself.

CREATE OR REPLACE FUNCTION public.is_circle_member(_circle UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = _circle AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_circle_owner(_circle UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM circles WHERE id = _circle AND owner_id = _user
  );
$$;

-- Do two users share at least one circle?
CREATE OR REPLACE FUNCTION public.shares_circle(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM circle_members m1
    JOIN circle_members m2 ON m1.circle_id = m2.circle_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

-- Does a pending invite exist for this email on this circle?
CREATE OR REPLACE FUNCTION public.has_pending_invite(_circle UUID, _email TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_invites
    WHERE circle_id = _circle
      AND lower(invited_email) = lower(_email)
      AND status = 'pending'
  );
$$;

-- ===================== RLS: CIRCLES =====================
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View circles you belong to or are invited to" ON circles;
CREATE POLICY "View circles you belong to or are invited to"
  ON circles FOR SELECT USING (
    owner_id = auth.uid()
    OR public.is_circle_member(id, auth.uid())
    OR public.has_pending_invite(id, auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Users can create circles they own" ON circles;
CREATE POLICY "Users can create circles they own"
  ON circles FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update their circles" ON circles;
CREATE POLICY "Owners can update their circles"
  ON circles FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete their circles" ON circles;
CREATE POLICY "Owners can delete their circles"
  ON circles FOR DELETE USING (owner_id = auth.uid());

-- ===================== RLS: CIRCLE_MEMBERS =====================
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View members of your circles" ON circle_members;
CREATE POLICY "View members of your circles"
  ON circle_members FOR SELECT USING (
    public.is_circle_member(circle_id, auth.uid())
  );

-- Owner can add members; users can self-join via a pending invite.
DROP POLICY IF EXISTS "Add members to a circle" ON circle_members;
CREATE POLICY "Add members to a circle"
  ON circle_members FOR INSERT WITH CHECK (
    public.is_circle_owner(circle_id, auth.uid())
    OR (
      user_id = auth.uid()
      AND public.has_pending_invite(circle_id, auth.jwt() ->> 'email')
    )
  );

-- A member can leave; an owner can remove members.
DROP POLICY IF EXISTS "Leave or remove from a circle" ON circle_members;
CREATE POLICY "Leave or remove from a circle"
  ON circle_members FOR DELETE USING (
    user_id = auth.uid()
    OR public.is_circle_owner(circle_id, auth.uid())
  );

-- ===================== RLS: CIRCLE_INVITES =====================
ALTER TABLE circle_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View invites you sent or received" ON circle_invites;
CREATE POLICY "View invites you sent or received"
  ON circle_invites FOR SELECT USING (
    invited_by = auth.uid()
    OR public.is_circle_owner(circle_id, auth.uid())
    OR lower(invited_email) = lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Owners can create invites" ON circle_invites;
CREATE POLICY "Owners can create invites"
  ON circle_invites FOR INSERT WITH CHECK (
    public.is_circle_owner(circle_id, auth.uid())
    AND invited_by = auth.uid()
  );

-- Invitee can accept/decline (update status); owner can manage.
DROP POLICY IF EXISTS "Respond to or manage invites" ON circle_invites;
CREATE POLICY "Respond to or manage invites"
  ON circle_invites FOR UPDATE USING (
    lower(invited_email) = lower(auth.jwt() ->> 'email')
    OR public.is_circle_owner(circle_id, auth.uid())
  );

DROP POLICY IF EXISTS "Owners or inviters can delete invites" ON circle_invites;
CREATE POLICY "Owners or inviters can delete invites"
  ON circle_invites FOR DELETE USING (
    invited_by = auth.uid()
    OR public.is_circle_owner(circle_id, auth.uid())
  );

-- ===================== JOIN BY CODE RPC =====================
CREATE OR REPLACE FUNCTION public.join_circle_by_code(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid UUID;
BEGIN
  SELECT id INTO _cid FROM circles WHERE join_code = _code;
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  INSERT INTO circle_members (circle_id, user_id)
  VALUES (_cid, auth.uid())
  ON CONFLICT (circle_id, user_id) DO NOTHING;
  RETURN _cid;
END;
$$;

-- Auto-add the creator as an owner-member of their new circle.
CREATE OR REPLACE FUNCTION public.handle_new_circle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (circle_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_circle_created ON circles;
CREATE TRIGGER on_circle_created
  AFTER INSERT ON circles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_circle();

-- ===================== UPDATE WORKOUT_LOGS VISIBILITY =====================
-- Remove the old fully-public leaderboard policy and the own-only policy,
-- replacing them with: you can read your own logs OR the logs of anyone
-- who shares a circle with you.
DROP POLICY IF EXISTS "All logs viewable for leaderboard" ON workout_logs;
DROP POLICY IF EXISTS "Users can view their own logs" ON workout_logs;

CREATE POLICY "View own logs or circle members' logs"
  ON workout_logs FOR SELECT USING (
    auth.uid() = user_id
    OR public.shares_circle(auth.uid(), user_id)
  );
