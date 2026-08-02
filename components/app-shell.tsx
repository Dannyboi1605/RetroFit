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
      <header className="fixed top-0 z-50 mx-auto flex h-16 w-full max-w-app items-center justify-between border-b-2 border-outline-variant bg-surface px-4">
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

      <main className="relative z-10 mx-auto flex w-full max-w-app flex-col gap-6 px-4 pb-24 pt-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-50 flex h-20 w-full max-w-app -translate-x-1/2 items-center justify-around border-t-2 border-outline-variant bg-surface-container-lowest/70 px-2 pb-2 backdrop-blur-md">
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
