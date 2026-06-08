-- =============================================================
-- WeightUp — Splits feature migration
-- Run in the Supabase SQL Editor AFTER schema.sql, circles.sql, social.sql
-- Adds: splits, split_days, split_day_muscles, user_splits,
--       user_split_day_exercises, RLS, and seed data for 4 defaults.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
-- =============================================================

-- ===================== TABLES =====================

-- Master split definitions
CREATE TABLE IF NOT EXISTS splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT,           -- e.g. '3 days/week'
  best_for TEXT,            -- e.g. 'Beginners'
  advantage TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ordered days within a split
CREATE TABLE IF NOT EXISTS split_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- e.g. 'Push', 'Upper Body'
  day_order INTEGER NOT NULL,   -- 1-based ordering
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (split_id, day_order)
);

-- Target muscle groups per split day
CREATE TABLE IF NOT EXISTS split_day_muscles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_day_id UUID NOT NULL REFERENCES split_days(id) ON DELETE CASCADE,
  muscle_key TEXT NOT NULL,     -- matches MuscleKey from muscle-utils.ts
  UNIQUE (split_day_id, muscle_key)
);

-- Which split a user is currently following
CREATE TABLE IF NOT EXISTS user_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  split_id UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, split_id)
);

-- Exercises a user assigns to a specific split day
CREATE TABLE IF NOT EXISTS user_split_day_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  split_day_id UUID NOT NULL REFERENCES split_days(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  exercise_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, split_day_id, exercise_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_split_days_split ON split_days(split_id);
CREATE INDEX IF NOT EXISTS idx_split_day_muscles_day ON split_day_muscles(split_day_id);
CREATE INDEX IF NOT EXISTS idx_user_splits_user ON user_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_splits_split ON user_splits(split_id);
CREATE INDEX IF NOT EXISTS idx_user_split_day_exercises_user ON user_split_day_exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_user_split_day_exercises_day ON user_split_day_exercises(split_day_id);

-- ===================== RLS =====================

-- splits
ALTER TABLE splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View default splits or own custom splits" ON splits;
CREATE POLICY "View default splits or own custom splits"
  ON splits FOR SELECT USING (
    is_default = true
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create custom splits" ON splits;
CREATE POLICY "Users can create custom splits"
  ON splits FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_default = false
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update their custom splits" ON splits;
CREATE POLICY "Users can update their custom splits"
  ON splits FOR UPDATE USING (
    is_default = false AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can delete their custom splits" ON splits;
CREATE POLICY "Users can delete their custom splits"
  ON splits FOR DELETE USING (
    is_default = false AND created_by = auth.uid()
  );

-- split_days
ALTER TABLE split_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View days of visible splits" ON split_days;
CREATE POLICY "View days of visible splits"
  ON split_days FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM splits s
      WHERE s.id = split_id
        AND (s.is_default = true OR s.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Manage days of own custom splits" ON split_days;
CREATE POLICY "Manage days of own custom splits"
  ON split_days FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM splits s
      WHERE s.id = split_id
        AND s.is_default = false
        AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update days of own custom splits" ON split_days;
CREATE POLICY "Update days of own custom splits"
  ON split_days FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM splits s
      WHERE s.id = split_id
        AND s.is_default = false
        AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Delete days of own custom splits" ON split_days;
CREATE POLICY "Delete days of own custom splits"
  ON split_days FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM splits s
      WHERE s.id = split_id
        AND s.is_default = false
        AND s.created_by = auth.uid()
    )
  );

-- split_day_muscles
ALTER TABLE split_day_muscles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View muscles of visible split days" ON split_day_muscles;
CREATE POLICY "View muscles of visible split days"
  ON split_day_muscles FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_days sd
      JOIN splits s ON s.id = sd.split_id
      WHERE sd.id = split_day_id
        AND (s.is_default = true OR s.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Manage muscles of own custom split days" ON split_day_muscles;
CREATE POLICY "Manage muscles of own custom split days"
  ON split_day_muscles FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM split_days sd
      JOIN splits s ON s.id = sd.split_id
      WHERE sd.id = split_day_id
        AND s.is_default = false
        AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Delete muscles of own custom split days" ON split_day_muscles;
CREATE POLICY "Delete muscles of own custom split days"
  ON split_day_muscles FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM split_days sd
      JOIN splits s ON s.id = sd.split_id
      WHERE sd.id = split_day_id
        AND s.is_default = false
        AND s.created_by = auth.uid()
    )
  );

-- user_splits
ALTER TABLE user_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own split selections" ON user_splits;
CREATE POLICY "View own split selections"
  ON user_splits FOR SELECT USING (user_id = auth.uid());

-- Allow seeing other users' active splits (for circle bubble display)
DROP POLICY IF EXISTS "View circle members split selections" ON user_splits;
CREATE POLICY "View circle members split selections"
  ON user_splits FOR SELECT USING (
    public.shares_circle(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "Users can set their split" ON user_splits;
CREATE POLICY "Users can set their split"
  ON user_splits FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their split" ON user_splits;
CREATE POLICY "Users can update their split"
  ON user_splits FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove their split" ON user_splits;
CREATE POLICY "Users can remove their split"
  ON user_splits FOR DELETE USING (user_id = auth.uid());

-- user_split_day_exercises
ALTER TABLE user_split_day_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own split day exercises" ON user_split_day_exercises;
CREATE POLICY "View own split day exercises"
  ON user_split_day_exercises FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add exercises to split days" ON user_split_day_exercises;
CREATE POLICY "Users can add exercises to split days"
  ON user_split_day_exercises FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their split day exercises" ON user_split_day_exercises;
CREATE POLICY "Users can update their split day exercises"
  ON user_split_day_exercises FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove exercises from split days" ON user_split_day_exercises;
CREATE POLICY "Users can remove exercises from split days"
  ON user_split_day_exercises FOR DELETE USING (user_id = auth.uid());

-- ===================== SEED: DEFAULT SPLITS =====================

-- 1. Full Body Split
INSERT INTO splits (id, name, description, frequency, best_for, advantage, is_default)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Full Body Split',
  'Train all your major muscle groups (chest, back, legs, shoulders, and arms) in a single session, relying heavily on compound movements like squats, deadlifts, and presses.',
  '2–3 days/week',
  'Beginners building a foundation, athletes, or anyone with a busy schedule who can only make it to the gym a few days a week.',
  'High frequency of hitting each muscle group (great for skill acquisition in new lifters) and maximum schedule flexibility.'
, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO split_days (id, split_id, name, day_order) VALUES
  ('a1000001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Full Body A', 1),
  ('a1000001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 'Full Body B', 2),
  ('a1000001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 'Full Body C', 3)
ON CONFLICT (split_id, day_order) DO NOTHING;

INSERT INTO split_day_muscles (split_day_id, muscle_key) VALUES
  -- Day A
  ('a1000001-0001-0001-0001-000000000001', 'chest'),
  ('a1000001-0001-0001-0001-000000000001', 'quads'),
  ('a1000001-0001-0001-0001-000000000001', 'lats'),
  ('a1000001-0001-0001-0001-000000000001', 'front_delts'),
  ('a1000001-0001-0001-0001-000000000001', 'biceps'),
  ('a1000001-0001-0001-0001-000000000001', 'abs'),
  -- Day B
  ('a1000001-0001-0001-0001-000000000002', 'hamstrings'),
  ('a1000001-0001-0001-0001-000000000002', 'glutes'),
  ('a1000001-0001-0001-0001-000000000002', 'upper_back'),
  ('a1000001-0001-0001-0001-000000000002', 'side_delts'),
  ('a1000001-0001-0001-0001-000000000002', 'triceps'),
  ('a1000001-0001-0001-0001-000000000002', 'calves'),
  -- Day C
  ('a1000001-0001-0001-0001-000000000003', 'chest'),
  ('a1000001-0001-0001-0001-000000000003', 'quads'),
  ('a1000001-0001-0001-0001-000000000003', 'hamstrings'),
  ('a1000001-0001-0001-0001-000000000003', 'lats'),
  ('a1000001-0001-0001-0001-000000000003', 'front_delts'),
  ('a1000001-0001-0001-0001-000000000003', 'lower_back')
ON CONFLICT (split_day_id, muscle_key) DO NOTHING;

-- 2. Upper/Lower Split
INSERT INTO splits (id, name, description, frequency, best_for, advantage, is_default)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Upper / Lower Split',
  'Divides your body in half. On one day, train your upper body (chest, back, shoulders, arms). On the next, hit lower body (quads, hamstrings, glutes, calves, and core).',
  '4 days/week',
  'Intermediate lifters looking to step up their volume from a full-body routine.',
  'Excellent balance between training frequency and recovery time, allowing you to hit every muscle group twice a week while giving your CNS a break.'
, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO split_days (id, split_id, name, day_order) VALUES
  ('a2000001-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Upper Body A', 1),
  ('a2000001-0001-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'Lower Body A', 2),
  ('a2000001-0001-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222', 'Upper Body B', 3),
  ('a2000001-0001-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222', 'Lower Body B', 4)
ON CONFLICT (split_id, day_order) DO NOTHING;

INSERT INTO split_day_muscles (split_day_id, muscle_key) VALUES
  -- Upper A
  ('a2000001-0001-0001-0001-000000000001', 'chest'),
  ('a2000001-0001-0001-0001-000000000001', 'lats'),
  ('a2000001-0001-0001-0001-000000000001', 'front_delts'),
  ('a2000001-0001-0001-0001-000000000001', 'side_delts'),
  ('a2000001-0001-0001-0001-000000000001', 'biceps'),
  ('a2000001-0001-0001-0001-000000000001', 'triceps'),
  -- Lower A
  ('a2000001-0001-0001-0001-000000000002', 'quads'),
  ('a2000001-0001-0001-0001-000000000002', 'hamstrings'),
  ('a2000001-0001-0001-0001-000000000002', 'glutes'),
  ('a2000001-0001-0001-0001-000000000002', 'calves'),
  ('a2000001-0001-0001-0001-000000000002', 'abs'),
  -- Upper B
  ('a2000001-0001-0001-0001-000000000003', 'chest'),
  ('a2000001-0001-0001-0001-000000000003', 'upper_back'),
  ('a2000001-0001-0001-0001-000000000003', 'rear_delts'),
  ('a2000001-0001-0001-0001-000000000003', 'traps'),
  ('a2000001-0001-0001-0001-000000000003', 'biceps'),
  ('a2000001-0001-0001-0001-000000000003', 'triceps'),
  -- Lower B
  ('a2000001-0001-0001-0001-000000000004', 'quads'),
  ('a2000001-0001-0001-0001-000000000004', 'hamstrings'),
  ('a2000001-0001-0001-0001-000000000004', 'glutes'),
  ('a2000001-0001-0001-0001-000000000004', 'calves'),
  ('a2000001-0001-0001-0001-000000000004', 'lower_back')
ON CONFLICT (split_day_id, muscle_key) DO NOTHING;

-- 3. Push/Pull/Legs (PPL) Split
INSERT INTO splits (id, name, description, frequency, best_for, advantage, is_default)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Push / Pull / Legs',
  'Divides the body by movement pattern: Push (chest, shoulders, triceps), Pull (back, biceps, rear delts), and Legs (all lower body muscles).',
  '6 days/week',
  'Intermediate to advanced lifters who want to maximize hypertrophy and can handle a high-volume, high-frequency schedule.',
  'Pushing and pulling muscles work independently, so you can train consecutive days without muscle overlap, minimizing fatigue from the previous session.'
, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO split_days (id, split_id, name, day_order) VALUES
  ('a3000001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', 'Push', 1),
  ('a3000001-0001-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', 'Pull', 2),
  ('a3000001-0001-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', 'Legs', 3)
ON CONFLICT (split_id, day_order) DO NOTHING;

INSERT INTO split_day_muscles (split_day_id, muscle_key) VALUES
  -- Push
  ('a3000001-0001-0001-0001-000000000001', 'chest'),
  ('a3000001-0001-0001-0001-000000000001', 'front_delts'),
  ('a3000001-0001-0001-0001-000000000001', 'side_delts'),
  ('a3000001-0001-0001-0001-000000000001', 'triceps'),
  -- Pull
  ('a3000001-0001-0001-0001-000000000002', 'lats'),
  ('a3000001-0001-0001-0001-000000000002', 'upper_back'),
  ('a3000001-0001-0001-0001-000000000002', 'traps'),
  ('a3000001-0001-0001-0001-000000000002', 'rear_delts'),
  ('a3000001-0001-0001-0001-000000000002', 'biceps'),
  ('a3000001-0001-0001-0001-000000000002', 'forearms'),
  -- Legs
  ('a3000001-0001-0001-0001-000000000003', 'quads'),
  ('a3000001-0001-0001-0001-000000000003', 'hamstrings'),
  ('a3000001-0001-0001-0001-000000000003', 'glutes'),
  ('a3000001-0001-0001-0001-000000000003', 'calves'),
  ('a3000001-0001-0001-0001-000000000003', 'abs'),
  ('a3000001-0001-0001-0001-000000000003', 'lower_back')
ON CONFLICT (split_day_id, muscle_key) DO NOTHING;

-- 4. Body Part Split (Bro Split)
INSERT INTO splits (id, name, description, frequency, best_for, advantage, is_default)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'Body Part Split',
  'The traditional bodybuilding approach where you dedicate an entire workout to isolating just one or two specific muscle groups (e.g., Chest Day, Back Day, Leg Day, Shoulder Day, Arm Day).',
  '5 days/week',
  'Advanced bodybuilders who need massive amounts of volume to trigger growth in a specific muscle, or people who enjoy intense, focused pumps.',
  'Extreme volume and focus on individual muscles, ensuring you can hit a muscle from every possible angle before giving it a full week to recover.'
, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO split_days (id, split_id, name, day_order) VALUES
  ('a4000001-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', 'Chest Day', 1),
  ('a4000001-0001-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', 'Back Day', 2),
  ('a4000001-0001-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', 'Leg Day', 3),
  ('a4000001-0001-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', 'Shoulder Day', 4),
  ('a4000001-0001-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', 'Arm Day', 5)
ON CONFLICT (split_id, day_order) DO NOTHING;

INSERT INTO split_day_muscles (split_day_id, muscle_key) VALUES
  -- Chest Day
  ('a4000001-0001-0001-0001-000000000001', 'chest'),
  ('a4000001-0001-0001-0001-000000000001', 'front_delts'),
  ('a4000001-0001-0001-0001-000000000001', 'triceps'),
  -- Back Day
  ('a4000001-0001-0001-0001-000000000002', 'lats'),
  ('a4000001-0001-0001-0001-000000000002', 'upper_back'),
  ('a4000001-0001-0001-0001-000000000002', 'traps'),
  ('a4000001-0001-0001-0001-000000000002', 'rear_delts'),
  ('a4000001-0001-0001-0001-000000000002', 'lower_back'),
  -- Leg Day
  ('a4000001-0001-0001-0001-000000000003', 'quads'),
  ('a4000001-0001-0001-0001-000000000003', 'hamstrings'),
  ('a4000001-0001-0001-0001-000000000003', 'glutes'),
  ('a4000001-0001-0001-0001-000000000003', 'calves'),
  -- Shoulder Day
  ('a4000001-0001-0001-0001-000000000004', 'front_delts'),
  ('a4000001-0001-0001-0001-000000000004', 'side_delts'),
  ('a4000001-0001-0001-0001-000000000004', 'rear_delts'),
  ('a4000001-0001-0001-0001-000000000004', 'traps'),
  -- Arm Day
  ('a4000001-0001-0001-0001-000000000005', 'biceps'),
  ('a4000001-0001-0001-0001-000000000005', 'triceps'),
  ('a4000001-0001-0001-0001-000000000005', 'forearms')
ON CONFLICT (split_day_id, muscle_key) DO NOTHING;
