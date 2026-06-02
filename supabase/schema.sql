-- =============================================================
-- WeightUp Database Schema
-- Run this in Supabase SQL Editor to set up the database
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================== PROFILES =====================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===================== EXERCISES =====================
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  is_custom BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exercises are viewable by everyone" ON exercises;
CREATE POLICY "Exercises are viewable by everyone"
  ON exercises FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exercises" ON exercises;
CREATE POLICY "Authenticated users can insert exercises"
  ON exercises FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ===================== WORKOUT LOGS =====================
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  weight_kg NUMERIC(7,2) NOT NULL CHECK (weight_kg >= 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own logs" ON workout_logs;
CREATE POLICY "Users can view their own logs"
  ON workout_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own logs" ON workout_logs;
CREATE POLICY "Users can insert their own logs"
  ON workout_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own logs" ON workout_logs;
CREATE POLICY "Users can update their own logs"
  ON workout_logs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own logs" ON workout_logs;
CREATE POLICY "Users can delete their own logs"
  ON workout_logs FOR DELETE USING (auth.uid() = user_id);

-- NOTE: Cross-user log visibility (for circle leaderboards) is configured in
-- circles.sql, which replaces the "Users can view their own logs" SELECT policy
-- with a circle-members-only rule. Do NOT add a `USING (true)` policy here — it
-- would make every user's full log history public to all signed-in users.

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON workout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise_id ON workout_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_logged_at ON workout_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_exercise ON workout_logs(user_id, exercise_id);

-- ===================== SEED EXERCISES =====================
INSERT INTO exercises (name, is_custom) VALUES
  ('Deadlift', false),
  ('Flat Barbell Bench Press', false),
  ('Squat', false),
  ('Overhead Press', false),
  ('Barbell Row', false),
  ('Pull Up', false),
  ('Chin Up', false),
  ('Dumbbell Curl', false),
  ('Hammer Curl', false),
  ('Tricep Pushdown', false),
  ('Skull Crusher', false),
  ('Lateral Raise', false),
  ('Front Raise', false),
  ('Face Pull', false),
  ('Cable Fly', false),
  ('Incline Dumbbell Press', false),
  ('Dumbbell Shoulder Press', false),
  ('Leg Press', false),
  ('Leg Extension', false),
  ('Leg Curl', false),
  ('Romanian Deadlift', false),
  ('Hip Thrust', false),
  ('Calf Raise', false),
  ('Lat Pulldown', false),
  ('Seated Cable Row', false),
  ('T-Bar Row', false),
  ('Dumbbell Fly', false),
  ('Preacher Curl', false),
  ('Concentration Curl', false),
  ('Dip', false)
ON CONFLICT (name) DO NOTHING;

-- ===================== STORAGE =====================
-- Run in Supabase dashboard or via API:
-- Create a public bucket called "avatars"
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
