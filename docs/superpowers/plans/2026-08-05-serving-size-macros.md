# Serving-Size Control with Auto-Adjusting Macros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set each meal item's serving size in grams or servings; macros auto-scale proportionally, while manual macro editing stays fully available.

**Architecture:** A pure math module (`lib/serving.ts`) holds the canonical model: per-100g macros are ground truth, displayed macros are derived (`per100 × amount_in_g / 100`). The scan review page and the add-entry modal both convert their rows to this model; the DB schema and save path are untouched (serving size is session-only).

**Tech Stack:** TypeScript (React 19 / Next 16 client components), existing Dexie save path, `npx tsx` for tests (existing pattern in `lib/ai.test.ts`, `lib/tdee.test.ts`).

## Global Constraints

- **No DB changes.** `db/db.ts`, `addMeal`, `Meal` type, sync — all untouched. Serving size lives only during review/entry.
- **No new dependencies.** Tests run via `npx tsx` (already the repo pattern).
- **Keep manual macro editing.** P/C/F (and kcal) inputs stay editable; edits invert into the per-100g basis.
- **Proportional rescale (user-approved):** when serving size changes, ALL displayed macros rescale by the ratio — including prior manual edits.
- **UI style:** match existing pixel style — `border-2 border-outline-variant`, `bg-surface`, `font-mono`, `material-symbols-outlined` icons, active states like `bg-surface-container-high text-primary`.
- Verify with: `npx tsx lib/serving.test.ts` → prints `serving ok`; `npx tsx lib/ai.test.ts` → prints `ai ok`; `npm run build` → exit 0; `npm run lint` → clean.
- Commit style: `feat: <short description>` (repo uses lowercase `feat:` / imperative).
- Line numbers in this plan reference the current files; locate code by content if they shifted.

---

### Task 1: `lib/serving.ts` — per-100g macro math + test

**Files:**
- Create: `lib/serving.ts`
- Test: `lib/serving.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `export type Unit = "g" | "serving"`
  - `export type Per100 = { calories: number; proteinG: number; carbsG: number; fatG: number }`
  - `export function amountToGrams(amount: number, unit: Unit, gPerServing: number): number`
  - `export function toDisplayed(per100: Per100, unit: Unit, amount: number, gPerServing: number): Per100`
  - `export function fromDisplayed(macros: Per100, unit: Unit, amount: number, gPerServing: number): Per100`
  - `export function convertAmount(amount: number, from: Unit, to: Unit, gPerServing: number): number`

- [ ] **Step 1: Write the failing test**

Create `lib/serving.test.ts`:

```ts
import { toDisplayed, fromDisplayed, convertAmount, amountToGrams } from "./serving";

const per100 = { calories: 500, proteinG: 10, carbsG: 20, fatG: 5 };

const d = toDisplayed(per100, "g", 200, 100);
console.assert(d.calories === 1000 && d.proteinG === 20 && d.carbsG === 40 && d.fatG === 10, "200g doubles per-100g");

const s = toDisplayed(per100, "serving", 0.5, 200);
console.assert(s.calories === 500 && s.proteinG === 10 && s.carbsG === 20 && s.fatG === 5, "0.5 serving of 200g = 100g");

console.assert(amountToGrams(2, "serving", 150) === 300, "servings to grams");
console.assert(convertAmount(300, "g", "serving", 150) === 2, "g to servings");
console.assert(convertAmount(2, "serving", "g", 150) === 300, "servings to g");

const rt = fromDisplayed(toDisplayed(per100, "g", 150, 100), "g", 150, 100);
console.assert(rt.calories === 500 && rt.proteinG === 10 && rt.carbsG === 20 && rt.fatG === 5, "invert round-trips");

const zero = fromDisplayed(per100, "g", 0, 100);
console.assert(Number.isFinite(zero.calories) && zero.calories === 500, "zero grams is a no-op, not NaN");

console.log("serving ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/serving.test.ts`
Expected: FAIL — `Cannot find module './serving'` (or `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Write the implementation**

Create `lib/serving.ts`:

```ts
export type Unit = "g" | "serving";

export type Per100 = { calories: number; proteinG: number; carbsG: number; fatG: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function amountToGrams(amount: number, unit: Unit, gPerServing: number): number {
  return unit === "g" ? amount : amount * gPerServing;
}

export function toDisplayed(per100: Per100, unit: Unit, amount: number, gPerServing: number): Per100 {
  const f = amountToGrams(amount, unit, gPerServing) / 100;
  return {
    calories: round1(per100.calories * f),
    proteinG: round1(per100.proteinG * f),
    carbsG: round1(per100.carbsG * f),
    fatG: round1(per100.fatG * f),
  };
}

export function fromDisplayed(macros: Per100, unit: Unit, amount: number, gPerServing: number): Per100 {
  const grams = amountToGrams(amount, unit, gPerServing);
  if (grams <= 0) return macros;
  const f = 100 / grams;
  return {
    calories: round1(macros.calories * f),
    proteinG: round1(macros.proteinG * f),
    carbsG: round1(macros.carbsG * f),
    fatG: round1(macros.fatG * f),
  };
}

export function convertAmount(amount: number, from: Unit, to: Unit, gPerServing: number): number {
  const grams = amountToGrams(amount, from, gPerServing);
  return to === "g" ? grams : grams / gPerServing;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/serving.test.ts`
Expected: prints `serving ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/serving.ts lib/serving.test.ts
git commit -m "feat: add per-100g serving math module"
```

---

### Task 2: Scan review — ItemRow migration, serving control, auto-scaling

**Files:**
- Modify: `app/scan/page.tsx`

**Interfaces:**
- Consumes: `toDisplayed`, `fromDisplayed`, `convertAmount`, `amountToGrams`, `type Unit`, `type Per100` from `@/lib/serving` (Task 1).
- Produces: `ItemRow` (new shape, consumed by Task 3's modal by convention), review UI with amount/unit inputs.

- [ ] **Step 1: Update the data model**

In `app/scan/page.tsx`, add the import next to the existing `caloriesFromMacros` import:

```ts
import { toDisplayed, fromDisplayed, convertAmount, type Unit, type Per100 } from "@/lib/serving";
```

Replace the `ItemRow` type (currently lines 15-22) with:

```ts
type ItemRow = {
  name: string;
  portionLabel: string;
  unit: Unit;
  amount: number;
  gPerServing: number;
  per100: Per100;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
};
```

Replace `EMPTY_ITEM` (line 33) with:

```ts
const EMPTY_ITEM: ItemRow = {
  name: "",
  portionLabel: "per 100g",
  unit: "g",
  amount: 100,
  gPerServing: 100,
  per100: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  calories: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
};
```

- [ ] **Step 2: Update seeding — barcode, AI, and not-found paths**

Replace `barcodeReview` (currently lines 62-87) with:

```ts
function barcodeReview(res: {
  name: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  serving_size?: string;
  barcode: string;
}): ReviewResult {
  return {
    description: res.name,
    items: [
      {
        name: res.name,
        portionLabel: res.serving_size ?? "per 100g",
        unit: "g",
        amount: 100,
        gPerServing: 100,
        per100: {
          calories: res.calories ?? 0,
          proteinG: res.protein_g ?? 0,
          carbsG: res.carbs_g ?? 0,
          fatG: res.fat_g ?? 0,
        },
        calories: res.calories ? String(res.calories) : "",
        proteinG: res.protein_g ? String(res.protein_g) : "",
        carbsG: res.carbs_g ? String(res.carbs_g) : "",
        fatG: res.fat_g ? String(res.fat_g) : "",
      },
    ],
    mealType: "snack",
    source: "barcode",
    barcode: res.barcode,
  };
}
```

Replace `applyResult` (currently lines 138-155) with:

```ts
function applyResult(res: {
  description: string;
  reasoning?: string;
  items: {
    name: string;
    portion_description: string;
    estimated_weight_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
}) {
  setNotes("");
  setDescribe("");
  setResult({
    description: res.description,
    reasoning: res.reasoning,
    items: res.items.map((i) => {
      const weight = i.estimated_weight_g > 0 ? i.estimated_weight_g : 100;
      return {
        name: i.name,
        portionLabel: i.portion_description,
        unit: "g",
        amount: weight,
        gPerServing: weight,
        per100: fromDisplayed(
          { calories: i.calories, proteinG: i.protein_g, carbsG: i.carbs_g, fatG: i.fat_g },
          "g",
          weight,
          weight
        ),
        calories: String(i.calories),
        proteinG: String(i.protein_g),
        carbsG: String(i.carbs_g),
        fatG: String(i.fat_g),
      };
    }),
    mealType: "snack",
    source: "ai_scan",
  });
}
```

Update the two `portion:` overrides to `portionLabel:`:
- Barcode-camera error path (line 112): `{ ...EMPTY_ITEM, portion: "Barcode: " + decodedText }` → `{ ...EMPTY_ITEM, portionLabel: "Barcode: " + decodedText }`
- Manual lookup not-found path (line 245): `{ ...EMPTY_ITEM, portion: "Not found — fill in the details" }` → `{ ...EMPTY_ITEM, portionLabel: "Not found — fill in the details" }`

- [ ] **Step 3: Rewrite macro editing + add serving handlers**

Replace `setMacro` (currently lines 200-210) with:

```ts
function setMacro(index: number, key: "proteinG" | "carbsG" | "fatG", value: string) {
  setResult((r) => {
    if (!r) return r;
    const item = r.items[index];
    const next = { ...item, [key]: value };
    const p = Number(next.proteinG) || 0;
    const c = Number(next.carbsG) || 0;
    const f = Number(next.fatG) || 0;
    if (p + c + f > 0) next.calories = String(caloriesFromMacros(p, c, f));
    next.per100 = fromDisplayed(
      { calories: Number(next.calories) || 0, proteinG: p, carbsG: c, fatG: f },
      next.unit,
      next.amount,
      next.gPerServing
    );
    return { ...r, items: r.items.map((it, j) => (j === index ? next : it)) };
  });
}

function setAmount(index: number, value: number) {
  setResult((r) => {
    if (!r) return r;
    const item = r.items[index];
    const d = toDisplayed(item.per100, item.unit, value, item.gPerServing);
    return {
      ...r,
      items: r.items.map((it, j) =>
        j === index
          ? { ...it, amount: value, calories: String(d.calories), proteinG: String(d.proteinG), carbsG: String(d.carbsG), fatG: String(d.fatG) }
          : it
      ),
    };
  });
}

function setUnit(index: number, unit: Unit) {
  setResult((r) => {
    if (!r) return r;
    const item = r.items[index];
    if (item.unit === unit) return r;
    const amount = convertAmount(item.amount, item.unit, unit, item.gPerServing);
    const d = toDisplayed(item.per100, unit, amount, item.gPerServing);
    return {
      ...r,
      items: r.items.map((it, j) =>
        j === index
          ? { ...it, unit, amount, calories: String(d.calories), proteinG: String(d.proteinG), carbsG: String(d.carbsG), fatG: String(d.fatG) }
          : it
      ),
    };
  });
}

function setGPerServing(index: number, gPerServing: number) {
  setResult((r) => {
    if (!r) return r;
    const item = r.items[index];
    const next = { ...item, gPerServing };
    if (item.unit === "serving") {
      const d = toDisplayed(item.per100, item.unit, item.amount, gPerServing);
      next.calories = String(d.calories);
      next.proteinG = String(d.proteinG);
      next.carbsG = String(d.carbsG);
      next.fatG = String(d.fatG);
    }
    return { ...r, items: r.items.map((it, j) => (j === index ? next : it)) };
  });
}
```

- [ ] **Step 4: Add the serving-size UI to each review row**

Replace the portion display line (currently line 406, `<div className="font-mono text-[11px] uppercase text-on-surface-variant">{item.portion}</div>`) with:

```tsx
<div className="flex flex-wrap items-end gap-2">
  <div className="flex flex-col gap-1">
    <span className="font-mono text-[10px] uppercase text-on-surface-variant">Amount</span>
    <div className="flex items-stretch gap-1">
      <input
        type="number"
        min={0}
        step="any"
        aria-label={`Item ${i + 1} amount`}
        value={item.amount}
        onChange={(e) => setAmount(i, Number(e.target.value) || 0)}
        className="w-20 border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
      />
      <div className="flex border-2 border-outline-variant">
        {(["g", "serving"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={item.unit === u}
            onClick={() => setUnit(i, u)}
            className={`px-2 py-1.5 font-mono text-[10px] font-bold uppercase transition-colors ${
              item.unit === u
                ? "bg-surface-container-high text-primary"
                : "bg-surface text-on-surface-variant opacity-60"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  </div>
  {item.unit === "serving" && (
    <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
      g / serving
      <input
        type="number"
        min={0}
        step="any"
        value={item.gPerServing}
        onChange={(e) => setGPerServing(i, Number(e.target.value) || 0)}
        className="w-24 border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
      />
    </label>
  )}
  {item.portionLabel && (
    <span className="ml-auto font-mono text-[11px] uppercase text-on-surface-variant">{item.portionLabel}</span>
  )}
</div>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exit 0, `✓ Compiled successfully`. Then manually verify in the browser (`npm run dev`): AI-scan a meal (or use the describe/upload path), then in Review & Confirm — change the amount from 150g to 300g and confirm all P/C/F/kcal double; switch to `serving` and back; edit a macro, then change amount again (edit must rescale proportionally). Barcode mode: amount defaults to 100g with a `g`/`serving` toggle.

- [ ] **Step 6: Commit**

```bash
git add app/scan/page.tsx
git commit -m "feat: serving-size control with auto-scaling macros in scan review"
```

---

### Task 3: Add Entry modal — same serving control

**Files:**
- Modify: `components/add-entry-modal.tsx`

**Interfaces:**
- Consumes: `toDisplayed`, `fromDisplayed`, `convertAmount`, `type Unit`, `type Per100` from `@/lib/serving` (Task 1); `caloriesFromMacros` from `@/lib/tdee` (existing).
- Produces: modal with serving control; save path unchanged (final totals).

- [ ] **Step 1: Add serving state**

Add imports (next to the existing `addMeal, updateMeal` import):

```ts
import { toDisplayed, fromDisplayed, convertAmount, type Unit, type Per100 } from "@/lib/serving";
import { caloriesFromMacros } from "@/lib/tdee";
```

Add state after the existing `tried` state (line 37):

```ts
const [unit, setUnitSel] = useState<Unit>("g");
const [amount, setAmountSel] = useState(100);
const [gPerServing, setGPerServingSel] = useState(100);
const [per100, setPer100] = useState<Per100>({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
```

Extend the reset `useEffect` (lines 39-56): in the `editing` branch, after setting the macro strings, seed the basis; in the `else` branch reset it too. Replace the whole effect body's two branches:

```ts
if (editing) {
  setName(editing.name);
  setCalories(String(editing.calories));
  setProteinG(String(editing.protein_g));
  setCarbsG(String(editing.carbs_g));
  setFatG(String(editing.fat_g));
  setUnitSel("g");
  setAmountSel(100);
  setGPerServingSel(100);
  setPer100(
    fromDisplayed(
      { calories: editing.calories, proteinG: editing.protein_g, carbsG: editing.carbs_g, fatG: editing.fat_g },
      "g",
      100,
      100
    )
  );
} else {
  setName("");
  setCalories("");
  setProteinG("");
  setCarbsG("");
  setFatG("");
  setUnitSel("g");
  setAmountSel(100);
  setGPerServingSel(100);
  setPer100({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}
```

- [ ] **Step 2: Add serving/macro handlers**

Add before `handleSave`. Note `onCalories` must NOT recompute calories from macros (calories is the field being edited) — it re-inverts `per100` from the full displayed set:

```ts
function onMacro(key: "proteinG" | "carbsG" | "fatG", value: string) {
  if (key === "proteinG") setProteinG(value);
  if (key === "carbsG") setCarbsG(value);
  if (key === "fatG") setFatG(value);
  const p = key === "proteinG" ? Number(value) || 0 : Number(proteinG) || 0;
  const c = key === "carbsG" ? Number(value) || 0 : Number(carbsG) || 0;
  const f = key === "fatG" ? Number(value) || 0 : Number(fatG) || 0;
  const cal = p + c + f > 0 ? caloriesFromMacros(p, c, f) : Number(calories) || 0;
  if (p + c + f > 0) setCalories(String(cal));
  setPer100(fromDisplayed({ calories: cal, proteinG: p, carbsG: c, fatG: f }, unit, amount, gPerServing));
}

function onCalories(value: string) {
  setCalories(value);
  setPer100(
    fromDisplayed(
      { calories: Number(value) || 0, proteinG: Number(proteinG) || 0, carbsG: Number(carbsG) || 0, fatG: Number(fatG) || 0 },
      unit,
      amount,
      gPerServing
    )
  );
}

function onAmount(value: number) {
  setAmountSel(value);
  const d = toDisplayed(per100, unit, value, gPerServing);
  setCalories(String(d.calories));
  setProteinG(String(d.proteinG));
  setCarbsG(String(d.carbsG));
  setFatG(String(d.fatG));
}

function onUnit(u: Unit) {
  if (u === unit) return;
  const next = convertAmount(amount, unit, u, gPerServing);
  setUnitSel(u);
  setAmountSel(next);
  const d = toDisplayed(per100, u, next, gPerServing);
  setCalories(String(d.calories));
  setProteinG(String(d.proteinG));
  setCarbsG(String(d.carbsG));
  setFatG(String(d.fatG));
}

function onGPerServing(v: number) {
  setGPerServingSel(v);
  if (unit !== "serving") return;
  const d = toDisplayed(per100, unit, amount, v);
  setCalories(String(d.calories));
  setProteinG(String(d.proteinG));
  setCarbsG(String(d.carbsG));
  setFatG(String(d.fatG));
}
```

- [ ] **Step 3: Wire the macro inputs to the new handlers**

In the P/C/F grid (lines 146-166), replace `onChange={(e) => f.set(e.target.value)}` with `onChange={(e) => onMacro(f.key, e.target.value)}` and add `key` to each entry in the array:

```tsx
<div className="grid grid-cols-3 gap-2">
  {[
    { label: "P (g)", key: "proteinG" as const, value: proteinG },
    { label: "C (g)", key: "carbsG" as const, value: carbsG },
    { label: "F (g)", key: "fatG" as const, value: fatG },
  ].map((f) => (
    <label
      key={f.label}
      className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant"
    >
      {f.label}
      <input
        type="number"
        min={0}
        value={f.value}
        onChange={(e) => onMacro(f.key, e.target.value)}
        className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
      />
    </label>
  ))}
</div>
```

- [ ] **Step 4: Add the serving control UI + wire calories**

Insert between the Meal type block (ends line 135) and the Calories label (line 136):

```tsx
<div className="flex flex-wrap items-end gap-2">
  <div className="flex flex-col gap-1">
    <span className="font-mono text-xs uppercase text-on-surface-variant">Amount</span>
    <div className="flex items-stretch gap-1">
      <input
        type="number"
        min={0}
        step="any"
        aria-label="Amount"
        value={amount}
        onChange={(e) => onAmount(Number(e.target.value) || 0)}
        className="w-20 border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
      />
      <div className="flex border-2 border-outline-variant">
        {(["g", "serving"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={unit === u}
            onClick={() => onUnit(u)}
            className={`px-2 font-mono text-[10px] font-bold uppercase transition-colors ${
              unit === u ? "bg-surface-container-high text-primary" : "bg-surface text-on-surface-variant opacity-60"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  </div>
  {unit === "serving" && (
    <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
      g / serving
      <input
        type="number"
        min={0}
        step="any"
        value={gPerServing}
        onChange={(e) => onGPerServing(Number(e.target.value) || 0)}
        className="w-24 border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
      />
    </label>
  )}
</div>
```

In the Calories label (lines 136-145), change the input to:

```tsx
<input
  type="number"
  min={0}
  value={calories}
  onChange={(e) => onCalories(e.target.value)}
  className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
/>
```

- [ ] **Step 5: Verify**

Run: `npm run build` → expected exit 0, `✓ Compiled successfully`.
Manual check (`npm run dev`): `/log` → Add Entry → default amount 100g; type macros, then change amount to 200g — all values double; switch to `serving`, adjust g/serving, confirm rescale; edit one macro then change amount — rescale proportional. Edit an existing entry: values appear unchanged at 100g (same macros as saved).

- [ ] **Step 6: Commit**

```bash
git add components/add-entry-modal.tsx
git commit -m "feat: serving-size control with auto-scaling macros in add entry modal"
```

---

### Task 4: Full verification

**Files:** none.

- [ ] **Step 1: Run all checks**

```bash
npx tsx lib/serving.test.ts
npx tsx lib/ai.test.ts
npm run lint
npm run build
```

Expected: `serving ok`, `ai ok`, lint clean, build exit 0. If any check fails, fix and re-run before proceeding.

- [ ] **Step 2: Smoke test the three flows (manual, user)**

- AI scan (photo or describe) → Review & Confirm: change amount (macros rescale), toggle g/serving (amount converts, macros stable), edit macro then change amount (proportional rescale), save → log page shows scaled totals.
- Barcode scan (e.g. a packaged item) → amount defaults to 100g, serving toggle works; save.
- `/log` → Add Entry → serving control behaves; Edit Entry shows saved macros unchanged.

- [ ] **Step 3: Final commit (if any fixes landed)**

```bash
git add -A
git commit -m "fix: serving-size adjustments from verification"
```

(If Step 1 and 2 needed no fixes, skip this commit.)
