"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { listMeals, listWeightLogs, type Meal, type WeightLog } from "@/db/db";
import { todayStr } from "@/lib/date";
import { useElementSize } from "@/lib/use-element-size";

type Profile = {
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  goal: "cut" | "maintain" | "bulk";
};

const MEAL_ICONS: Record<Meal["meal_type"], string> = {
  breakfast: "free_breakfast",
  lunch: "lunch_dining",
  dinner: "dinner_dining",
  snack: "cake",
};

const MACRO_COLORS: Record<string, string> = {
  P: "#c5020b",
  C: "#f1c100",
  F: "#2ae500",
};

export default function HomeDashboard({ profile }: { profile: Profile }) {
  const router = useRouter();
  const today = todayStr();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const { ref: chartBoxRef, size } = useElementSize<HTMLDivElement>();

  useEffect(() => {
    (async () => {
      setMeals(await listMeals(today));
      setWeights(await listWeightLogs(7));
    })();
  }, [today]);

  const totals = useMemo(
    () =>
      meals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein_g,
          carbs: acc.carbs + m.carbs_g,
          fat: acc.fat + m.fat_g,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [meals]
  );

  const macros = [
    { label: "P", value: totals.protein, target: profile.protein_target_g, color: MACRO_COLORS.P },
    { label: "C", value: totals.carbs, target: profile.carbs_target_g, color: MACRO_COLORS.C },
    { label: "F", value: totals.fat, target: profile.fat_target_g, color: MACRO_COLORS.F },
  ];

  const weightChart = useMemo(() => {
    if (!size || weights.length < 2) return null;
    const cw = size.w - 20; // chart area: container minus p-2 + border-2
    const ch = size.h - 20;
    const kgs = weights.map((e) => e.weight_kg);
    const min = Math.min(...kgs);
    const max = Math.max(...kgs);
    const pad = Math.max(1, (max - min) * 0.15);
    const lo = min - pad;
    const hi = max + pad;
    const points = weights
      .map((e, i) => {
        const x = (i / (weights.length - 1)) * cw;
        const y = ch * (0.9 - ((e.weight_kg - lo) / (hi - lo)) * 0.8);
        return `${x},${y}`;
      })
      .join(" ");
    const delta = weights[weights.length - 1].weight_kg - weights[0].weight_kg;
    return { points, delta, cw, ch };
  }, [weights, size]);

  const recent = meals;
  const groupedByMeal = useMemo(() => {
    const order: Meal["meal_type"][] = ["breakfast", "lunch", "dinner", "snack"];
    return order
      .map((type) => ({
        type,
        entries: meals.filter((m) => m.meal_type === type),
      }))
      .filter((g) => g.entries.length > 0);
  }, [meals]);

return (
    <AppShell activeTab="home">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
            <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
              Daily Overview
            </h1>
          </div>
          <span className="hidden font-mono text-xs font-semibold uppercase tracking-wider text-on-surface-variant lg:inline">
            {new Date(today + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="snes-window flex flex-col gap-4 p-3 lg:order-2">
            <div className="flex items-end justify-between">
              <span className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
                Energy
              </span>
              <span className="font-mono text-xl font-bold text-primary">
                {totals.calories.toLocaleString()} / {profile.daily_calorie_target.toLocaleString()} kcal
              </span>
            </div>
            <div className="relative h-6 w-full overflow-hidden border-2 border-outline-variant bg-surface p-[2px]">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-container transition-all"
                style={{ width: `${Math.min(100, (totals.calories / profile.daily_calorie_target) * 100)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1">
              {macros.map((m) => (
                <div key={m.label} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] font-semibold uppercase" style={{ color: m.color }}>
                    {m.label}: {m.value}g / {m.target}g
                  </span>
                  <div className="h-3 w-full border-2 border-outline-variant bg-surface p-[1px]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${Math.min(100, (m.value / m.target) * 100)}%`, backgroundColor: m.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="grid grid-cols-2 gap-4 lg:order-1">
            <button className="pixel-btn w-full p-3" onClick={() => router.push("/log")}>
              <span className="material-symbols-outlined text-base">add</span>
              <span>Log Manually</span>
            </button>
            <button
              className="pixel-btn w-full border-b-[#775e00] border-l-[#ffe08b] border-r-[#775e00] border-t-[#ffe08b] bg-tertiary-container p-3 text-on-tertiary-container"
              onClick={() => router.push("/scan")}
            >
              <span className="material-symbols-outlined text-base">camera_alt</span>
              <span>Scan Meal</span>
            </button>
          </section>
        </div>

        <section
          className="snes-window flex cursor-pointer flex-col gap-4 p-3"
          onClick={() => router.push("/weight")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push("/weight");
            }
          }}
        >
          <div className="flex items-center justify-between border-b-2 border-outline-variant pb-2">
            <h2 className="flex items-center gap-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
              <span className="material-symbols-outlined text-xl">monitoring</span>
              <span>Weight Trend</span>
            </h2>
            <span className="font-mono text-sm font-bold text-primary">
              {weightChart ? `${weightChart.delta > 0 ? "+" : ""}${weightChart.delta.toFixed(1)} kg` : "-- kg"}
            </span>
          </div>
          <div ref={chartBoxRef} className="relative flex h-32 w-full items-end overflow-hidden border-2 border-outline-variant bg-surface-container-low p-2">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-surface-variant) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-variant) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
            {weightChart ? (
              <svg
                className="relative z-10 h-full w-full"
                viewBox={`0 0 ${weightChart.cw} ${weightChart.ch}`}
                preserveAspectRatio="none"
              >
                <polyline
                  fill="none"
                  points={weightChart.points}
                  stroke="var(--color-tertiary-container)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={Math.round(weightChart.ch * 0.03)}
                />
                <circle
                  cx={weightChart.cw}
                  cy={Number(weightChart.points.split(" ").at(-1)?.split(",")[1])}
                  r={Math.round(weightChart.ch * 0.04)}
                  fill="var(--color-tertiary-container)"
                />
              </svg>
            ) : (
              <div className="w-full py-6 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                Log a couple of weights to chart.
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="ml-1 font-mono text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Recent Logs
        </h2>
        <div className="hidden border-2 border-outline-variant bg-surface-container px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant lg:grid lg:grid-cols-[72px_1fr_80px_80px_80px_90px] lg:items-center lg:gap-2">
          <span>Meal</span>
          <span>Item</span>
          <span className="text-right">P (g)</span>
          <span className="text-right">C (g)</span>
          <span className="text-right">F (g)</span>
          <span className="text-right">Kcal</span>
        </div>
        {groupedByMeal.map((g) =>
          g.entries.map((e) => (
            <div
              key={e.client_id}
              className="snes-window flex cursor-pointer items-center gap-3 p-3 lg:grid lg:grid-cols-[72px_1fr_80px_80px_80px_80px] lg:items-center lg:gap-2"
              onClick={() => router.push("/log")}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  router.push("/log");
                }
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-outline-variant bg-surface-bright">
                <span className="material-symbols-outlined text-primary">
                  {MEAL_ICONS[g.type]}
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-headline text-sm font-bold uppercase text-on-surface">
                  {g.type}
                </span>
                <span className="truncate font-mono text-[10px] text-on-surface-variant">{e.name}</span>
              </div>
              <span className="hidden text-right font-mono text-xs text-error lg:inline">{e.protein_g}g</span>
              <span className="hidden text-right font-mono text-xs text-tertiary lg:inline">{e.carbs_g}g</span>
              <span className="hidden text-right font-mono text-xs text-on-surface-variant lg:inline">{e.fat_g}g</span>
              <span className="ml-auto font-mono text-sm font-bold text-primary lg:ml-0 lg:text-right">
                {e.calories}
              </span>
            </div>
          ))
        )
        }
        {groupedByMeal.length === 0 && (
          <div className="snes-window p-3 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
            Nothing logged today yet.
          </div>
        )}
      </section>
    </AppShell>
  );
}
