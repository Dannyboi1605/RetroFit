# P6 Feature Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the remaining static mocks — live Home dashboard (profile targets + today's meals + real weight trend), date navigation + meal editing on the Log screen, the weight tracker (with SVG chart), and a settings screen (targets override + sync status).

**Architecture:** Everything stays offline-first — all writes continue through Dexie + the sync queue. Edits are new: the queue gains an `op: "update"` that syncs via **UPSERT on `client_id`** (`ON CONFLICT (client_id) DO UPDATE`), which is idempotent under RLS because `logged_meals` has the FOR ALL policy and `client_id` is UNIQUE. Weight logs use **replace semantics locally** (one row per day, matching the server's `UNIQUE (user_id, logged_date)`), so a duplicate-key error can never be misread as "already synced". The Home page stays a server component for auth + profile fetch (targets), and delegates the Dexie-reading parts to a client component — the server can never touch IndexedDB. Date navigation on the Log screen is pure local state (prev/next day, `listMeals(date)` already keys on `logged_date`). Settings writes targets through a server action with the same CHECK ranges as the schema.

**Tech Stack:** existing Dexie v1 schema (no migration needed — `op` is an unindexed string), existing sync engine (extended), SVG polyline for the chart (no chart lib), Supabase REST + server actions.

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- All writes go through Dexie — the UI never writes to Supabase directly (except the settings server action, which writes `profiles` by design)
- `client_id` stays the idempotency key; never reused
- Weight logging is replace-per-day: `addWeight` deletes any existing row for that date first
- The `weightLogs` sync already works — `TABLES.weightLogs` exists in `lib/sync.ts`
- RLS stays untouched — no schema changes this phase

---

### Task 1: Log screen — date navigation + meal editing

**Files:**
- Modify: `db/db.ts` (add `updateMeal`, change `syncQueue` op type to include `"update"`)
- Modify: `lib/sync.ts` (handle `op: "update"` → upsert)
- Modify: `components/add-entry-modal.tsx` (accept `date` + optional `editing` meal; save → add or update)
- Modify: `app/log/page.tsx` (enable chevrons; pencil ✎ per meal opens edit modal; ADD ENTRY targets the selected date)

**Interfaces:**
- `updateMeal(clientId, patch)` — transaction: update row; **only if `synced === 1`** also queue `{ op: "update" }` (if `synced === 0` the pending insert already covers the new values)
- `pushPending` update branch — `.upsert(payload, { onConflict: "client_id" })`, then `synced: 1` + dequeue
- `AddEntryModal({ open, date, mealType, editing?: Meal, onClose, onSaved })` — prefilled when editing; title "Edit Entry"
- Log screen: `selectedDate` state (defaults today); chevrons `±1 day`; a "Today" chip appears when not on today; totals + bars compute for the selected date; meal rows get an edit (✎) and delete (✖) button

- [ ] **Step 1: `db/db.ts`** — extend op union to `"insert" | "delete" | "update"`, add:

```ts
export async function updateMeal(clientId: string, patch: Partial<Meal>): Promise<void> {
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    const row = await db.meals.get(clientId);
    if (!row || row.deleted === 1) return;
    const now = new Date().toISOString();
    await db.meals.update(clientId, { ...patch, created_at: row.created_at });
    if (row.synced === 1) {
      await db.syncQueue.add({ client_id: clientId, table: "meals", op: "update", created_at: now });
    }
  });
}
```

- [ ] **Step 2: `lib/sync.ts`** — add the update branch:

```ts
} else if (entry.op === "update") {
  const local = (await db[entry.table].get(entry.client_id)) as Record<string, unknown> | undefined;
  if (!local || local.deleted === 1) continue;

  const payload: Record<string, unknown> = { user_id: user.id };
  for (const col of meta.columns.split(", ")) {
    if (col in local) payload[col] = local[col];
  }

  const { error } = await supabase.from(meta.table).upsert(payload, { onConflict: "client_id" });

  if (error) {
    console.error("sync update failed", entry.client_id, error.message);
    continue;
  }

  await db[entry.table].update(entry.client_id, { synced: 1 });
  await db.syncQueue.delete(entry.client_id);
  processed++;
}
```

- [ ] **Step 3: `components/add-entry-modal.tsx`** — new props `date: string`, `editing?: Meal | null`; initialize state from `editing` (useEffect on `editing` change); save calls `editing ? updateMeal(editing.client_id, {...}) : addMeal({ ...input, logged_date: date })`; title switches to "Edit Entry — {mealType}"

- [ ] **Step 4: `app/log/page.tsx`** — replace `today` with `selectedDate` + `shiftDay(±1)`; label shows the real date + "TODAY" chip when `selectedDate === today`; modal gets `date={selectedDate}`; each meal row gets an edit button (`edit` icon) opening the modal with `editing={meal}`

- [ ] **Step 5: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add db/db.ts lib/sync.ts components/add-entry-modal.tsx app/log/page.tsx
git commit -m "feat: date navigation and meal editing with upsert sync"
```

---

### Task 2: Weight tracker screen

**Files:**
- Modify: `db/db.ts` (add `addWeight`, `listWeightLogs`)
- Create: `app/weight/page.tsx` (client component + AppShell, tab `weight`)
- Modify: `lib/sync.ts` — no change needed (weightLogs insert already supported)

**Interfaces:**
- `addWeight({ logged_date, weight_kg, note? })` — replace-per-day: delete existing row for `logged_date` (if any) + its pending queue entries, then insert new row + queue insert. Returns client_id.
- `listWeightLogs(rangeDays?: number)` — non-deleted logs, sorted by `logged_date` asc
- `app/weight/page.tsx` — form (date defaults today, kg, optional note) → `addWeight`; entries list; SVG polyline chart (pure `<svg>`, like the home static widget) with 1W / 1M / 1Y tab buttons filtering `listWeightLogs(n)`: points = (index, weight), y scaled between min/max with padding, gridlines, last point highlighted, min/max labels. One weight per day, newest shown in form when re-loading.

- [ ] **Step 1: `db/db.ts`** — add `addWeight` (replace-per-day, with a `db.syncQueue.where("client_id").anyOf(oldIds).delete()` cleanup for the replaced row's pending entries) and `listWeightLogs`

- [ ] **Step 2: `app/weight/page.tsx`** — form + list + chart per Stitch "Weight Tracker - Trends" screen (snes-window cards, pixel buttons, macro-bar styling for the tab pills)

- [ ] **Step 3: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add db/db.ts app/weight/page.tsx
git commit -m "feat: weight tracker with svg trend chart"
```

---

### Task 3: Live Home dashboard

**Files:**
- Create: `components/home-dashboard.tsx` (client component)
- Modify: `app/page.tsx` (server: gate + fetch profile, render `<HomeDashboard profile={...} />`)
- Modify: `components/app-shell.tsx` — wire the TDEE tab to `/settings` (dead-tab cleanup, done in Task 4's route but the href changes here)

**Interfaces:**
- `app/page.tsx` — fetch full profile row (`daily_calorie_target`, `protein_target_g`, `carbs_target_g`, `fat_target_g`, `goal`) for the logged-in user (already gated); pass as prop; keep redirects
- `HomeDashboard({ profile })` — "use client"; `useEffect` reads Dexie: today's meals (`listMeals(today)`) and recent weight (`listWeightLogs(7)`) with a refresh-on-mount + a subscription-friendly `refresh()`; renders:
  - Energy card: real `todayCalories / profile.daily_calorie_target` + HP bar % (cap 100) + per-macro bars against targets (`P/C/F` grams)
  - Buttons: "Log Manually" → `router.push("/log")`; "Scan Meal" → decorative (P7)
  - Weight Trend card: real polyline from recent logs, delta vs first log (e.g. `-1.2 kg`), links to `/weight`
  - Recent Logs: today's meals grouped (icon by meal_type, name, kcal), "Not Logged Yet" row for missing meals of the day — same as current static UI but from Dexie
  - Gear icon (top-right, beside "Daily Overview") → `router.push("/settings")`

- [ ] **Step 1: `app/page.tsx`** — full profile fetch + render client dashboard; delete `MACROS`/`RECENT_LOGS` constants and the static JSX (moves into the client component)

- [ ] **Step 2: `components/home-dashboard.tsx`** — per interfaces; reuse existing CSS classes (`snes-window`, `pixel-btn`, macro bar classes) and the static widget's SVG structure

- [ ] **Step 3: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/home-dashboard.tsx components/app-shell.tsx
git commit -m "feat: live home dashboard with real targets, meals, and weight trend"
```

---

### Task 4: Settings screen

**Files:**
- Create: `app/settings/page.tsx` (server component: fetch profile, render form)
- Create: `app/settings/actions.ts` (server action `updateTargets`)
- Modify: `components/app-shell.tsx` (TDEE tab href → `/settings`)
- Create: `components/sync-status.tsx` (client: queue count + PUSH NOW)

**Interfaces:**
- `updateTargets(formData)` — server action: parse + validate (`daily_calorie_target` 800–6000, `protein_target_g`/`carbs_target_g`/`fat_target_g` ≥ 0, ints); `supabase.from("profiles").update(...).eq("id", user.id)`; revalidatePath("/"); redirect back
- `/settings` — snes-window form with the four target inputs prefilled from profile; SYNC STATUS card with live queue length (Dexie `syncQueue.count()`, polled on mount + every 5s) and a "PUSH NOW" pixel button calling `pushPending()`; links back to home

- [ ] **Step 1: `app/settings/actions.ts`** — server action with validation mirroring `profiles` CHECKs

- [ ] **Step 2: `app/settings/page.tsx`** — gate (redirect if no user), profile fetch, form + `<SyncStatus />`

- [ ] **Step 3: `components/sync-status.tsx`** + shell TDEE tab href

- [ ] **Step 4: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/settings/page.tsx app/settings/actions.ts components/sync-status.tsx components/app-shell.tsx
git commit -m "feat: settings screen with target overrides and sync status"
```

---

### Task 5: Browser verification (full P6 round-trip)

**Files:**
- Create: `/tmp/opencode/p6-check.js` (throwaway Playwright script — not committed)

- [ ] **Step 1: Write the check script**

Logs in (user's seeded account via env vars), then:
1. Home: assert the energy number is non-zero and matches today's logged meals; assert the target equals the profile's `daily_calorie_target` (read from the quest values, e.g. 2689 bulk — script prints what it sees)
2. Log: navigate back a day (chevron), verify empty state; back to today; edit the first meal (change calories), save, wait 3s
3. Weight: add `80.5 kg` for today, assert it renders; switch chart tabs
4. Settings: read target inputs, change `daily_calorie_target` by +100, save, verify redirect + home shows the new target

- [ ] **Step 2: User runs it**

User: `npm run dev`, then `node /tmp/opencode/p6-check.js` (env vars `EMAIL`/`PASSWORD`), reports output.

- [ ] **Step 3: Manual Supabase checks (user)**

Table Editor: `logged_meals` — edited meal has the new calories, no new `client_id` rows, no duplicates; `weight_logs` — one row for today with 80.5; `profiles` — updated target.

- [ ] **Step 4: Fix anything the check surfaces** (agent)

---

## Self-Review Notes

- **Spec coverage:** P6 spec items — date navigation ✓ (Task 1), edit/delete meals ✓ (Task 1; delete already existed), weight tracker with SVG chart 1W/1M/1Y ✓ (Task 2), settings screen (targets override, sync status) ✓ (Task 4). Also lands the user-requested live dashboard (Task 3), completing "feature completion" from the phase map.
- **LWW vs single-device:** edits sync via upsert; `client_id` is the conflict key, so re-syncing never duplicates. True multi-device pull sync + `updated_at` LWW remains out of scope — noted as future work.
- **The duplicate-swallow trap (caught in planning):** `pushPending` treats any "duplicate" error as already-synced. A naive weight insert could hit `UNIQUE (user_id, logged_date)` (re-logging same day) and be wrongly marked synced without ever reaching the server. **`addWeight`'s replace-per-day semantics eliminate that path entirely** — the only duplicate that can occur is the benign client_id retry.
- **Edit of an unsynced row:** `updateMeal` skips queueing `update` when `synced === 0` — the pending insert carries the final values. Two ops for one row can never be queued.
- **No schema changes:** Dexie v1 unchanged (`op` is an unindexed value); `db/schema.sql` untouched; RLS untouched.
- **Known gaps (deferred):** multi-device pull; real-time sync status subscription (5s poll instead); Scan tab still decorative (P7); TDEE tab redirects to Settings until the full calculator view exists.
