-- Run once. Requires the pgcrypto extension for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
  age INT CHECK (age BETWEEN 13 AND 100),
  gender TEXT CHECK (gender IN ('male', 'female')),
  height_cm NUMERIC(5,2) CHECK (height_cm BETWEEN 100 AND 250),
  current_weight_kg NUMERIC(5,2) CHECK (current_weight_kg BETWEEN 30 AND 300),
  activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'heavy', 'athlete')),
  goal TEXT CHECK (goal IN ('cut', 'maintain', 'bulk')),
  daily_calorie_target INT NOT NULL DEFAULT 2000 CHECK (daily_calorie_target BETWEEN 800 AND 6000),
  protein_target_g INT NOT NULL DEFAULT 150 CHECK (protein_target_g >= 0),
  carbs_target_g INT NOT NULL DEFAULT 200 CHECK (carbs_target_g >= 0),
  fat_target_g INT NOT NULL DEFAULT 65 CHECK (fat_target_g >= 0)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TABLE public.logged_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')) NOT NULL,
  name TEXT NOT NULL,
  calories INT NOT NULL CHECK (calories >= 0),
  protein_g INT NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g INT NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g INT NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  source TEXT CHECK (source IN ('manual', 'ai_scan', 'barcode', 'custom_favorite')) DEFAULT 'manual',
  image_url TEXT,
  client_id UUID UNIQUE
);

ALTER TABLE public.logged_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logged_meals_all_own" ON public.logged_meals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
  note TEXT,
  UNIQUE (user_id, logged_date)
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weight_logs_all_own" ON public.weight_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.custom_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  serving_size TEXT,
  calories INT NOT NULL CHECK (calories >= 0),
  protein_g INT NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g INT NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g INT NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  barcode TEXT,
  UNIQUE (user_id, barcode)
);

ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_foods_all_own" ON public.custom_foods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage: create a private bucket named 'meal-images' in the Dashboard
-- (Storage → New bucket → name: meal-images → Private), then run:
CREATE POLICY "meal_images_owner_access" ON storage.objects
  FOR ALL USING (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);
