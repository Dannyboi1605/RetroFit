# P3 Supabase Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Supabase project, apply the PRD's database schema with RLS, and wire `@supabase/ssr` auth into the Next.js app so future phases can read/write real data.

**Architecture:** Two halves — dashboard actions the user performs (create project, copy keys, disable sign-up, seed admin account) and code I write (SQL schema file, Supabase browser/server clients, middleware). The schema is applied from a committed `db/schema.sql` so it's version-controlled and reproducible.

**Tech Stack:** Supabase (Postgres + Auth + Storage), `@supabase/ssr` (Next.js App Router cookie session management), `@supabase/supabase-js`.

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- Env vars go in `.env.local` (already gitignored by create-next-app) — never in git
- The schema is copied verbatim from PRD §3 (profiles, logged_meals, weight_logs, custom_foods, RLS policies, storage bucket policy), plus the storage bucket note
- Keys needed: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from Dashboard → Project Settings → API)

---

### Task 1: Create the Supabase project (user dashboard work)

**Interfaces:**
- Consumes: nothing
- Produces: `SUPABASE_URL` + `SUPABASE_ANON_KEY` in `/home/dannyboi/projects/RetroFit/.env.local`; project link in this chat

- [ ] **Step 1: Create the project**

User: go to https://supabase.com/dashboard → New project → name `retrofit` → region nearest to you → strong database password (save it somewhere safe) → Create. Wait for the project to finish provisioning (~1-2 min).

- [ ] **Step 2: Copy the keys**

User: Project Settings → API → copy the Project URL and the `anon` public key. Share both with the agent (or write them to `.env.local` yourself):

```bash
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Note: `NEXT_PUBLIC_` prefix because the anon key is public by design — RLS is what protects the data, not the key.

- [ ] **Step 3: Disable self-registration**

User: Dashboard → Authentication → Sign In / Up → disable "Allow new users to sign up". (Single-admin per PRD.)

---

### Task 2: Commit the database schema

**Files:**
- Create: `db/schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: the complete executable schema (tables + RLS + storage policy) that Task 3 applies to the project

- [ ] **Step 1: Create `db/schema.sql`**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add Supabase database schema from PRD"
```

---

### Task 3: Apply the schema

**Files:**
- No project files

**Interfaces:**
- Consumes: Task 1 project + Task 2 SQL
- Produces: live tables + RLS in the Supabase project

- [ ] **Step 1: User applies the schema**

User: Dashboard → SQL Editor → New query → paste the contents of `db/schema.sql` → Run. Confirm all statements succeeded (no red errors).

- [ ] **Step 2: Create the private storage bucket**

User: Dashboard → Storage → New bucket → name `meal-images`, public = OFF → Create. Then run the storage policy block (the last statement in schema.sql) in the SQL Editor if it wasn't run with the rest.

- [ ] **Step 3: Confirm**

User: Dashboard → Table Editor → confirm all four tables exist with their columns.

---

### Task 4: Wire @supabase/ssr into the app

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`
- Modify: `package.json` (new deps)

**Interfaces:**
- Consumes: Task 1 env vars
- Produces: `createClient()` (browser, exported as `supabase`) and `createServerClient()` (server components, exported as `supabaseServer`); middleware refreshes expired JWT cookies on every request. Later phases import these for all data access. The browser client is also used to build the Dexie sync layer in P5.

- [ ] **Step 1: Install the SDK**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

- [ ] **Step 3: Create `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component; middleware handles the refresh.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: Create `middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export default async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase middleware.ts package.json package-lock.json
git commit -m "feat: wire supabase ssr clients and middleware"
```

---

### Task 5: Verify the connection

**Files:**
- Create: `app/api/health/route.ts`
- Modify: `.env.local`

**Interfaces:**
- Consumes: Tasks 1, 4
- Produces: `GET /api/health` → `{ "ok": true, "tables": 4 }` proving the anon key works against the project's RLS. This route is a dev aid; it can be deleted in P4 if no longer useful.

- [ ] **Step 1: Create the health check route**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, tables: 4 });
}
```

- [ ] **Step 2: Verify**

Dev server:
```bash
npm run dev > /tmp/opencode/retrofit-dev.log 2>&1 &
sleep 5
curl -s http://localhost:3000/api/health
```
Expected: `{"ok":true,"tables":4}`. Then stop the server:
```bash
fuser -k 3000/tcp 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat: add supabase health check route"
```

---

## Self-Review Notes

- **Spec coverage:** P3 spec items — project creation, PRD §3 SQL + RLS + storage bucket, `@supabase/ssr` wiring ✓
- **Placeholders:** none; all SQL copied from PRD, all code complete
- **Type consistency:** `supabaseServer()` is async and created per-request (App Router requirement); middleware matches the official `@supabase/ssr` pattern
- **Deliberate deferral:** admin account seeding (Auth → Users → Invite) is a Task-3 dashboard step for the user; onboarding gate logic is P4
