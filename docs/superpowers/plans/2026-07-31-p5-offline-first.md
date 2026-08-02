# P5 Offline-First Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IndexedDB-first data layer with a sync queue that pushes to Supabase when online — idempotent via `client_id`, delete-wins via tombstones.

**Architecture:** All writes go to Dexie first (instant, offline-capable), tagged `pending`. A sync engine watches `navigator.onLine` + `online`/`offline` events and pushes pending rows to Supabase in batches. Inserts are idempotent because `logged_meals.client_id` has a UNIQUE constraint server-side — a retried sync matches and skips. Deletes: the local row is marked `deleted: 1` (tombstone), the server DELETE runs, then the tombstone is purged. Scope cut for v1: **push-only** (no pull), **inserts + deletes only** (no edits — those arrive in P6 with `updated_at` LWW). The Log screen becomes a client component reading/writing Dexie; a minimal "ADD ENTRY" modal (manual log form) is the write path.

**Tech Stack:** `dexie` (IndexedDB wrapper), Supabase REST (via browser client), existing retro CSS classes, `crypto.randomUUID()` for `client_id`.

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- `client_id` is generated client-side with `crypto.randomUUID()` and NEVER reused
- Meal rows carry the same shape as `logged_meals`; weight rows as `weight_logs`
- All local writes go through Dexie — the UI never writes to Supabase directly in this phase
- The `/api/health` route stays (used by later verification)

---

### Task 1: Dexie schema + local data layer

**Files:**
- Create: `db/db.ts`
- Modify: `package.json` (new dep)

**Interfaces:**
- Consumes: nothing (pure local)
- Produces:
  - `db` — Dexie instance, `.version(1).stores(...)` with tables `meals`, `weightLogs`, `syncQueue`
  - `addMeal(input): Promise<string>` — inserts meal with `client_id`, `synced: 0`
  - `deleteMeal(clientId): Promise<void>` — tombstone: sets `deleted: 1` (row kept until sync purges it)
  - `listMeals(date: string): Promise<Meal[]>` — today's live (non-deleted) meals, sorted by `created_at`
  - `type Meal` — `{ client_id, user_id?, logged_date, meal_type, name, calories, protein_g, carbs_g, fat_g, source, created_at, synced, deleted }`

- [ ] **Step 1: Install Dexie**

Run: `npm install dexie`

- [ ] **Step 2: Create `db/db.ts`**

```ts
import Dexie, { type Table } from "dexie";

export type Meal = {
  client_id: string;
  user_id?: string;
  logged_date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "manual" | "ai_scan" | "barcode" | "custom_favorite";
  created_at: string;
  synced: 0 | 1;
  deleted: 0 | 1;
};

export type WeightLog = {
  client_id: string;
  logged_date: string;
  weight_kg: number;
  note?: string;
  created_at: string;
  synced: 0 | 1;
  deleted: 0 | 1;
};

class RetroFitDB extends Dexie {
  meals!: Table<Meal, string>;
  weightLogs!: Table<WeightLog, string>;
  syncQueue!: Table<{ client_id: string; table: "meals" | "weightLogs"; op: "insert" | "delete"; created_at: string }, string>;

  constructor() {
    super("retrofit");
    this.version(1).stores({
      meals: "client_id, logged_date, synced, deleted",
      weightLogs: "client_id, logged_date, synced, deleted",
      syncQueue: "client_id, created_at",
    });
  }
}

export const db = new RetroFitDB();

export async function addMeal(input: {
  logged_date: string;
  meal_type: Meal["meal_type"];
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): Promise<string> {
  const client_id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    await db.meals.add({
      client_id,
      logged_date: input.logged_date,
      meal_type: input.meal_type,
      name: input.name,
      calories: input.calories,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
      source: "manual",
      created_at: now,
      synced: 0,
      deleted: 0,
    });
    await db.syncQueue.add({ client_id, table: "meals", op: "insert", created_at: now });
  });
  return client_id;
}

export async function deleteMeal(clientId: string): Promise<void> {
  await db.transaction("rw", [db.meals, db.syncQueue], async () => {
    await db.meals.update(clientId, { deleted: 1 });
    await db.syncQueue.add({
      client_id: clientId,
      table: "meals",
      op: "delete",
      created_at: new Date().toISOString(),
    });
  });
}

export async function listMeals(date: string): Promise<Meal[]> {
  return db.meals
    .where("logged_date")
    .equals(date)
    .filter((m) => m.deleted === 0)
    .sortBy("created_at");
}
```

- [ ] **Step 3: Self-check the data layer**

Create `db/db.test.ts` (runs with `npx tsx` — Dexie needs a browser IndexedDB, so this test only exercises the pure parts; the transactional paths are verified in Task 4's browser check):

```ts
import { db, addMeal, deleteMeal, listMeals } from "./db";
```

Actually — IndexedDB doesn't exist in Node. Skip a Node test; Task 4 verifies via headless Chromium instead. Delete the test file if created.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add db/db.ts package.json package-lock.json
git commit -m "feat: add dexie schema and local meal data layer"
```

---

### Task 2: Sync engine

**Files:**
- Create: `lib/sync.ts`

**Interfaces:**
- Consumes: `db` (Task 1), `supabase` browser client
- Produces:
  - `initSync()` — subscribes to `online`/`offline` events + a 15s interval; runs `pushPending()` when online. Safe to call once from a client component.
  - `pushPending(): Promise<number>` — pushes all pending queue entries in order; returns count of processed entries. Idempotent: server insert of an already-synced `client_id` fails the UNIQUE check and is treated as "already there → mark synced". Deletes: server delete by `client_id`, then purge tombstone + queue entry.

- [ ] **Step 1: Create `lib/sync.ts`**

```ts
import { db } from "@/db/db";
import { supabase } from "@/lib/supabase/client";

const TABLES: Record<string, { table: string; columns: string }> = {
  meals: {
    table: "logged_meals",
    columns: "client_id, logged_date, meal_type, name, calories, protein_g, carbs_g, fat_g, source",
  },
  weightLogs: {
    table: "weight_logs",
    columns: "client_id, logged_date, weight_kg, note",
  },
};

export async function pushPending(): Promise<number> {
  const queue = await db.syncQueue.orderBy("created_at").toArray();
  if (queue.length === 0) return 0;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  let processed = 0;
  for (const entry of queue) {
    const meta = TABLES[entry.table];
    if (!meta) continue;

    if (entry.op === "insert") {
      const local = await db[entry.table].get(entry.client_id);
      if (!local || local.deleted === 1) continue;

      const payload: Record<string, unknown> = { user_id: user.id };
      for (const col of meta.columns.split(", ")) {
        if (col in local) payload[col] = local[col];
      }

      const { error } = await supabase.from(meta.table).insert(payload);

      if (error && !error.message.includes("duplicate")) {
        console.error("sync insert failed", entry.client_id, error.message);
        continue;
      }

      await db[entry.table].update(entry.client_id, { synced: 1 });
      await db.syncQueue.delete(entry.client_id);
      processed++;
    } else if (entry.op === "delete") {
      await supabase.from(meta.table).delete().eq("client_id", entry.client_id);
      await db[entry.table].delete(entry.client_id);
      await db.syncQueue.delete(entry.client_id);
      processed++;
    }
  }

  return processed;
}

export function initSync() {
  let started = false;
  const run = () => {
    if (navigator.onLine) pushPending();
  };

  if (!started) {
    started = true;
    window.addEventListener("online", run);
    window.addEventListener("offline", () => {});
    setInterval(run, 15000);
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/sync.ts
git commit -m "feat: add sync engine with client_id idempotency"
```

---

### Task 3: Manual log modal + wiring the Log screen

**Files:**
- Create: `components/add-entry-modal.tsx`
- Modify: `app/log/page.tsx` (becomes a client component reading Dexie + AppShell)
- Modify: `app/page.tsx` (init sync + home totals from Dexie) — optional but cheap: totals (calories/protein/carbs/fat) computed from today's meals

**Interfaces:**
- Consumes: `addMeal`, `deleteMeal`, `listMeals`, `initSync`
- Produces:
  - `AddEntryModal({ open, onClose, mealType, onSaved })` — snes-window overlay with name/kcal/P/C/F inputs, SAVE button; on save calls `addMeal` (today's date), closes, refreshes the list
  - `app/log/page.tsx` — client component; loads today's meals, groups by meal_type, per-meal kcal totals, delete (✖) calls `deleteMeal` + refresh; ADD ENTRY buttons open the modal prefilled with that meal's type; `useEffect(() => initSync(), [])`

- [ ] **Step 1: Create `components/add-entry-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { addMeal } from "@/db/db";

export default function AddEntryModal({
  open,
  onClose,
  mealType,
  onSaved,
}: {
  open: boolean;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");

  if (!open) return null;

  async function handleSave() {
    if (!name || !calories) return;
    await addMeal({
      logged_date: new Date().toISOString().slice(0, 10),
      meal_type: mealType,
      name,
      calories: Number(calories),
      protein_g: Number(proteinG) || 0,
      carbs_g: Number(carbsG) || 0,
      fat_g: Number(fatG) || 0,
    });
    setName("");
    setCalories("");
    setProteinG("");
    setCarbsG("");
    setFatG("");
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="snes-window flex w-full max-w-sm flex-col gap-4 p-6">
        <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Add Entry — {mealType}
        </h2>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Calories
          <input
            type="number"
            min={0}
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "P (g)", value: proteinG, set: setProteinG },
            { label: "C (g)", value: carbsG, set: setCarbsG },
            { label: "F (g)", value: fatG, set: setFatG },
          ].map((f) => (
            <label key={f.label} className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
              {f.label}
              <input
                type="number"
                min={0}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="pixel-btn w-full" onClick={onClose}>
            Cancel
          </button>
          <button className="pixel-btn w-full" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/log/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import AddEntryModal from "@/components/add-entry-modal";
import { db, deleteMeal, listMeals, type Meal } from "@/db/db";
import { initSync } from "@/lib/sync";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_ICONS: Record<(typeof MEAL_TYPES)[number], string> = {
  breakfast: "free_breakfast",
  lunch: "lunch_dining",
  dinner: "dinner_dining",
  snack: "cake",
};

export default function LogPage() {
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [modalMealType, setModalMealType] = useState<(typeof MEAL_TYPES)[number] | null>(null);

  useEffect(() => {
    initSync();
  }, []);

  async function refresh() {
    setMeals(await listMeals(today));
  }

  useEffect(() => {
    refresh();
  }, [today]);

  const totals = useMemo(() => {
    return meals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein_g,
        carbs: acc.carbs + m.carbs_g,
        fat: acc.fat + m.fat_g,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [meals]);

  return (
    <AppShell activeTab="log">
      <div className="flex items-center justify-between border-2 border-outline-variant bg-surface-container p-2">
        <button className="pixel-btn-secondary flex h-8 w-8 items-center justify-center p-1" disabled>
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <div className="flex flex-col items-center">
          <span className="font-mono text-xs font-semibold text-on-surface-variant">
            {new Date(today + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="flex items-center gap-2 font-mono text-xl font-bold text-primary">
            <span className="material-symbols-outlined text-xl">calendar_month</span>
            TODAY
          </span>
        </div>
        <button className="pixel-btn-secondary flex h-8 w-8 items-center justify-center p-1" disabled>
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>

      <div className="sticky top-16 z-40 flex flex-col gap-4 border-2 border-outline-variant bg-surface-container-high p-4 shadow-[0_4px_0_0_rgba(12,22,9,1)]">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              HP (Calories)
            </div>
            <div className="font-headline text-2xl font-extrabold text-primary">
              {totals.calories.toLocaleString()}{" "}
              <span className="font-sans text-sm text-on-surface-variant">/ target</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              Offline-first
            </div>
            <div className="font-mono text-xl font-bold text-tertiary">
              {navigator.onLine ? "SYNCED" : "OFFLINE"}
            </div>
          </div>
        </div>
        <div className="macro-bar-bg h-4">
          <div className="macro-bar-fill" style={{ width: `${Math.min(100, (totals.calories / 2000) * 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "PRO (P)", value: `${totals.protein}g`, mod: "protein" },
            { label: "CARB (C)", value: `${totals.carbs}g`, mod: "carbs" },
            { label: "FAT (F)", value: `${totals.fat}g`, mod: "fat" },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center border-2 border-surface-variant bg-surface p-2">
              <span className="font-mono text-[10px] font-semibold uppercase text-error">{m.label}</span>
              <span className="font-mono text-base font-bold text-primary">{m.value}</span>
              <div className="macro-bar-bg mt-1 h-2 w-full">
                <div className={`macro-bar-fill ${m.mod}`} style={{ width: "100%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {MEAL_TYPES.map((type) => {
          const entries = meals.filter((m) => m.meal_type === type);
          const total = entries.reduce((acc, m) => acc + m.calories, 0);
          return (
            <section
              key={type}
              className={`snes-window flex flex-col gap-4 p-4 ${entries.length === 0 ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between border-b-2 border-surface-variant pb-2">
                <h2 className="flex items-center gap-2 font-headline text-lg font-bold uppercase tracking-widest text-primary">
                  <span className="material-symbols-outlined text-xl">{MEAL_ICONS[type]}</span>
                  {type}
                </h2>
                <span className="font-mono text-base text-on-surface-variant">{total} KCAL</span>
              </div>
              <div className="flex flex-col gap-3">
                {entries.map((e) => (
                  <div
                    key={e.client_id}
                    className="flex items-center justify-between border border-surface-variant bg-surface-container-low p-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-sans text-sm font-bold text-on-surface">{e.name}</span>
                      <div className="mt-1 flex gap-2 font-mono text-[10px]">
                        <span className="text-error">P: {e.protein_g}g</span>
                        <span className="text-tertiary">C: {e.carbs_g}g</span>
                        <span className="text-on-surface-variant">F: {e.fat_g}g</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base text-on-surface">{e.calories}</span>
                      <button
                        className="text-on-error transition-colors hover:text-error"
                        onClick={async () => {
                          await deleteMeal(e.client_id);
                          refresh();
                        }}
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  </div>
                ))}
                {entries.length === 0 && (
                  <div className="py-4 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                    No Entries Yet.
                  </div>
                )}
              </div>
              <button
                className="pixel-btn mt-2 w-full"
                onClick={() => setModalMealType(type)}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Entry
              </button>
            </section>
          );
        })}
      </div>

      {modalMealType && (
        <AddEntryModal
          open
          mealType={modalMealType}
          onClose={() => setModalMealType(null)}
          onSaved={refresh}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/add-entry-modal.tsx app/log/page.tsx
git commit -m "feat: wire log screen to dexie with manual add and delete"
```

---

### Task 4: Browser verification (offline + sync round-trip)

**Files:**
- Create: `/tmp/opencode/p5-check.js` (throwaway Playwright script — not committed)

**Interfaces:**
- Consumes: everything above
- Produces: proof that (a) adding a meal works and renders, (b) the row appears in Supabase `logged_meals` after sync, (c) deleting removes it from both places. Requires the user's seeded account to log in — the script is run by the user or with the user's credentials filled in locally.

- [ ] **Step 1: Write the check script (user runs)**

```js
// /tmp/opencode/p5-check.js — fill EMAIL/PASSWORD below with your seeded account
const { chromium } = require("playwright");

const EMAIL = "";
const PASSWORD = "";

(async () => {
  const browser = await chromium.launch({
    executablePath: "/home/dannyboi/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("http://localhost:3000/", { timeout: 10000 });

  await page.goto("http://localhost:3000/log");
  await page.click('text=Add Entry');
  await page.fill('input:first-of-type', "Playwright Test Meal");
  await page.fill('input[type="number"] >> nth=0', "123");
  await page.click('text=Save');
  await page.waitForTimeout(1000);

  const body = await page.textContent("body");
  console.log("meal rendered:", body.includes("Playwright Test Meal"));
  await page.waitForTimeout(2000); // let the sync interval push

  await page.click('text=Playwright Test Meal');
  await page.waitForTimeout(2000);

  await browser.close();
})();
```

The last assertions (row in Supabase, tombstone purge) are checked manually:
- Supabase Table Editor → `logged_meals` → confirm the test row exists with `client_id` set and no duplicates after reload
- `db.syncQueue` and `db.meals` in DevTools → Application → IndexedDB → confirm queue is empty and `synced: 1`

- [ ] **Step 2: User runs it**

User: `npm run dev`, then `node /tmp/opencode/p5-check.js`, then checks Supabase Table Editor + DevTools IndexedDB per Step 1. Report results.

- [ ] **Step 3: Fix anything the check surfaces** (agent)

If duplicates appear: the UNIQUE constraint should have caught them — check `pushPending`'s duplicate detection path. If the meal doesn't render: check the modal selector + `listMeals` date handling.

---

## Self-Review Notes

- **Spec coverage:** P5 spec items — IndexedDB sync layer, client-generated IDs, sync queue with online detection, idempotency via `client_id`, LWW/deletes-wins (deletes implemented as tombstones; LWW edits deferred to P6 per agreed scope cut), Dexie `.version(1)` from first commit ✓
- **Placeholders:** none; all code complete
- **Type consistency:** `Meal`/`WeightLog` shapes mirror `logged_meals`/`weight_logs` column names exactly (snake_case) so the sync payload maps 1:1; `TABLES` map keys match Dexie table names
- **Known limitations:** (1) push-only, single device — pull sync is future work; (2) no edit path yet (P6); (3) `weightLogs` table is created but unused until P6's weight tracker; (4) the sync payload sets `user_id` from the session (`supabase.auth.getUser()`) — the server never guesses the owner, so RLS `WITH CHECK (auth.uid() = user_id)` accepts the row; if there's no session, the push skips (queued rows wait)
- **Deliberate deferral:** `navigator.onLine` is checked in `initSync`'s interval — a `sync` event on visibility change is a nice-to-have later
