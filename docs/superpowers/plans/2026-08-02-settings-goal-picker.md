# Goal Picker in Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This run: NO git commits** — the user handles version control; reviewers get working-tree diffs instead of commit ranges.

**Goal:** Let users change their goal (cut/maintain/bulk) on `/settings`. Changing the goal also recalculates their daily calorie target and macros, exactly like the quest wizard's goal step now does.

**Architecture:** `profiles.goal` already exists with a CHECK constraint. `lib/tdee.ts` `calculateTargets(input)` takes age/gender/height/weight/activity/goal and returns `dailyCalories, proteinG, carbsG, fatG` — all inputs are stored on the profile row, so a goal change = one `calculateTargets` call + one UPDATE of `goal` + the 4 target columns. The quest wizard already implements this behavior client-side (`pickGoal`); settings reuses the same `calculateTargets` server-side.

**Tech Stack:** Next.js 16 App Router (server actions + async server components), React 19, TypeScript, Supabase, existing retro pixel styling (`pixel-btn`, `snes-window`, `material-symbols-outlined`, `font-mono`), existing `SaveToast` component.

## Global Constraints

- No new dependencies.
- **NO git commits.** Leave the working tree exactly as is except for this feature's edits. The repo currently has uncommitted groundwork (quest wizard `pickGoal`, `lib/tdee.ts` macro-split fix, updated `lib/tdee.test.ts`, `logout` action in `app/settings/actions.ts`, logout button in `app/settings/page.tsx`, quest page 5-step label). **Do not modify, revert, or stage those changes. Do not run `git add` / `git commit` / `git stash`.**
- `app/settings/actions.ts` and `app/settings/page.tsx` are already dirty (see above) — only ADD this feature's code, never touch existing uncommitted lines.
- Reuse `calculateTargets` from `@/lib/tdee` and `SaveToast` from `@/components/save-toast`. Do not duplicate their logic.
- Goal values are exactly `"cut" | "maintain" | "bulk"` (schema CHECK). Validation must reject anything else.
- Follow existing component style: `pixel-btn` / `snes-window` classes, `material-symbols-outlined` icons, `font-mono` labels.
- Verification: `npm run build` must pass (exit 0) and `npx tsx lib/tdee.test.ts` must print `tdee ok`.

---

### Task 1: `updateGoal` server action

**Files:**
- Modify: `app/settings/actions.ts` (append only — the file already has uncommitted `updateTargets` and `logout`; do not touch them)

**Interfaces:**
- Consumes: `calculateTargets` from `@/lib/tdee`; `supabaseServer` from `@/lib/supabase/server` (already imported); `revalidatePath` from `next/cache` (already imported)
- Produces: `export async function updateGoal(goal: string): Promise<{ error?: string }>` — Task 2 imports and calls it from a client component

- [ ] **Step 1: Add the `updateGoal` server action**

Append to `app/settings/actions.ts`:

```ts
export async function updateGoal(goal: string): Promise<{ error?: string }> {
  if (!["cut", "maintain", "bulk"].includes(goal))
    return { error: "Pick a goal." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("age, gender, height_cm, current_weight_kg, activity_level")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.age == null ||
    !profile.gender ||
    profile.height_cm == null ||
    profile.current_weight_kg == null ||
    !profile.activity_level
  )
    return { error: "Onboarding data missing — redo the quest first." };

  const targets = calculateTargets({
    age: profile.age,
    gender: profile.gender,
    heightCm: Number(profile.height_cm),
    weightKg: Number(profile.current_weight_kg),
    activityLevel: profile.activity_level,
    goal: goal as Goal,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      goal,
      daily_calorie_target: targets.dailyCalories,
      protein_target_g: targets.proteinG,
      carbs_target_g: targets.carbsG,
      fat_target_g: targets.fatG,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  return {};
}
```

Imports needed at top of file (add to the existing `from "@/lib/tdee"` import, and add a type import): `calculateTargets` and `type Goal` from `@/lib/tdee`.

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: `✓ Compiled successfully` (exit 0).

- [ ] **Step 3: Report, don't commit**

Write the full report to the report file (see dispatch). **Do not run any git command.**

---

### Task 2: GoalPicker component + settings page wiring

**Files:**
- Create: `components/goal-picker.tsx`
- Modify: `app/settings/page.tsx` (this file is already dirty — uncommitted logout button; only ADD your lines, never touch the existing uncommitted block)

**Interfaces:**
- Consumes: `updateGoal(goal: string): Promise<{ error?: string }>` from `@/app/settings/actions` (Task 1); `SaveToast` from `@/components/save-toast`; `Goal` type from `@/lib/tdee`
- Produces: `<GoalPicker goal: Goal />` client component; rendered on the settings page between the page header and `<TargetsForm ... />`

- [ ] **Step 1: Create `components/goal-picker.tsx`**

Client component ("use client"). Three buttons, same visual language as quest wizard step 5 (see `components/quest-wizard.tsx` lines ~271-294): `snes-window` buttons, `aria-pressed`, primary border + full opacity for the active goal, `opacity-60` for others, label + desc in `font-mono`. Local `GOALS` array (3 items: cut "Lose weight", maintain "Stay the same", bulk "Gain weight") — do not import from quest-wizard. Clicking a button: if it equals the current goal, ignore; else `await updateGoal(g.id)`; on success show `<SaveToast message="Goal updated!" />` (mirror the flash pattern from `targets-form.tsx`); on error render the error in a `role="alert"` `font-mono text-xs text-error` paragraph. Disable buttons while pending. Below the buttons, a hint line: `FOR WEIGHT-TREND GUIDANCE — RECALCULATES YOUR DAILY MACROS`.

- [ ] **Step 2: Wire into `app/settings/page.tsx`**

1. Extend the profile `.select(...)` on line 17 to also fetch `age, gender, height_cm, current_weight_kg, activity_level`.
2. Import `GoalPicker` and render `<GoalPicker goal={profile.goal} />` between the header `</div>` (line 28) and `<TargetsForm profile={profile} />` (line 31). Give `goal` the `Goal` type where needed.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: `✓ Compiled successfully` (exit 0). Also run `npx tsx lib/tdee.test.ts` — expected output `tdee ok` (proves the recalc math the action relies on).

- [ ] **Step 4: Report, don't commit**

Write the full report to the report file (see dispatch). **Do not run any git command.**

---

## Self-Review Notes

- **Spec coverage:** goal picker on /settings (Task 2), goal change recalcs macros + calorie target via `calculateTargets` (Task 1), validation against the schema CHECK values (Task 1), no new deps, style follows quest wizard/targets-form (Global Constraints).
- **Placeholders:** none — all code blocks are complete.
- **Type consistency:** `updateGoal(goal: string)` defined in Task 1, consumed in Task 2; `Goal` type shared via `@/lib/tdee`; profile select in Task 2 includes exactly the fields Task 1's recalc guard needs.
- **Dirty-tree handling:** no git commands anywhere; Task 2 edits only additive lines in a dirty file.
