"use client";

import { useRouter } from "next/navigation";

const TABS = [
  { id: "home", label: "Home", icon: "home", href: "/" },
  { id: "log", label: "Log", icon: "reorder", href: "/log" },
  { id: "scan", label: "Scan", icon: "qr_code_scanner", href: "/scan" },
  { id: "weight", label: "Weight", icon: "monitor_weight", href: "/weight" },
  { id: "tdee", label: "Settings", icon: "analytics", href: "/settings" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export default function AppShell({
  activeTab,
  children,
}: {
  activeTab: TabId;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      <header className="fixed top-0 z-50 mx-auto flex h-16 w-full max-w-app items-center justify-between border-b-2 border-outline-variant bg-surface px-4 lg:hidden">
        <div className="truncate font-headline text-lg font-extrabold uppercase tracking-widest text-primary">
          RetroFit 8-Bit
        </div>
        <div className="flex items-center gap-4">
          <button
            className="text-on-surface-variant transition-transform active:scale-95"
            onClick={() => router.push("/settings")}
            aria-label="Settings"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              settings
            </span>
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r-2 border-outline-variant bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b-2 border-outline-variant px-4">
          <button className="truncate text-left font-headline text-base font-extrabold uppercase tracking-widest text-primary" onClick={() => router.push("/")}>
            RetroFit 8-Bit
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-3 border-2 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                  active
                    ? "border-primary bg-surface-container-high text-primary"
                    : "border-transparent text-on-surface-variant hover:border-outline-variant hover:bg-surface-container hover:text-on-surface"
                }`}
                onClick={() => tab.href && router.push(tab.href)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="material-symbols-outlined text-lg"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {tab.icon}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="relative z-10 w-full flex-1 lg:pl-64">
        <div className="mx-auto flex w-full max-w-app flex-col gap-6 px-4 pb-24 pt-20 lg:max-w-[1020px] lg:gap-8 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </div>
      </main>

      <nav className="fixed bottom-0 left-1/2 z-50 flex h-20 w-full max-w-app -translate-x-1/2 items-center justify-around border-t-2 border-outline-variant bg-surface-container-lowest/70 px-2 pb-2 backdrop-blur-md lg:hidden">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              className={`flex w-16 flex-col items-center justify-center transition-all active:translate-y-0.5 ${
                active ? "text-primary" : "text-on-surface-variant opacity-70 hover:opacity-100"
              }`}
              onClick={() => tab.href && router.push(tab.href)}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
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