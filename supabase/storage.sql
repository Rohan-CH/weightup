-- =============================================================
-- WeightUp — Avatar storage bucket + RLS policies
-- Run this in the Supabase SQL Editor.
-- Fixes: "new row violates row-level security policy" when
-- uploading a profile picture. Safe to re-run.
-- =============================================================

-- ===================== BUCKET =====================
-- Public bucket so avatar URLs can be read by anyone (used in
-- circles, leaderboards, the activity feed, and spinning bubbles).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ===================== POLICIES on storage.objects =====================
-- Files are stored at "<user_id>/avatar.<ext>", so the first path
-- segment must match the uploader's id.

-- Anyone can view avatars (bucket is public).
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- A user can upload only into their own folder.
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user can overwrite (upsert) their own avatar.
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user can delete their own avatar.
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
