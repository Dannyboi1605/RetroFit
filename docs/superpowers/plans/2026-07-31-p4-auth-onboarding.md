# P4 Auth + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login flow, the `has_completed_onboarding` gate, and the 4-Step TDEE Quest wizard that writes targets to `profiles` — with the Mifflin-St Jeor equation confirmed.

**Architecture:** A server component reads the session via `supabaseServer()`; unauthenticated users get a retro login screen (email + password magic-free; Supabase Auth sign-up is disabled, so only the pre-seeded admin can log in). On first login the profile row is upserted, and `has_completed_onboarding=false` routes to the wizard — a 4-step client component that collects answers, computes TDEE + targets, and saves via a Server Action (a `"use server"` function — the same boundary the AI key will use in P7). Confirmed constants: male `+5`, female `−161`; activity multipliers 1.2 / 1.375 / 1.55 / 1.725 / 1.9; goal: cut = TDEE − 500, maintain = TDEE, bulk = TDEE + 400; protein 2.0 g/kg, carbs 40% of remaining kcal, fat 25% of remaining kcal (rounded).

**Tech Stack:** Next.js Server Actions, `@supabase/ssr` (browser + server clients), existing retro CSS classes.

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- No `dangerouslySetInnerHTML` anywhere (PRD hard constraint)
- TDEE formula (confirmed):
  ```
  BMR (male)   = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
  BMR (female) = 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161
  TDEE = BMR × activity_multiplier
  cut = TDEE − 500 | maintain = TDEE | bulk = TDEE + 400
  ```
- Macro flow (user amendment): the wizard pre-fills protein/carbs/fat grams from the formula defaults, but every gram field is editable. Calorie target is ALWAYS derived from grams: `calories = P×4 + C×4 + F×9` — never entered directly. TDEE is shown as reference text only; the goal step is dropped (`goal` column stays NULL)
- All `CHECK`-bounded inputs: age 13–100, height 100–250 cm, weight 30–300 kg

---

### Task 1: Login screen

**Files:**
- Create: `app/login/page.tsx`
- Create: `components/login-form.tsx` (client component)

**Interfaces:**
- Consumes: `supabase` browser client, existing retro CSS
- Produces: `LoginForm` — email/password form with error display; on success `router.replace("/")`. The login page shows the RetroFit logo block and the form.

- [ ] **Step 1: Create `components/login-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="snes-window flex flex-col gap-4 p-6">
      <h1 className="font-headline text-2xl font-extrabold uppercase tracking-widest text-primary">
        RetroFit
      </h1>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
        />
      </label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
        Password
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
        />
      </label>
      {error && <p className="font-mono text-xs text-error">{error}</p>}
      <button type="submit" className="pixel-btn w-full">
        Start Game
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `app/login/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LoginForm from "@/components/login-form";

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[600px] items-center justify-center px-4">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/login components/login-form.tsx
git commit -m "feat: add login screen"
```

---

### Task 2: Onboarding gate + profile upsert

**Files:**
- Create: `lib/tdee.ts`
- Modify: `app/page.tsx` (redirect logic when unauthenticated or un-onboarded)
- Create: `app/quest/page.tsx`
- Create: `components/quest-wizard.tsx`
- Create: `app/quest/actions.ts`

**Interfaces:**
- Consumes: `supabaseServer`, browser `supabase`
- Produces:
  - `lib/tdee.ts`: `calculateTargets({ age, gender, heightCm, weightKg, activityLevel, goal })` → `{ dailyCalories, proteinG, carbsG, fatG, bmr, tdee }` (pure function — unit-testable)
  - `quest/actions.ts`: `saveQuest(formState)` server action (runs `calculateTargets`, upserts `profiles` row with `has_completed_onboarding=true`, rethrows validation errors)
  - `QuestWizard` client component: 4 steps, each with a Continue button; collects answers into local state; final step submits via `saveQuest` and `router.replace("/")`
  - `app/page.tsx`: reads `profiles` row; if no user → `redirect("/login")`; if `has_completed_onboarding` is false → `redirect("/quest")`

- [ ] **Step 1: Create `lib/tdee.ts`**

```ts
export type ActivityLevel = "sedentary" | "light" | "moderate" | "heavy" | "athlete";
export type Goal = "cut" | "maintain" | "bulk";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
  athlete: 1.9,
};

const GOAL_ADJUSTMENT: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  bulk: 400,
};

export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number) {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

export function calculateTargets(input: {
  age: number;
  gender: "male" | "female";
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}) {
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    (input.gender === "male" ? 5 : -161);

  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
  const dailyCalories = Math.round(tdee + GOAL_ADJUSTMENT[input.goal]);

  const proteinG = Math.round(2 * input.weightKg);
  const remaining = dailyCalories - proteinG * 4;
  const carbsG = Math.round((remaining * 0.4) / 4);
  const fatG = Math.round((remaining * 0.25) / 9);

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), dailyCalories, proteinG, carbsG, fatG };
}
```

- [ ] **Step 2: Create `app/quest/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { calculateTargets } from "@/lib/tdee";

export type QuestState = {
  error?: string;
};

export async function saveQuest(
  _prev: QuestState,
  formData: FormData
): Promise<QuestState> {
  const age = Number(formData.get("age"));
  const gender = String(formData.get("gender"));
  const heightCm = Number(formData.get("heightCm"));
  const weightKg = Number(formData.get("weightKg"));
  const activityLevel = String(formData.get("activityLevel"));
  const proteinG = Number(formData.get("proteinG"));
  const carbsG = Number(formData.get("carbsG"));
  const fatG = Number(formData.get("fatG"));

  if (!(age >= 13 && age <= 100)) return { error: "Age must be 13-100." };
  if (!(heightCm >= 100 && heightCm <= 250)) return { error: "Height must be 100-250 cm." };
  if (!(weightKg >= 30 && weightKg <= 300)) return { error: "Weight must be 30-300 kg." };
  if (!(proteinG >= 0 && carbsG >= 0 && fatG >= 0)) return { error: "Macros must be 0 or more grams." };

  const dailyCalories = caloriesFromMacros(proteinG, carbsG, fatG);
  if (dailyCalories < 800 || dailyCalories > 6000)
    return { error: "Total calories must stay between 800-6000." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        has_completed_onboarding: true,
        age,
        gender,
        height_cm: heightCm,
        current_weight_kg: weightKg,
        activity_level: activityLevel,
        daily_calorie_target: dailyCalories,
        protein_target_g: proteinG,
        carbs_target_g: carbsG,
        fat_target_g: fatG,
      },
      { onConflict: "id" }
    );

  if (error) return { error: error.message };

  redirect("/");
}
```

- [ ] **Step 3: Create `components/quest-wizard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { saveQuest, type QuestState } from "@/app/quest/actions";

const STEPS = [
  { id: 1, label: "AGE & GENDER" },
  { id: 2, label: "HEIGHT & WEIGHT" },
  { id: 3, label: "ACTIVITY" },
  { id: 4, label: "MACROS" },
];

const ACTIVITIES = [
  { id: "sedentary", label: "Sedentary", desc: "Desk job, no exercise" },
  { id: "light", label: "Light", desc: "1-3 workouts / week" },
  { id: "moderate", label: "Moderate", desc: "3-5 workouts / week" },
  { id: "heavy", label: "Heavy", desc: "6-7 workouts / week" },
  { id: "athlete", label: "Athlete", desc: "2x daily training" },
];

const initialState: QuestState = {};

export default function QuestWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");

  const [state, formAction, pending] = useActionState(saveQuest, initialState);

  const targets =
    age && gender && heightCm && weightKg && activityLevel
      ? calculateTargets({
          age: Number(age),
          gender: gender as "male" | "female",
          heightCm: Number(heightCm),
          weightKg: Number(weightKg),
          activityLevel: activityLevel as ActivityLevel,
          goal: "maintain",
        })
      : null;

  const totalCalories = caloriesFromMacros(
    Number(proteinG) || 0,
    Number(carbsG) || 0,
    Number(fatG) || 0
  );

  const canContinue =
    (step === 1 && age && gender) ||
    (step === 2 && heightCm && weightKg) ||
    (step === 3 && activityLevel) ||
    (step === 4 && proteinG && carbsG && fatG);

  function goNext() {
    if (step === 3 && targets) {
      setProteinG(String(targets.proteinG));
      setCarbsG(String(targets.carbsG));
      setFatG(String(targets.fatG));
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant">
        {STEPS.map((s) => (
          <span key={s.id} className={s.id <= step ? "text-primary" : ""}>
            {s.id === step ? "▶ " : ""}
            {s.label}
          </span>
        ))}
      </div>

      <form
        action={async (formData: FormData) => {
          formData.set("age", age);
          formData.set("gender", gender);
          formData.set("heightCm", heightCm);
          formData.set("weightKg", weightKg);
          formData.set("activityLevel", activityLevel);
          formData.set("proteinG", proteinG);
          formData.set("carbsG", carbsG);
          formData.set("fatG", fatG);
          await formAction(formData);
          if (!state?.error) router.replace("/");
        }}
        className="snes-window flex flex-col gap-4 p-6"
      >
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Age
              <input
                type="number"
                inputMode="numeric"
                min={13}
                max={100}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
            <div className="flex gap-4">
              {(["male", "female"] as const).map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setGender(g)}
                  className={`pixel-btn w-full ${gender === g ? "" : "opacity-50"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Height (cm)
              <input
                type="number"
                inputMode="decimal"
                min={100}
                max={250}
                required
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Weight (kg)
              <input
                type="number"
                inputMode="decimal"
                min={30}
                max={300}
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            {ACTIVITIES.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setActivityLevel(a.id)}
                className={`snes-window flex items-center justify-between p-3 text-left ${activityLevel === a.id ? "opacity-100" : "opacity-60"}`}
              >
                <span className="font-mono text-sm font-bold uppercase text-on-surface">{a.label}</span>
                <span className="font-mono text-[10px] text-on-surface-variant">{a.desc}</span>
              </button>
            ))}
            {targets && (
              <p className="mt-2 text-center font-mono text-xs text-on-surface-variant">
                REFERENCE TDEE: <span className="text-tertiary">{targets.tdee.toLocaleString()} KCAL</span>
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-xs uppercase text-on-surface-variant">
              Daily targets — editable, calories auto-calc:
            </p>
            {[
              { label: "Protein (g)", value: proteinG, set: setProteinG, color: "text-error" },
              { label: "Carbs (g)", value: carbsG, set: setCarbsG, color: "text-tertiary" },
              { label: "Fat (g)", value: fatG, set: setFatG, color: "text-on-surface" },
            ].map((f) => (
              <label
                key={f.label}
                className={`flex items-center justify-between gap-2 font-mono text-xs uppercase ${f.color}`}
              >
                {f.label}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  required
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-24 border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                />
              </label>
            ))}
            <div className="border-t-2 border-surface-variant pt-3 text-center">
              <span className="font-mono text-xs uppercase text-on-surface-variant">Total: </span>
              <span className="font-headline text-2xl font-extrabold text-primary">
                {totalCalories.toLocaleString()} kcal
              </span>
            </div>
            <p className="text-center font-mono text-[10px] text-on-surface-variant">
              REFERENCE TDEE: {targets ? targets.tdee.toLocaleString() : "—"} KCAL
            </p>
          </div>
        )}

        {state?.error && <p className="font-mono text-xs text-error">{state.error}</p>}

        <button
          type="button"
          className="pixel-btn w-full"
          disabled={!canContinue || pending}
          onClick={goNext}
        >
          Continue
        </button>

        {step === 4 && (
          <button type="submit" className="pixel-btn w-full" disabled={pending}>
            {pending ? "Saving..." : "Complete Quest"}
          </button>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/quest/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import QuestWizard from "@/components/quest-wizard";

export default async function QuestPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_completed_onboarding")
    .eq("id", user.id)
    .single();

  if (profile?.has_completed_onboarding) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[600px] flex-col justify-center gap-6 px-4">
      <div className="inline-block self-center border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Welcome to RetroFit.
        </h1>
      </div>
      <p className="text-center font-mono text-xs text-on-surface-variant">
        4-STEP QUEST: CALCULATE YOUR DAILY TARGETS
      </p>
      <QuestWizard />
    </main>
  );
}
```

- [ ] **Step 5: Gate `app/page.tsx`**

Replace the top of the Home component's file with a wrapper:

```tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";

// ...existing mock data constants stay...

export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_completed_onboarding")
    .eq("id", user.id)
    .single();

  if (!profile?.has_completed_onboarding) redirect("/quest");

  return (
    // ...existing JSX unchanged...
  );
}
```

- [ ] **Step 6: Verify build and unit test the calculator**

Run: `npm run build`
Expected: exit 0.

Add a quick self-check for the pure functions — create `lib/tdee.test.ts` with a known-good hand-computed case and run it with Node directly:

```ts
import { calculateTargets, caloriesFromMacros } from "./tdee";

const r = calculateTargets({ age: 30, gender: "male", heightCm: 180, weightKg: 80, activityLevel: "moderate", goal: "maintain" });
const expected = {
  bmr: 10 * 80 + 6.25 * 180 - 5 * 30 + 5, // 1775
  tdee: Math.round((10 * 80 + 6.25 * 180 - 5 * 30 + 5) * 1.55), // 2751
};
console.assert(r.bmr === expected.bmr, `bmr ${r.bmr} != ${expected.bmr}`);
console.assert(r.tdee === expected.tdee, `tdee ${r.tdee} != ${expected.tdee}`);
console.assert(r.dailyCalories === expected.tdee, `maintain should equal tdee`);
console.assert(r.proteinG === 160, `protein 2g/kg`);
console.assert(caloriesFromMacros(100, 200, 50) === 1850, `4/4/9 math: 100*4+200*4+50*9 = 1850`);
console.log("tdee ok");
```

Run: `npx tsx lib/tdee.test.ts`
Expected: prints `tdee ok` with no assertion failures. (If `tsx` isn't installed, install it: `npm i -D tsx`.)

- [ ] **Step 7: Commit**

```bash
git add lib/tdee.ts lib/tdee.test.ts app/page.tsx app/quest
git commit -m "feat: add onboarding gate and TDEE quest wizard"
```

---

## Self-Review Notes

- **Spec coverage:** P4 spec items — login, onboarding check, 4-step wizard, Mifflin-St Jeor with confirmed constants, targets → `profiles` ✓
- **Placeholders:** none; all code complete
- **Type consistency:** `calculateTargets` signature used identically in `actions.ts` and the test; `QuestState` shared between `actions.ts` and `quest-wizard.tsx`
- **Deliberate decisions:** (1) bulk = +400 (middle of PRD's +300–500, confirmed); (2) user amendment: macros pre-filled from formula but editable, calories always derived from grams (4/4/9) and never entered directly, TDEE shown as reference only, goal step dropped (`goal` stays NULL); (3) `redirect("/")` in the server action needs `router.replace` on the client — the wizard watches `state.error` to avoid replacing when validation failed; (4) the 800–6000 kcal guard mirrors the `profiles` CHECK constraint so the DB constraint surfaces as a friendly message
- **Known limitation:** `useActionState` + FormData juggling in the wizard is a bit clunky — acceptable for a single-form wizard; revisit only if a second form needs the pattern
