# **Product Requirements Document (PRD): RetroFit**
*Revision 2 — repairs schema bugs, adds RLS, security constraints, and closes feasibility gaps flagged in review.*

## **1. Executive Summary & Overview**

**RetroFit** is an 8-bit SNES RPG-themed, dark-mode Progressive Web App (PWA) designed for personal calorie and macro tracking. Built with high-contrast pixel aesthetics, modern UI ergonomics, and offline-first data sync, RetroFit delivers a seamless experience for daily macro logging, weight tracking, AI-assisted meal scanning, and barcode lookups.

## **2. Tech Stack & Infrastructure**

| Layer | Technology | Description |
| :---- | :---- | :---- |
| **Frontend** | Next.js (App Router, React 19) | React framework with TypeScript and Server Actions. |
| **Styling** | Tailwind CSS + Lucide Icons | Retro SNES borders (pixelated), custom pixel color palette, modern typography. |
| **Database & Auth** | Supabase | PostgreSQL database, Supabase Auth (Sign-up disabled; Single-Admin), Row Level Security enforced on every table. |
| **Local Storage** | IndexedDB (dexie.js) | Offline-first data caching and sync manager. Schema versioned via Dexie's `.version()` API from day one. |
| **Deployment** | Vercel | Automatic deployments, Edge API routes, serverless background execution. |
| **AI Vision API** | OpenRouter (google/gemini-2.0-flash-exp:free) | AI multi-modal estimation of calories and macros from photo uploads. **Called only from a Server Action — the OpenRouter API key must never reach the client bundle.** |
| **Food Database** | Open Food Facts API | Free open-source food and barcode lookup database. |
| **PWA & Push** | Service Workers + Web Push API | Offline caching, home screen installation, push-based notification delivery (see Module 9 for why local-only scheduling was replaced). |

## **3. Database Schema (Supabase PostgreSQL & IndexedDB Sync Model)**

> **Fix applied:** the original schema called `gen_random_id()`, which is not a real Postgres function and would fail on table creation. All tables below use `gen_random_uuid()`, which requires the `pgcrypto` extension.

```sql
-- Run once, before creating any table below
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### **3.1. Database Tables**

#### **profiles**

```sql
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
```

> Added `CHECK` bounds on age/height/weight/targets so the onboarding wizard can't silently write nonsense data (e.g. a mistyped age of 900) that then corrupts the TDEE calculation.

#### **logged_meals**

```sql
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
```

> Added `client_id UUID UNIQUE` — see Module 2 for why offline-created rows need a client-generated ID before they've synced.

#### **weight_logs**

```sql
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
```

> **Fix applied:** original `UNIQUE` was on `logged_date` alone, which — combined with the FK to `profiles` — only worked because this is a single-admin app. Made it `UNIQUE (user_id, logged_date)` so the constraint expresses its actual intent (one weigh-in per user per day) and won't break if the app ever supports more than one profile.

#### **custom_foods**

```sql
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
```

> Added a `UNIQUE (user_id, barcode)` constraint — it was a lookup key with no uniqueness guarantee before, which would let duplicate barcode entries pile up.

### **3.2. Storage bucket for scanned meal images**

`logged_meals.image_url` had no corresponding storage policy in the original doc. Add:

```sql
-- Create a private bucket named 'meal-images' in Supabase Storage, then:
CREATE POLICY "meal_images_owner_access" ON storage.objects
  FOR ALL USING (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Upload path convention: `{user_id}/{meal_id}.jpg`, so the policy above scopes access correctly.

## **4. Feature Specifications & Requirements**

### **Module 1: Authentication, Onboarding & User Settings**

* **Access Control:** Public self-registration disabled via Supabase Auth settings. Account pre-seeded via Supabase Console.
* **Session Management:** Secure JWT session persistence via `@supabase/ssr` cookies in Next.js Middleware.
* **Offline Auth State:** App retains authenticated session token locally in IndexedDB to allow offline app launches without requiring re-authentication.
  * **Security constraint:** because IndexedDB is readable by any JS running on the origin, this is only as safe as the app's XSS surface. No `dangerouslySetInnerHTML` or unsanitized rendering of AI-scan output, barcode-lookup text, or any other externally-sourced string anywhere in the app.
* **First-Time Welcome Screen & Onboarding Check:**
  * Upon initial login, system checks `profiles.has_completed_onboarding`.
  * If false, displays a pixel-art banner card: **"Welcome to RetroFit."**
  * Immediately redirects user into the **4-Step TDEE Quest Wizard** to initialize daily targets.
  * Sets `has_completed_onboarding = true` upon completion.
* **Settings Menu:** Accessible from the top header on any screen. Allows the user to:
  * Re-run the TDEE Calculator at any time.
  * Manually overwrite calorie/macro targets.
  * Manage offline sync status and push notification preferences.

### **Module 2: Offline-First Architecture & Sync Engine**

* **IndexedDB Sync Layer:** All write actions (`add_meal`, `delete_meal`, `log_weight`) execute directly against local IndexedDB (Dexie.js) for instant response.
* **Client-generated IDs:** Every record created offline gets a client-generated UUID (`client_id`) at creation time, so the UI has a stable ID to key off before the row has ever reached the server. On sync, the server row is created with this same value stored in `client_id` (see `logged_meals` schema above), so a retried sync doesn't create a duplicate.
* **Sync Queue:** A background sync queue detects `navigator.onLine`. When online, unsynced queue entries push to Supabase via batch requests, matched against `client_id` for idempotency.
* **Conflict Resolution:** Last-Write-Wins (LWW) based on server/client timestamping. Deletes take priority over concurrent edits of the same record (a delete racing an edit always results in deletion) to avoid resurrecting data the user explicitly removed.
* **Dexie schema versioning:** IndexedDB schema is defined with Dexie's `.version(1).stores({...})` from the first commit, so future schema changes go through `.version(2).stores({...}).upgrade(...)` instead of requiring a destructive local DB wipe.

### **Module 3: Home Dashboard**

* **Top Summary Card:** Pixel box showing total calories consumed against target, with neon lime progress meter.
* **Macro Progress Bars:** Color-coded progress bars for Protein (Crimson), Carbs (Amber), and Fat (Cyan) in grams.
* **Weight Trend Graph:** Embedded modern vector SVG line graph showing weekly trends wrapped in an 8-bit SNES UI frame.
* **Quick Action Row:** Fast-action pixel buttons for **+ Log Manually** modal and **📷 Scan Meal**.

### **Module 4: Calorie Tracker (Daily Logs)**

* **Date Navigation Picker:** Top controls for ← Yesterday, TODAY, Tomorrow →, and Date Picker modal.
* **Category Lists:** Meals segmented into Breakfast, Lunch, Dinner, and Snacks.
* **Inline Operations:** Touch/Click items to edit details or delete (✖).

### **Module 5: AI Meal Scan (OpenRouter Integration)**

* **Camera Viewfinder:** HTML5 MediaDevices API camera stream styled with retro green targeting reticles.
* **Server Action boundary:** The captured image is sent from the client to a Next.js Server Action, which holds the OpenRouter API key server-side and makes the request. The key is never present in client-side JS.
* **OpenRouter Vision API Request:** Server Action sends base64 image string to OpenRouter (`google/gemini-2.0-flash-exp:free`) with structured JSON schema system prompt:
  ```json
  {
    "dish_name": "String",
    "estimated_calories": "Integer",
    "protein_g": "Integer",
    "carbs_g": "Integer",
    "fat_g": "Integer",
    "confidence_score": "Float (0.0 - 1.0)"
  }
  ```
* **Failure handling:** if the free-tier model is rate-limited, times out, or returns malformed/non-JSON output, the Server Action returns a typed error to the client, which falls back to the manual logging form pre-filled with nothing (rather than silently failing or crashing the modal).
* **Confirmation Modal:** Displays scanned thumbnail image alongside pre-filled, user-editable inputs for name, calories, and macros before saving.

### **Module 6: Barcode Scanner & Food Lookup**

* **Camera Barcode Scan:** Integrated `@zxing/library` or `html5-qrcode` to decode UPC/EAN barcodes via camera stream.
* **Open Food Facts API Lookup:** Queries `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`.
* **Not-found handling:** if the barcode isn't in Open Food Facts, the form opens empty with the scanned barcode pre-filled into the `custom_foods.barcode` field, letting the user complete it manually rather than dead-ending the flow.
* **Auto-population:** Populates food name, serving size, and macro ratio into the manual logging form.

### **Module 7: TDEE Calculator & Settings Modification (4-Step Quest Wizard)**

* **Trigger:** Initiated automatically during first-time onboarding or accessed anytime via Settings.
* **Step 1:** Age & Gender selection.
* **Step 2:** Height & Weight.
* **Step 3:** Activity level modifier.
* **Step 4:** Fitness goal multiplier (Cut / Maintain / Bulk).
* **Calculation Formula — Mifflin-St Jeor Equation:**

  ```
  BMR (male)   = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(years) + 5
  BMR (female) = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(years) − 161

  TDEE = BMR × activity_multiplier
  ```
  Standard activity multipliers: sedentary ×1.2, light ×1.375, moderate ×1.55, heavy ×1.725, athlete ×1.9.

  Goal adjustment applied to TDEE: cut = TDEE − 500 kcal/day, maintain = TDEE, bulk = TDEE + 300–500 kcal/day.

  > ⚠️ The original PRD expressed this formula and its male/female offset constants as embedded images rather than text. I've transcribed the standard Mifflin-St Jeor formula above — **please confirm the +5 / −161 constants and activity multipliers against your original source before treating this as final**, since I can't guarantee the embedded image matched byte-for-byte what's written here.

* **Target Application:** Updates user targets directly in `profiles` and syncs across all screens.

### **Module 8: Weight Tracker**

* **Graphing Engine:** Modern SVG curve chart with dynamic min/max bounds and timeframe toggles (1W, 1M, 1Y).
* **Log Entry:** Daily weight logging entry form with delta calculation compared to previous entry.

### **Module 9: PWA Implementation & Notifications**

* **Web App Manifest:** Configured with `display: "standalone"`, retro pixel launcher icons, and dark background (`#121214`).
* **Service Worker:** Strategy using Network-First for API calls and Cache-First for visual assets/fonts.
* **Notification delivery — revised from the original spec:** the original doc assumed the Notifications API could reliably fire scheduled local reminders (e.g. 08:00 AM / 08:00 PM) from a service worker while the app is closed. **This isn't reliably supported** — there's no cross-browser API for arbitrary scheduled local notifications from a closed PWA (Periodic Background Sync has partial support; the old Notification Triggers proposal is effectively dead). Replaced with:
  * **Web Push** via a server-side scheduler (e.g. a Vercel Cron job hitting an API route at 08:00 and 20:00) that sends a push message to the subscribed service worker, which displays it via `ShowNotification`.
  * Requires VAPID key generation and a `push_subscriptions` table (user_id, endpoint, keys) — add this to §3 if you proceed with this approach.
  * **iOS caveat:** Web Push on installed PWAs requires iOS 16.4+ and the app must be added to the home screen — this won't work in Safari's regular browser tab. Worth confirming your target device before building this module.

## **5. Non-Functional Requirements & Performance Targets**

1. **Lighthouse Score:** target ≥90 across Performance, Accessibility, Best Practices, and PWA categories.
2. **First Input Delay (FID):** target <100ms on low-tier mobile hardware.
3. **Offline Reliability:** 100% core manual logging features functional without internet connectivity.

   > ⚠️ Same caveat as the TDEE formula: the original doc's exact Lighthouse/FID numbers were embedded as images. I've filled in conventional targets for a PWA of this kind — **confirm these against your original source** if you had specific numbers in mind.

## **6. Open Decisions Before Handing This to an Agent**

* Confirm the Mifflin-St Jeor constants and Lighthouse/FID targets above (flagged in Modules 7 and §5).
* Decide whether to build the Web Push notification path now or ship v1 without scheduled reminders and add it later — it's the single largest scope item added in this revision.
* Confirm review cadence with the agent (e.g., stop after each module for your review vs. stop only after RLS-touching changes) given the correctness bar you've held on past specs.
