# P2 Static Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real component kit and two static screens (Home Dashboard, Calorie Tracker) that faithfully reproduce the Stitch screens, mobile-first.

**Architecture:** Shared retro CSS (scanlines, SNES windows, 3D pixel buttons, macro bars) as plain CSS classes on top of the P1 token theme; a reusable `AppShell` (fixed header + bottom nav + content slot); each screen is a server component with static mock data. Screens are matched closely to the Stitch HTML exports (Home = `stitch-home.html`, Tracker = `stitch-tracker.html`).

**Tech Stack:** Next.js App Router, Tailwind v4, Material Symbols Outlined (icon font — Stitch screens use it; overrides the PRD's Lucide choice per user's "match screens closely" decision).

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- All screens: `max-w-[600px] mx-auto` shell, `pt-20 pb-24` main content, `overflow-x-hidden` on body
- Icons via `<span class="material-symbols-outlined">name</span>`, filled variant via inline `style={{ fontVariationSettings: "'FILL' 1" }}`
- Colors used: existing P1 tokens plus `#79ff5b` (primary-fixed), `#ffe08b` (tertiary-fixed), `#f1c100` (tertiary-fixed-dim), `#071105` (surface-container-lowest), `#141e11` (surface-container-low), `#222d1e` (surface-container-high), `#2d3828` (surface-variant), `#ffdad5` (secondary-fixed)
- Radius: zero (Retro-Brutalist); macro colors: protein `#c5020b`, carbs `#f1c100`, fat `#85967c`
- Mock data lives in the page files; no data layer yet (P5+)

---

### Task 1: Retro CSS layer + Material Symbols

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: P1 tokens (`--color-*`, `font-headline`, `font-mono`, `font-sans`)
- Produces CSS classes used by later tasks: `scanlines`, `snes-window`, `pixel-btn`, `pixel-btn-secondary`, `pixel-btn-danger`, `macro-bar-bg`, `macro-bar-fill` (with `.protein`/`.carbs`/`.fat` modifiers), `no-scrollbar`, `material-symbols-outlined` (via font link)

- [ ] **Step 1: Append retro CSS to `app/globals.css`**

Add after the `body` rule:

```css
* {
  border-radius: 0;
}

body {
  background-color: var(--color-background);
  color: var(--color-on-surface);
  position: relative;
  overflow-x: hidden;
}

body::before {
  content: " ";
  display: block;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
    linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
  background-size: 100% 4px, 6px 100%;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.8;
}

.snes-window {
  background-color: #0c1609;
  border: 2px solid #85967c;
  position: relative;
  box-shadow:
    inset 2px 2px 0 0 rgba(255, 255, 255, 0.1),
    inset -2px -2px 0 0 rgba(0, 0, 0, 0.5);
}

.snes-window::before,
.snes-window::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: #39ff14;
}

.snes-window::before {
  top: 0;
  left: 0;
}

.snes-window::after {
  bottom: 0;
  right: 0;
}

.pixel-btn {
  background-color: #39ff14;
  color: #053900;
  border-top: 2px solid #79ff5b;
  border-left: 2px solid #79ff5b;
  border-right: 2px solid #107100;
  border-bottom: 4px solid #107100;
  font-family: var(--font-jetbrains), monospace;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.1s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.pixel-btn:active {
  transform: translateY(2px);
  border-bottom-width: 2px;
}

.pixel-btn-secondary {
  background-color: #2d3828;
  color: #dae6d0;
  border-top: 2px solid #3c4b35;
  border-left: 2px solid #3c4b35;
  border-right: 2px solid #141e11;
  border-bottom: 4px solid #141e11;
}

.pixel-btn-danger {
  background-color: #c5020b;
  color: #ffdad6;
  border-top: 2px solid #ffb4ab;
  border-left: 2px solid #ffb4ab;
  border-right: 2px solid #690005;
  border-bottom: 4px solid #690005;
}

.macro-bar-bg {
  background-color: #141e11;
  border: 2px solid #3c4b35;
  height: 12px;
  width: 100%;
  position: relative;
}

.macro-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #39ff14, #2ae500);
}

.macro-bar-fill.protein {
  background: linear-gradient(90deg, #ffb4aa, #c5020b);
}

.macro-bar-fill.carbs {
  background: linear-gradient(90deg, #ffe08b, #f1c100);
}

.macro-bar-fill.fat {
  background: linear-gradient(90deg, #dae6d0, #85967c);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

(Note: the P1 `body` rule and `pixel-border` utility stay — `pixel-border` is kept for later phases; `snes-window` replaces `PixelBox` for these screens.)

- [ ] **Step 2: Add Material Symbols font link to `app/layout.tsx`**

Add inside the `<head>` tag (before the closing tag):

```tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    rel="stylesheet"
  />
</head>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add retro CSS layer and Material Symbols font"
```

---

### Task 2: AppShell (header + bottom nav)

**Files:**
- Create: `components/app-shell.tsx`
- Modify: `app/page.tsx` (use AppShell, keep demo content temporarily)
- Modify: `app/log/page.tsx` (create if not exists, with placeholder)

**Interfaces:**
- Consumes: Task 1 CSS classes
- Produces: `AppShell({ activeTab, children })` — renders scanlines overlay, fixed header ("RETROFIT 8-BIT" + account/settings buttons), fixed bottom nav (Home/Log/Scan/Weight/TDEE, active tab highlighted with ▲ and FILL icon), and the content slot. `activeTab: "home" | "log" | "scan" | "weight" | "tdee"`. Later screens wrap their content in `<AppShell activeTab="...">`.

- [ ] **Step 1: Create `components/app-shell.tsx`**

```tsx
const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "log", label: "Log", icon: "reorder" },
  { id: "scan", label: "Scan", icon: "qr_code_scanner" },
  { id: "weight", label: "Weight", icon: "monitor_weight" },
  { id: "tdee", label: "TDEE", icon: "analytics" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export default function AppShell({
  activeTab,
  children,
}: {
  activeTab: TabId;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="fixed top-0 z-50 mx-auto flex h-16 w-full max-w-[600px] items-center justify-between border-b-2 border-outline-variant bg-surface px-4">
        <div className="truncate font-headline text-lg font-extrabold uppercase tracking-widest text-primary">
          RetroFit 8-Bit
        </div>
        <div className="flex items-center gap-4">
          <button className="text-on-surface-variant transition-transform active:scale-95">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_circle
            </span>
          </button>
          <button className="text-on-surface-variant transition-transform active:scale-95">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              settings
            </span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[600px] flex-col gap-6 px-4 pb-24 pt-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-50 flex h-20 w-full max-w-[600px] -translate-x-1/2 items-center justify-around border-t-2 border-outline-variant bg-surface-container-lowest px-2 pb-2">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              className={`flex w-16 flex-col items-center justify-center transition-all active:translate-y-0.5 ${
                active ? "text-primary" : "text-on-surface-variant opacity-70 hover:opacity-100"
              }`}
            >
              {active && <span className="mb-1 text-[8px] text-primary">▲</span>}
              <span
                className="material-symbols-outlined mb-1 text-2xl"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {tab.icon}
              </span>
              <span className={`font-mono text-[10px] uppercase tracking-wider ${active ? "text-primary" : ""}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Wrap the demo page in AppShell**

Replace the demo content in `app/page.tsx` with:

```tsx
import AppShell from "@/components/app-shell";

export default function Home() {
  return (
    <AppShell activeTab="home">
      <p className="font-mono text-xs text-on-surface-variant">HOME // P2 IN PROGRESS</p>
    </AppShell>
  );
}
```

- [ ] **Step 3: Create `app/log/page.tsx` placeholder**

```tsx
import AppShell from "@/components/app-shell";

export default function LogPage() {
  return (
    <AppShell activeTab="log">
      <p className="font-mono text-xs text-on-surface-variant">LOG // P2 IN PROGRESS</p>
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell.tsx app/page.tsx app/log/page.tsx
git commit -m "feat: add AppShell with header and bottom nav"
```

---

### Task 3: Home Dashboard screen

**Files:**
- Modify: `app/page.tsx`
- Delete: `components/pixel-box.tsx` (superseded by `snes-window`)

**Interfaces:**
- Consumes: `AppShell`, Task 1 CSS classes
- Produces: the Home screen — DAILY OVERVIEW heading, Energy dialog with HP bar, macro mini-bars (P/C/F), action row (Log Manually, Scan Meal), Weight Trend card with SVG line graph, Recent Logs list (3 items, Dinner unlogged)

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import AppShell from "@/components/app-shell";

const MACROS = [
  { label: "P", value: "110g", pct: 73, color: "#c5020b" },
  { label: "C", value: "160g", pct: 72, color: "#f1c100" },
  { label: "F", value: "45g", pct: 69, color: "#2ae500" },
];

const RECENT_LOGS = [
  { meal: "Breakfast", name: "Oats & Berries", kcal: 340, icon: "bakery_dining", color: "#ffdad5" },
  { meal: "Lunch", name: "Chicken Salad", kcal: 520, icon: "lunch_dining", color: "#ffe08b" },
];

export default function Home() {
  return (
    <AppShell activeTab="home">
      <section className="flex flex-col gap-4">
        <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
          <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
            Daily Overview
          </h1>
        </div>

        <div className="snes-window flex flex-col gap-4 p-3">
          <div className="flex items-end justify-between">
            <span className="font-mono text-xs font-semibold uppercase text-on-surface-variant">Energy</span>
            <span className="font-mono text-xl font-bold text-primary">1,450 / 2,000 kcal</span>
          </div>
          <div className="relative h-6 w-full overflow-hidden border-2 border-outline-variant bg-surface p-[2px]">
            <div className="h-full w-[72.5%] bg-gradient-to-r from-primary to-primary-container">
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {MACROS.map((m) => (
              <div key={m.label} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] font-semibold uppercase" style={{ color: m.color }}>
                  {m.label}: {m.value}
                </span>
                <div className="h-3 w-full border-2 border-outline-variant bg-surface p-[1px]">
                  <div className="h-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <button className="pixel-btn w-full p-3">
          <span className="material-symbols-outlined text-lg">add</span>
          <span>Log Manually</span>
        </button>
        <button className="pixel-btn w-full border-l-[#ffe08b] border-t-[#ffe08b] border-b-[#775e00] border-r-[#775e00] bg-tertiary-container text-on-tertiary-container p-3">
          <span className="material-symbols-outlined text-lg">camera_alt</span>
          <span>Scan Meal</span>
        </button>
      </section>

      <section className="snes-window flex flex-col gap-4 p-3">
        <div className="flex items-center justify-between border-b-2 border-outline-variant pb-2">
          <h2 className="flex items-center gap-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            <span className="material-symbols-outlined text-xl">monitoring</span>
            <span>Weight Trend</span>
          </h2>
          <span className="font-mono text-sm font-bold text-primary">-1.2 kg</span>
        </div>
        <div className="relative flex h-32 w-full items-end overflow-hidden border-2 border-outline-variant bg-surface-container-low p-2">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(var(--color-surface-variant) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-variant) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          <svg className="relative z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              fill="none"
              points="0,80 20,75 40,60 60,65 80,40 100,30"
              stroke="var(--color-tertiary)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <circle cx="100" cy="30" r="4" fill="var(--color-tertiary)" />
          </svg>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="ml-1 font-mono text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Recent Logs
        </h2>
        {RECENT_LOGS.map((log) => (
          <div
            key={log.meal}
            className="snes-window flex cursor-pointer items-center justify-between p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border-2 border-outline-variant bg-surface-bright">
                <span className="material-symbols-outlined" style={{ color: log.color }}>
                  {log.icon}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-sm font-bold uppercase text-on-surface">{log.meal}</span>
                <span className="font-mono text-[10px] text-on-surface-variant">{log.name}</span>
              </div>
            </div>
            <span className="font-mono text-sm font-bold text-primary">{log.kcal} kcal</span>
          </div>
        ))}
        <div className="snes-window flex cursor-pointer items-center justify-between p-3 opacity-70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-dashed border-surface-variant bg-surface-container-high">
              <span className="material-symbols-outlined text-on-surface-variant">add</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline text-sm font-bold uppercase text-on-surface-variant">Dinner</span>
              <span className="font-mono text-[10px] text-on-surface-variant">Not Logged Yet</span>
            </div>
          </div>
          <span className="font-mono text-sm text-on-surface-variant">-- kcal</span>
        </div>
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 2: Delete the superseded component**

```bash
git rm components/pixel-box.tsx
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: build home dashboard screen"
```

---

### Task 4: Calorie Tracker screen

**Files:**
- Modify: `app/log/page.tsx`

**Interfaces:**
- Consumes: `AppShell`, Task 1 CSS classes
- Produces: the Log screen — date navigator (OCT 24, 199X / TODAY), sticky calorie summary (HP total, remaining, macro cards), three meal windows (Breakfast with 2 entries, Lunch with 1, Dinner empty) each with ADD ENTRY button and delete (close) buttons on entries

- [ ] **Step 1: Replace `app/log/page.tsx`**

```tsx
import AppShell from "@/components/app-shell";

const MEALS = [
  {
    name: "Breakfast",
    icon: "free_breakfast",
    total: 420,
    entries: [
      { name: "Oatmeal & Berries", kcal: 320, p: 10, c: 55, f: 5 },
      { name: "Black Coffee", kcal: 10, p: 1, c: 0, f: 0 },
    ],
  },
  {
    name: "Lunch",
    icon: "lunch_dining",
    total: 450,
    entries: [{ name: "Grilled Chicken Salad", kcal: 450, p: 45, c: 15, f: 22 }],
  },
  {
    name: "Dinner",
    icon: "dinner_dining",
    total: 0,
    entries: [],
  },
];

const MACRO_SUMMARY = [
  { label: "PRO (P)", value: "85g", pct: 60, mod: "protein" },
  { label: "CARB (C)", value: "120g", pct: 45, mod: "carbs" },
  { label: "FAT (F)", value: "45g", pct: 70, mod: "fat" },
];

export default function LogPage() {
  return (
    <AppShell activeTab="log">
      <div className="flex items-center justify-between border-2 border-outline-variant bg-surface-container p-2">
        <button className="pixel-btn-secondary flex h-8 w-8 items-center justify-center p-1">
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <div className="flex flex-col items-center">
          <span className="font-mono text-xs font-semibold text-on-surface-variant">OCT 24, 199X</span>
          <span className="flex items-center gap-2 font-mono text-xl font-bold text-primary">
            <span className="material-symbols-outlined text-xl">calendar_month</span>
            TODAY
          </span>
        </div>
        <button className="pixel-btn-secondary flex h-8 w-8 items-center justify-center p-1">
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
              1,240 <span className="font-sans text-sm text-on-surface-variant">/ 2,400</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              Remaining
            </div>
            <div className="font-mono text-xl font-bold text-tertiary">1,160</div>
          </div>
        </div>
        <div className="macro-bar-bg h-4">
          <div className="macro-bar-fill" style={{ width: "52%" }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MACRO_SUMMARY.map((m) => (
            <div key={m.label} className="flex flex-col items-center border-2 border-surface-variant bg-surface p-2">
              <span className="font-mono text-[10px] font-semibold uppercase text-error">{m.label}</span>
              <span className="font-mono text-base font-bold text-primary">{m.value}</span>
              <div className="macro-bar-bg mt-1 h-2 w-full">
                <div className={`macro-bar-fill ${m.mod}`} style={{ width: `${m.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {MEALS.map((meal) => (
          <section
            key={meal.name}
            className={`snes-window flex flex-col gap-4 p-4 ${meal.entries.length === 0 ? "opacity-70" : ""}`}
          >
            <div className="flex items-center justify-between border-b-2 border-surface-variant pb-2">
              <h2 className="flex items-center gap-2 font-headline text-lg font-bold uppercase tracking-widest text-primary">
                <span className="material-symbols-outlined text-xl">{meal.icon}</span>
                {meal.name}
              </h2>
              <span className="font-mono text-base text-on-surface-variant">{meal.total} KCAL</span>
            </div>
            <div className="flex flex-col gap-3">
              {meal.entries.map((e) => (
                <div
                  key={e.name}
                  className="flex items-center justify-between border border-surface-variant bg-surface-container-low p-2"
                >
                  <div className="flex flex-col">
                    <span className="font-sans text-sm font-bold text-on-surface">{e.name}</span>
                    <div className="mt-1 flex gap-2 font-mono text-[10px]">
                      <span className="text-error">P: {e.p}g</span>
                      <span className="text-tertiary">C: {e.c}g</span>
                      <span className="text-on-surface-variant">F: {e.f}g</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base text-on-surface">{e.kcal}</span>
                    <button className="text-on-error transition-colors hover:text-error">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </div>
              ))}
              {meal.entries.length === 0 && (
                <div className="py-4 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                  No Entries Yet.
                </div>
              )}
            </div>
            <button className="pixel-btn mt-2 w-full">
              <span className="material-symbols-outlined text-base">add</span>
              Add Entry
            </button>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/log/page.tsx
git commit -m "feat: build calorie tracker screen"
```

---

### Task 5: Lint, mobile overflow check, screenshots

**Files:**
- Create: `public/p2-home.png`, `public/p2-log.png` (verification artifacts, committed so the user can review)
- No source changes expected

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: exit 0, no errors.

- [ ] **Step 2: Measure mobile overflow with headless Chromium**

Dev server:
```bash
npm run dev > /tmp/opencode/retrofit-dev.log 2>&1 &
sleep 5
```
Then run `/tmp/opencode/measure.js` (Playwright, viewport 430×932, chromium binary at `/home/dannyboi/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`) against both `/` and `/log`.
Expected: `scrollWidth === innerWidth === 430`, `overflowing: []` on both routes.

- [ ] **Step 3: Capture screenshots for user review**

Extend the measure script (or run a one-off) to screenshot both routes at 430×932 into `public/p2-home.png` and `public/p2-log.png`.

- [ ] **Step 4: Kill dev server**

```bash
pkill -f "next dev" || true
```

- [ ] **Step 5: Commit**

```bash
git add public/p2-home.png public/p2-log.png
git commit -m "chore: add P2 verification screenshots"
```

---

## Self-Review Notes

- **Spec coverage:** P2 spec items — component kit (snes-window, pixel-btn, macro bars, AppShell), static Home + Tracker screens matching Stitch HTML exports, mobile-first ✓
- **Placeholders:** none; all code complete
- **Type consistency:** `AppShell` props (`activeTab`) match across Tasks 2–4; CSS class names (`snes-window`, `pixel-btn-*`, `macro-bar-*`) defined in Task 1 and used verbatim later
- **Deliberate deviations:** (1) Material Symbols replaces PRD's Lucide (screens win per user decision); (2) one unified scanline overlay (tracker's stronger variant) instead of home's subtle div; (3) `PixelBox` deleted (superseded by `snes-window`); (4) Scan Meal button uses tertiary container colors via inline overrides since Tailwind v4 can't target the pseudo-styled bevel borders by class
