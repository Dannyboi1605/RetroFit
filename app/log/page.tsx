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
            <div
              key={m.label}
              className="flex flex-col items-center border-2 border-surface-variant bg-surface p-2"
            >
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
