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
        <button className="pixel-btn w-full border-b-[#775e00] border-l-[#ffe08b] border-r-[#775e00] border-t-[#ffe08b] bg-tertiary-container p-3 text-on-tertiary-container">
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
