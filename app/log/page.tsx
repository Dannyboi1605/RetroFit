"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import AddEntryModal from "@/components/add-entry-modal";
import SaveToast from "@/components/save-toast";
import {
  addMeal,
  copyMeals,
  deleteMeal,
  listFavorites,
  listMeals,
  listRecentFoods,
  normalizeFoodName,
  previousLoggedDate,
  toggleFavorite,
  type Favorite,
  type Meal,
  type RecentFood,
} from "@/db/db";
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

type MealType = (typeof MEAL_TYPES)[number];

type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type Flash = { message: string; undoId?: string };

export default function LogPage() {
  const router = useRouter();
  const [today] = useState(todayStr());
  const [selectedDate, setSelectedDate] = useState(today);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [online, setOnline] = useState(true);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mealType: MealType; editing?: Meal; preset?: RecentFood } | null>(null);
  const [chooser, setChooser] = useState<MealType | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [quickTab, setQuickTab] = useState<"recent" | "favorites">("recent");
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [confirmCopy, setConfirmCopy] = useState<{ scope: "day" | MealType; sourceDate: string; count: number } | null>(null);

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

  async function refreshAll() {
    const [dayMeals, r, f] = await Promise.all([
      listMeals(selectedDate),
      listRecentFoods(8),
      listFavorites(),
    ]);
    setMeals(dayMeals);
    setRecents(r);
    setFavorites(f);
  }

  useEffect(() => {
    refreshAll();
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

  const remaining = targets ? targets.calories - totals.calories : null;

  const favKeys = useMemo(() => new Set(favorites.map((f) => f.name_key)), [favorites]);

  async function quickLog(food: RecentFood | Favorite, fromFavorite: boolean, type: MealType) {
    const clientId = await addMeal({
      logged_date: selectedDate,
      meal_type: type,
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      source: fromFavorite ? "custom_favorite" : "manual",
      ingredients: food.ingredients ? JSON.parse(JSON.stringify(food.ingredients)) : undefined,
    });
    setChooser(null);
    refreshAll();
    setFlash({ message: `${food.name} logged!`, undoId: clientId });
  }

  async function undoLog(clientId: string) {
    await deleteMeal(clientId);
    refreshAll();
  }

  function editFromFood(food: RecentFood | Favorite, type: MealType) {
    setModal({ mealType: type, preset: food });
    setChooser(null);
  }

  async function handleToggleFavorite(meal: Meal) {
    const nowFav = await toggleFavorite({
      name: meal.name,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      ingredients: meal.ingredients,
    });
    await refreshAll();
    setFlash({ message: nowFav ? `${meal.name} saved to loadout` : `${meal.name} removed from loadout` });
  }

  async function prepareCopy(scope: "day" | MealType) {
    const sourceDate = await previousLoggedDate(selectedDate);
    if (!sourceDate) {
      setFlash({ message: "No previous day to replay" });
      return;
    }
    const sourceMeals = await listMeals(sourceDate);
    const count =
      scope === "day" ? sourceMeals.length : sourceMeals.filter((m) => m.meal_type === scope).length;
    if (count === 0) {
      setFlash({ message: "Nothing to copy from the previous day" });
      return;
    }
    setConfirmCopy({ scope, sourceDate, count });
  }

  async function doCopy() {
    if (!confirmCopy) return;
    const { scope, sourceDate } = confirmCopy;
    const n = await copyMeals(sourceDate, selectedDate, scope === "day" ? undefined : scope);
    setConfirmCopy(null);
    refreshAll();
    setFlash({ message: `${n} ${n === 1 ? "entry" : "entries"} copied` });
  }

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

      <button
        className="pixel-btn-secondary w-full py-2 font-mono text-[10px] font-bold uppercase tracking-wider"
        onClick={() => prepareCopy("day")}
      >
        <span className="material-symbols-outlined text-base">content_copy</span>
        Replay Previous Day
      </button>

      <div className="flex flex-col gap-4 border-2 border-outline-variant bg-surface-container-high p-4 shadow-[0_4px_0_0_rgba(12,22,9,1)]">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              HP Remaining
            </div>
            {targets && remaining !== null ? (
              <>
                <div
                  className={`font-headline text-2xl font-extrabold ${
                    remaining < 0 ? "text-secondary" : "text-primary"
                  }`}
                >
                  {Math.abs(remaining).toLocaleString()}
                  <span className="font-sans text-sm text-on-surface-variant">
                    {" "}
                    kcal {remaining < 0 ? "over" : "left"}
                  </span>
                </div>
                {remaining < 0 && (
                  <div className="font-mono text-[10px] font-bold uppercase text-secondary">
                    Over capacity
                  </div>
                )}
              </>
            ) : (
              <div className="font-mono text-xs font-bold text-secondary">
                OFFLINE — target unavailable
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
              Offline-first
            </div>
            <div className="font-mono text-xl font-bold text-tertiary-container">
              {online ? "SYNCED" : "OFFLINE"}
            </div>
          </div>
        </div>
        <div className="font-mono text-[11px] text-on-surface-variant">
          {totals.calories.toLocaleString()}
          {targets ? ` / ${targets.calories.toLocaleString()}` : ""} kcal consumed
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

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
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
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base text-on-surface-variant">{total} KCAL</span>
                  <button
                    className="text-on-surface-variant transition-colors hover:text-tertiary-container"
                    aria-label={`Replay ${type} from previous day`}
                    title="Replay from previous day"
                    onClick={() => prepareCopy(type)}
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {entries.map((e) => {
                  const isFav = favKeys.has(normalizeFoodName(e.name));
                  return (
                    <div
                      key={e.client_id}
                      className="flex items-center justify-between border border-surface-variant bg-surface-container-low p-2"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-sans text-sm font-bold text-on-surface">{e.name}</span>
                        {e.ingredients && e.ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {e.ingredients.map((ing, idx) => (
                              <span
                                key={idx}
                                className="border border-outline-variant/60 bg-surface-container px-1.5 py-0.5 font-mono text-[9px] uppercase text-on-surface-variant"
                              >
                                {ing.name} ({ing.calories} kcal)
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 font-mono text-[10px]">
                          <span className="text-error">P: {e.protein_g}g</span>
                          <span className="text-tertiary">C: {e.carbs_g}g</span>
                          <span className="text-on-surface-variant">F: {e.fat_g}g</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-base text-on-surface">{e.calories}</span>
                        <button
                          className={`transition-colors hover:text-tertiary-container ${
                            isFav ? "text-tertiary-container" : "text-on-surface-variant"
                          }`}
                          aria-label={isFav ? "Remove from loadout" : "Save to loadout"}
                          aria-pressed={isFav}
                          onClick={() => handleToggleFavorite(e)}
                        >
                          <span
                            className="material-symbols-outlined text-lg"
                            style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            star
                          </span>
                        </button>
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
                              refreshAll();
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
                  );
                })}
                {entries.length === 0 && (
                  <div className="py-4 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                    No Entries Yet.
                  </div>
                )}
              </div>
              <button
                className="pixel-btn mt-2 w-full"
                onClick={() => setChooser(type)}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Entry
              </button>
            </section>
          );
        })}
      </div>

      {chooser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add entry"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setChooser(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setChooser(null);
          }}
        >
          <div className="snes-window flex max-h-[90vh] w-full max-w-sm flex-col gap-5 overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b-2 border-surface-variant pb-2">
              <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
                Add {chooser}
              </h2>
              <button
                className="text-on-surface-variant transition-colors hover:text-primary"
                aria-label="Close"
                onClick={() => setChooser(null)}
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 border-2 border-outline-variant bg-surface-container-low p-3">
              <div className="flex gap-2">
                {([
                  ["recent", "Recent Loot"],
                  ["favorites", "Loadout"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={quickTab === id}
                    onClick={() => setQuickTab(id)}
                    className={`flex-1 border-2 px-2 py-1.5 font-mono text-[10px] font-bold uppercase transition-colors ${
                      quickTab === id
                        ? "border-primary bg-surface-container-high text-primary"
                        : "border-outline-variant bg-surface text-on-surface-variant opacity-60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                {(quickTab === "recent" ? recents : favorites).map((food) => (
                  <div
                    key={food.name}
                    className="flex items-center justify-between gap-2 border border-outline-variant bg-surface p-2"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                      onClick={() => editFromFood(food, chooser)}
                    >
                      <span className="w-full truncate font-sans text-xs font-bold text-on-surface">
                        {food.name}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        {food.calories} kcal · P {food.protein_g} C {food.carbs_g} F {food.fat_g}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-tertiary-container transition-colors hover:text-primary"
                      aria-label={`Quick log ${food.name}`}
                      title="Log now"
                      onClick={() => quickLog(food, quickTab === "favorites", chooser)}
                    >
                      <span className="material-symbols-outlined text-lg">bolt</span>
                    </button>
                  </div>
                ))}
                {(quickTab === "recent" ? recents : favorites).length === 0 && (
                  <div className="py-3 text-center font-mono text-[11px] font-semibold uppercase text-on-surface-variant">
                    {quickTab === "recent" ? "No recent loot yet" : "Star meals to build your loadout"}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex flex-col items-center gap-2 border-2 border-outline-variant bg-surface p-4 font-mono text-xs font-bold uppercase transition-colors hover:border-primary hover:text-primary"
                onClick={() => router.push(`/scan?date=${selectedDate}`)}
              >
                <span className="material-symbols-outlined text-3xl text-primary">auto_awesome</span>
                Scan Meal
                <span className="text-[10px] font-semibold normal-case text-on-surface-variant">
                  AI photo estimate
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-2 border-2 border-outline-variant bg-surface-container p-4 font-mono text-xs font-bold uppercase transition-colors hover:border-primary hover:text-primary"
                onClick={() => {
                  setModal({ mealType: chooser });
                  setChooser(null);
                }}
              >
                <span className="material-symbols-outlined text-3xl text-tertiary">edit_note</span>
                Manual Entry
                <span className="text-[10px] font-normal normal-case text-on-surface-variant">
                  Type the details yourself
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCopy && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm copy"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmCopy(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmCopy(null);
          }}
        >
          <div className="snes-window flex w-full max-w-sm flex-col gap-4 p-6">
            <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
              Replay {confirmCopy.scope === "day" ? "Day" : confirmCopy.scope}
            </h2>
            <p className="font-mono text-xs text-on-surface-variant">
              Copy {confirmCopy.count} {confirmCopy.count === 1 ? "entry" : "entries"} from{" "}
              {new Date(confirmCopy.sourceDate + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}{" "}
              into this day?
            </p>
            <div className="flex gap-2">
              <button className="pixel-btn-secondary w-full" onClick={() => setConfirmCopy(null)}>
                Cancel
              </button>
              <button className="pixel-btn w-full" onClick={doCopy}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <AddEntryModal
          open
          date={selectedDate}
          mealType={modal.mealType}
          editing={modal.editing}
          preset={modal.preset}
          onClose={() => setModal(null)}
          onSaved={() => {
            refreshAll();
            setFlash({ message: modal.editing ? "Entry updated!" : "Meal logged!" });
          }}
        />
      )}

      {flash && (
        <SaveToast
          key={flash.message + (flash.undoId ?? "")}
          message={flash.message}
          durationMs={flash.undoId ? 5000 : 2500}
          actionLabel={flash.undoId ? "Undo" : undefined}
          onAction={flash.undoId ? () => undoLog(flash.undoId!) : undefined}
          onDone={() => setFlash(null)}
        />
      )}
    </AppShell>
  );
}
