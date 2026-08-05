# Retake Quest from Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users redo the 5-step onboarding quest from the Settings page; the wizard pre-fills with current profile values and completing a retake saves to the same `profiles` columns and lands back on Settings.

**Architecture:** Reuse the existing `/quest` route and `QuestWizard` component. A `retake=1` query param switches the quest page from onboarding-guard mode to prefill mode. The wizard gains an optional `initial` prop; the profile→wizard mapping lives in the quest page. `saveQuest` honors an optional `next` form field whose default keeps first-time onboarding redirecting home.

**Tech Stack:** TypeScript (React 19 / Next 16 server + client components), existing Supabase server client. No new dependencies. No DB/schema changes.

## Global Constraints

- **No DB changes.** `db/schema.sql`, `db/db.ts`, sync, `logged_meals` cache — all untouched.
- **Onboarding untouched by default.** `/quest` without `retake=1` behaves exactly as today (redirects onboarded users home, no prefill).
- **Same save path.** Retake upserts the identical set of `profiles` columns as first-time onboarding via the existing `saveQuest` action.
- **5 steps untouched.** No changes to step layout, validation ranges, or target calc (`lib/tdee.ts` stays as-is).
- **UI style:** match existing pixel style — link styled with the existing `pixel-btn` CSS class (it is generic button styling and works on an `<a>`), copy in the repo's `font-mono` uppercase style.
- Verify with: `npm run lint` → clean; `npm run build` → exit 0; then manual checks (below).
- Commit style: `feat: <short description>` (repo uses lowercase `feat:` / imperative).
- Line numbers reference the current files; locate code by content if they shifted.
- **No unit tests in this plan** — every change is component/action glue with no pure logic worth pinning; verification is typecheck/build plus the manual checks in each task (the repo tests only pure `lib/` modules).

---

### Task 1: `saveQuest` redirect target — optional `next` form field

**Files:**
- Modify: `app/quest/actions.ts` (line 66, the `redirect("/")`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `saveQuest` reads optional form field `next` (a destination path, default `"/"`) and redirects there after a successful save. This is the contract Task 2 sets the field for. `QuestState` and all validation unchanged.

- [ ] **Step 1: Honor the `next` field**

In `app/quest/actions.ts`, after the `saveQuest` function's existing `error` check (line 64) replace the hardcoded redirect:

```ts
const next = String(formData.get("next") || "/");

redirect(next);
```

The `formData` argument already exists in scope. No other lines change.

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean, no errors.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/quest/actions.ts
git commit -m "feat: retake quest redirects to settings"
```

---

### Task 2: `QuestWizard` — `initial` prefill + `next` on submit

**Files:**
- Modify: `components/quest-wizard.tsx`

**Interfaces:**
- Consumes: nothing new (extension of the existing component).
- Produces:
  - `export type QuestInitial = { age?: string; gender?: "male" | "female" | ""; heightCm?: string; weightKg?: string; activityLevel?: string; proteinG?: string; carbsG?: string; fatG?: string; goal?: string }`
  - `<QuestWizard initial?: QuestInitial />` — when `initial` is provided, every field starts pre-filled; the form submission also sets `next=/settings` and the success navigation goes to `/settings`. Without `initial`, behavior is byte-for-byte today's (Task 3 consumes this).

- [ ] **Step 1: Add the `QuestInitial` export and prop**

At the top of `components/quest-wizard.tsx`, after the imports and before `const STEPS`, add:

```ts
export type QuestInitial = {
  age?: string;
  gender?: "male" | "female" | "";
  heightCm?: string;
  weightKg?: string;
  activityLevel?: string;
  proteinG?: string;
  carbsG?: string;
  fatG?: string;
  goal?: string;
};
```

Change the component signature (line 38):

```ts
export default function QuestWizard({ initial }: { initial?: QuestInitial }) {
```

- [ ] **Step 2: Seed the `useState` defaults**

Replace the eight state initializers (lines 41–49) to pre-fill from `initial`:

```ts
const [age, setAge] = useState(initial?.age ?? "");
const [gender, setGender] = useState<"male" | "female" | "">(initial?.gender ?? "");
const [heightCm, setHeightCm] = useState(initial?.heightCm ?? "");
const [weightKg, setWeightKg] = useState(initial?.weightKg ?? "");
const [activityLevel, setActivityLevel] = useState(initial?.activityLevel ?? "");
const [proteinG, setProteinG] = useState(initial?.proteinG ?? "");
const [carbsG, setCarbsG] = useState(initial?.carbsG ?? "");
const [fatG, setFatG] = useState(initial?.fatG ?? "");
const [goal, setGoal] = useState(initial?.goal ?? "");
```

- [ ] **Step 3: Set `next` on submit and route the success path**

In the form's `action` handler (lines 128–138), add the `next` field alongside the existing `formData.set(...)` calls, and change the success navigation:

```ts
formData.set("next", initial ? "/settings" : "/");
```

Replace the existing success line `if (!res?.error) router.replace("/")` with:

```ts
if (!res?.error) router.replace(initial ? "/settings" : "/");
```

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: exit 0. (`initial?.x ?? ""` is type-safe against the optional `QuestInitial` fields.)

Manual smoke (optional): open `/quest?retake=1` — wizard renders with empty defaults when no profile row is behind the URL guard (Task 3 provides the real prefill).

- [ ] **Step 5: Commit**

```bash
git add components/quest-wizard.tsx
git commit -m "feat: quest wizard supports prefilled retake"
```

---

### Task 3: Quest page — retake mode switches guard, loads profile, pre-fills

**Files:**
- Modify: `app/quest/page.tsx`

**Interfaces:**
- Consumes: `QuestWizard` + `QuestInitial` from Task 2; `supabaseServer` (existing).
- Produces: `/quest?retake=1` renders the wizard pre-filled from the user's profile and skips the onboarded redirect; `/quest` (no param) keeps redirecting onboarded users to `/`. `next=/settings` is derived internally by the wizard, so the page just decides `retake`.

- [ ] **Step 1: Read the param, guard conditionally, build `initial`**

Replace `app/quest/page.tsx` in full:

```tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import QuestWizard, { type QuestInitial } from "@/components/quest-wizard";

export default async function QuestPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { retake } = await searchParams;
  const isRetake = retake === "1";

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "has_completed_onboarding, age, gender, height_cm, current_weight_kg, activity_level, protein_target_g, carbs_target_g, fat_target_g, goal"
    )
    .eq("id", user.id)
    .single();

  if (!isRetake && profile?.has_completed_onboarding) redirect("/");

  const initial: QuestInitial | undefined =
    isRetake && profile
      ? {
          age: String(profile.age),
          gender: (profile.gender ?? "") as "male" | "female" | "",
          heightCm: String(profile.height_cm),
          weightKg: String(profile.current_weight_kg),
          activityLevel: profile.activity_level ?? "",
          proteinG: String(profile.protein_target_g),
          carbsG: String(profile.carbs_target_g),
          fatG: String(profile.fat_target_g),
          goal: profile.goal ?? "",
        }
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-app flex-col justify-center gap-6 px-4">
      <div className="inline-block self-center border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          {isRetake ? "Recalculate Your Targets." : "Welcome to RetroFit."}
        </h1>
      </div>
      <p className="text-center font-mono text-xs text-on-surface-variant">
        {isRetake ? "RETAKE THE QUEST — UPDATES YOUR DAILY TARGETS" : "5-STEP QUEST: CALCULATE YOUR DAILY TARGETS"}
      </p>
      <QuestWizard initial={initial} />
    </main>
  );
}
```

Note: `await searchParams` is the Next 16 (Promise) convention — matches how async server components take the page `searchParams` prop.

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: exit 0.

Manual (needs a logged-in onboarded user and a running dev server):
- `/quest` → redirects to `/`.
- `/quest?retake=1` → wizard shows current age/height/weight/activity/macros/goal pre-filled.

- [ ] **Step 3: Commit**

```bash
git add app/quest/page.tsx
git commit -m "feat: quest retake mode prefills from profile"
```

---

### Task 4: Settings page — "Retake Quest" entry point

**Files:**
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: nothing new; links to the `/quest?retake=1` route from Task 3.
- Produces: an always-visible (for onboarded users, which is this page's only audience) "Retake Quest" control on Settings.

- [ ] **Step 1: Add the link button**

In `app/settings/page.tsx`, after the closing `</div>` of the `lg:grid` block (line 39, right after the `GoalPicker`/`TargetsForm` grid) and before `<SyncStatus />`, add:

```tsx
<a href="/quest?retake=1" className="pixel-btn w-full text-center">
  Retake Quest — Recalculate Your Targets
</a>
```

`pixel-btn` is existing global CSS (generic button styling) and applies fine to an anchor; `w-full text-center` makes the inline-flex span the column like the Log Out button below it.

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: exit 0.

Manual (dev server, logged in, onboarded):
- Settings shows the green "Retake Quest" button.
- Click → `/quest?retake=1` with pre-filled values.
- Edit one field, complete quest → lands back on Settings with updated targets on `TargetsForm`/`GoalPicker`.

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: retake quest button on settings"
```

---

## End-to-end manual verification

1. Log in as an onboarded user, visit `/settings` → green "Retake Quest — Recalculate Your Targets" button present.
2. Click it → lands on `/quest?retake=1`; steps 1–5 pre-filled with current profile values (age, gender, height, weight, activity, macros, goal).
3. Change weight and goal, step through to "Complete Quest" → redirects to `/settings`; `TargetsForm` shows recalculated targets.
4. Visit `/quest` (no param) while logged in → redirects to `/` (onboarding guard intact).
5. `npm run lint` clean and `npm run build` exit 0.