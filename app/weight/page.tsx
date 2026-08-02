"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import { addWeight, listWeightLogs, type WeightLog } from "@/db/db";
import { initSync } from "@/lib/sync";
import { dateStr, todayStr } from "@/lib/date";

const RANGES = [
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "1Y", days: 365 },
] as const;

export default function WeightPage() {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1M");
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kg = Number(weight);
  const weightInvalid = !kg || kg < 30 || kg > 300;

  useEffect(() => {
    initSync();
  }, []);

  async function refresh() {
    setLogs(await listWeightLogs());
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    return logs.filter((w) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return w.logged_date >= dateStr(cutoff);
    });
  }, [logs, range]);

  const chart = useMemo(() => {
    if (filtered.length < 2) return null;
    const weights = filtered.map((w) => w.weight_kg);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const pad = Math.max(1, (max - min) * 0.15);
    const lo = min - pad;
    const hi = max + pad;
    const points = filtered
      .map((w, i) => {
        const x = (i / (filtered.length - 1)) * 100;
        const y = 90 - ((w.weight_kg - lo) / (hi - lo)) * 80;
        return `${x},${y}`;
      })
      .join(" ");
    return { points, lo, hi, last: filtered[filtered.length - 1], delta: filtered[filtered.length - 1].weight_kg - filtered[0].weight_kg };
  }, [filtered]);

  async function handleSave() {
    if (weightInvalid) return;
    await addWeight({ logged_date: date, weight_kg: kg, note: note || undefined });
    setWeight("");
    setNote("");
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
    refresh();
  }

  return (
    <AppShell activeTab="weight">
      <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Weight Tracker
        </h1>
      </div>

      <div className="snes-window flex flex-col gap-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              Current
            </div>
            <div className="font-headline text-2xl font-extrabold text-tertiary">
              {filtered.length > 0 ? `${filtered[filtered.length - 1].weight_kg} kg` : "-- kg"}
            </div>
          </div>
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                aria-pressed={range === r.id}
                className={`pixel-btn-secondary px-3 py-1 font-mono text-xs ${
                  range === r.id ? "border-primary text-primary" : "opacity-60"
                }`}
                onClick={() => setRange(r.id)}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex h-40 w-full items-end overflow-hidden border-2 border-outline-variant bg-surface-container-low p-2">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(var(--color-surface-variant) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-variant) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          {chart ? (
            <>
              <svg className="relative z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  points={chart.points}
                  stroke="var(--color-tertiary)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
                <circle
                  cx="100"
                  cy={Number(chart.points.split(" ").at(-1)?.split(",")[1])}
                  r="4"
                  fill="var(--color-tertiary)"
                />
              </svg>
              <div className="absolute left-2 top-1 font-mono text-[10px] text-on-surface-variant">
                {chart.hi.toFixed(1)} kg
              </div>
              <div className="absolute bottom-5 left-2 font-mono text-[10px] text-on-surface-variant">
                {chart.lo.toFixed(1)} kg
              </div>
              <div className="absolute bottom-1 left-2 font-mono text-[10px] text-on-surface-variant">
                {new Date(filtered[0].logged_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="absolute bottom-1 right-2 font-mono text-[10px] text-on-surface-variant">
                {new Date(filtered[filtered.length - 1].logged_date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
                )}
              </div>
              <div className="absolute right-2 top-1 font-mono text-xs font-bold text-primary">
                {chart.delta > 0 ? "+" : ""}
                {chart.delta.toFixed(1)} kg
              </div>
            </>
          ) : (
            <div className="w-full py-6 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
              {filtered.length === 1 ? "Add one more entry to chart." : "No entries yet."}
            </div>
          )}
        </div>
      </div>

      <div className="snes-window flex flex-col gap-4 p-4">
        <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
          Log Weight
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Weight (kg)
            <input
              type="number"
              min={30}
              max={300}
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
            />
          </label>
        </div>
        {weight !== "" && weightInvalid && (
          <div role="alert" className="font-mono text-xs font-semibold text-error">
            Weight must be between 30 and 300 kg.
          </div>
        )}
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
        <button className="pixel-btn w-full disabled:opacity-50" disabled={weightInvalid} onClick={handleSave}>
          <span className="material-symbols-outlined text-base">monitor_weight</span>
          Save Weight
        </button>
        {saved && (
          <div role="alert" className="font-mono text-xs font-semibold uppercase text-tertiary">
            Saved
          </div>
        )}
      </div>

      <div className="snes-window flex flex-col gap-3 p-4">
        <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-primary">
          History
        </h2>
        {[...filtered].reverse().map((w) => (
          <div
            key={w.client_id}
            className="flex items-center justify-between border border-surface-variant bg-surface-container-low p-2"
          >
            <div className="flex flex-col">
              <span className="font-mono text-xs text-on-surface-variant">
                {new Date(w.logged_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {w.note && <span className="font-sans text-xs text-on-surface">{w.note}</span>}
            </div>
            <span className="font-mono text-base font-bold text-tertiary">{w.weight_kg} kg</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-4 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
            No weight logged yet.
          </div>
        )}
      </div>
    </AppShell>
  );
}
