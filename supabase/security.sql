-- =============================================================
-- WeightUp — Security / privacy hardening migration
-- Run in the Supabase SQL Editor AFTER schema.sql, circles.sql,
-- social.sql, splits.sql (it depends on public.shares_circle from
-- circles.sql). Safe to re-run.
--
-- Why: the app is a client-only Supabase app, so the public anon key
-- ships in every browser and Postgres RLS is the ONLY access control.
-- This migration closes the gaps where that gate was left open.
-- =============================================================

-- ===================== SCHEMA DRIFT FIX =====================
-- `is_in_recovery` is used by the app (profile + circle recovery badge)
-- but was previously added by hand in the dashboard and never captured
-- in a migration. Add it here so the repo matches production.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_in_recovery BOOLEAN NOT NULL DEFAULT false;

-- ===================== HIGH: lock down profiles =====================
-- BEFORE: `USING (true)` exposed every profile — username, avatar_url,
-- id (= auth.users id), height_cm, is_in_recovery — to the *anon* role.
-- Anyone with the public anon key could scrape the entire user base
-- unauthenticated.
--
-- AFTER: only authenticated users, and only their own profile or the
-- profiles of people they share a circle with. This keeps every in-app
-- surface working (feeds, leaderboards, member lists, the profile modal
-- all operate on circle co-members) while killing anonymous scraping.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles viewable by self or circle members" ON profiles;
CREATE POLICY "Profiles viewable by self or circle members"
  ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_circle(auth.uid(), id)
  );

-- ===================== MEDIUM: restrict exercises inserts ============
-- BEFORE: any authenticated user could insert ANY row into the shared,
-- globally-readable `exercises` table (is_custom defaulted to false),
-- allowing pollution/spoofing of the official exercise list.
--
-- AFTER: authenticated users may only add their own *custom* exercises.
-- Seed/official rows (is_custom = false) are inserted by the SQL editor
-- as table owner, which bypasses RLS, so seeding still works.
DROP POLICY IF EXISTS "Authenticated users can insert exercises" ON exercises;
DROP POLICY IF EXISTS "Users can insert their own custom exercises" ON exercises;
CREATE POLICY "Users can insert their own custom exercises"
  ON exercises FOR INSERT TO authenticated
  WITH CHECK (
    is_custom = true
    AND created_by = auth.uid()
  );

-- =============================================================
-- NOTE (not fixable in SQL): because the anon key is public and RLS is
-- the whole defense, there is no margin for a weak policy. For anything
-- more sensitive than the above, prefer a Supabase Edge Function / server
-- route holding the service_role key server-side rather than widening a
-- client-reachable policy. The service_role key must never be committed
-- or placed in a NEXT_PUBLIC_* variable.
-- =============================================================
