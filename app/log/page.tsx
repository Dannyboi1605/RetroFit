"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import AddEntryModal from "@/components/add-entry-modal";
import SaveToast from "@/components/save-toast";
import { deleteMeal, listMeals, type Meal } from "@/db/db";
import { shiftDate, todayStr } from "@/lib/date";
import { supabase } from "@/lib/supabase/client";
import { initSync } from "@/lib/sync";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_ICONS: Record<(typeof MEAL_TYPES)[number], string> = {
  breakfast: "free_breakfast",
  lunch: "lunch_dining",
  dinner: "dinner_dining",
  snack: "cake",
};

type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export default function LogPage() {
  const [today] = useState(todayStr());
  const [selectedDate, setSelectedDate] = useState(today);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [online, setOnline] = useState(true);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mealType: (typeof MEAL_TYPES)[number]; editing?: Meal } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    initSync();
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g")
        .eq("id", user.id)
        .single();
      if (data) {
        setTargets({
          calories: data.daily_calorie_target,
          protein: data.protein_target_g,
          carbs: data.carbs_target_g,
          fat: data.fat_target_g,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 3000);
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-confirm-delete]")) setConfirmDelete(null);
    };
    document.addEventListener("click", onClick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [confirmDelete]);

  function shiftDay(days: number) {
    setSelectedDate(shiftDate(selectedDate, days));
  }

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function refresh() {
    setMeals(await listMeals(selectedDate));
  }

  useEffect(() => {
    refresh();
  }, [selectedDate]);

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
        <button
          className="pixel-btn-secondary flex h-11 w-11 items-center justify-center p-1"
          aria-label="Previous day"
          onClick={() => shiftDay(-1)}
        >
          <span className="material-symbols-outlined text-xl">chevron_left</span>
        </button>
        <button className="flex flex-col items-center" onClick={() => setSelectedDate(today)}>
          <span className="font-mono text-xs font-semibold text-on-surface-variant">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="flex items-center gap-2 font-mono text-xl font-bold text-primary">
            <span className="material-symbols-outlined text-xl">calendar_month</span>
            {selectedDate === today ? "TODAY" : "DAY"}
          </span>
        </button>
        <button
          className="pixel-btn-secondary flex h-11 w-11 items-center justify-center p-1"
          aria-label="Next day"
          onClick={() => shiftDay(1)}
        >
          <span className="material-symbols-outlined text-xl">chevron_right</span>
        </button>
      </div>

      <div className="flex flex-col gap-4 border-2 border-outline-variant bg-surface-container-high p-4 shadow-[0_4px_0_0_rgba(12,22,9,1)]">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              HP (Calories)
            </div>
            <div className="font-headline text-2xl font-extrabold text-primary">
              {totals.calories.toLocaleString()}{" "}
              {targets ? (
                <span className="font-sans text-sm text-on-surface-variant">
                  / {targets.calories.toLocaleString()}
                </span>
              ) : (
                <span className="font-mono text-xs font-bold text-error">
                  OFFLINE — target unavailable
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              Offline-first
            </div>
            <div className="font-mono text-xl font-bold text-tertiary">
              {online ? "SYNCED" : "OFFLINE"}
            </div>
          </div>
        </div>
        <div className="macro-bar-bg h-4">
          <div
            className="macro-bar-fill"
            style={{
              width: `${targets ? Math.min(100, (totals.calories / targets.calories) * 100) : 0}%`,
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "PRO (P)", value: totals.protein, target: targets?.protein, mod: "protein" },
            { label: "CARB (C)", value: totals.carbs, target: targets?.carbs, mod: "carbs" },
            { label: "FAT (F)", value: totals.fat, target: targets?.fat, mod: "fat" },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center border-2 border-surface-variant bg-surface p-2">
              <span className="font-mono text-[10px] font-semibold uppercase text-error">{m.label}</span>
              <span className="font-mono text-base font-bold text-primary">{m.value}g</span>
              <div className="macro-bar-bg mt-1 h-2 w-full">
                <div
                  className={`macro-bar-fill ${m.mod}`}
                  style={{ width: `${m.target ? Math.min(100, (m.value / m.target) * 100) : 0}%` }}
                />
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
                        className="text-on-surface-variant transition-colors hover:text-primary"
                        aria-label="Edit"
                        onClick={() => setModal({ mealType: e.meal_type, editing: e })}
                      >
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      {confirmDelete === e.client_id ? (
                        <button
                          data-confirm-delete
                          className="pixel-btn-danger flex items-center gap-1 px-2 py-1 font-mono text-[10px] font-bold uppercase"
                          onClick={async () => {
                            await deleteMeal(e.client_id);
                            setConfirmDelete(null);
                            refresh();
                          }}
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                          Sure?
                        </button>
                      ) : (
                        <button
                          className="text-on-error transition-colors hover:text-error"
                          aria-label="Delete entry"
                          onClick={() => setConfirmDelete(e.client_id)}
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
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
                onClick={() => setModal({ mealType: type })}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Entry
              </button>
            </section>
          );
        })}
      </div>

      {modal && (
        <AddEntryModal
          open
          date={selectedDate}
          mealType={modal.mealType}
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSaved={() => {
            refresh();
            setFlash(modal.editing ? "Entry updated!" : "Meal logged!");
          }}
        />
      )}

      {flash && (
        <SaveToast key={flash} message={flash} onDone={() => setFlash(null)} />
      )}
    </AppShell>
  );
}
