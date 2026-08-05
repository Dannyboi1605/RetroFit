"use client";

import { useEffect, useRef, useState } from "react";
import { addMeal, updateMeal, type Meal } from "@/db/db";
import { toDisplayed, fromDisplayed, convertAmount, type Unit, type Per100 } from "@/lib/serving";
import { caloriesFromMacros } from "@/lib/tdee";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_ICONS: Record<(typeof MEAL_TYPES)[number], string> = {
  breakfast: "free_breakfast",
  lunch: "lunch_dining",
  dinner: "dinner_dining",
  snack: "cake",
};

export default function AddEntryModal({
  open,
  date,
  mealType,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  date: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  editing?: Meal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [mealTypeSel, setMealTypeSel] = useState<(typeof MEAL_TYPES)[number]>(mealType);
  const [loggedDate, setLoggedDate] = useState(date);
  const [tried, setTried] = useState(false);
  const [unit, setUnitSel] = useState<Unit>("g");
  const [amount, setAmountSel] = useState(100);
  const [gPerServing, setGPerServingSel] = useState(100);
  const [per100, setPer100] = useState<Per100>({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

  useEffect(() => {
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
    setMealTypeSel(mealType);
    setLoggedDate(date);
    setTried(false);
  }, [editing, open, mealType, date]);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open) return null;

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

  function onAmount(value: string) {
    // empty input keeps the last valid amount — clearing must not nuke the macros
    if (value === "" || value === "-") return;
    const n = Number(value);
    setAmountSel(n);
    const d = toDisplayed(per100, unit, n, gPerServing);
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

  function onGPerServing(value: string) {
    if (value === "" || value === "-") return;
    const n = Number(value);
    setGPerServingSel(n);
    if (unit !== "serving") return;
    const d = toDisplayed(per100, unit, amount, n);
    setCalories(String(d.calories));
    setProteinG(String(d.proteinG));
    setCarbsG(String(d.carbsG));
    setFatG(String(d.fatG));
  }

  async function handleSave() {
    if (!name || !calories) {
      setTried(true);
      return;
    }
    const input = {
      name,
      calories: Number(calories),
      protein_g: Number(proteinG) || 0,
      carbs_g: Number(carbsG) || 0,
      fat_g: Number(fatG) || 0,
    };
    if (editing) {
      await updateMeal(editing.client_id, { ...input, meal_type: mealTypeSel });
    } else {
      await addMeal({
        logged_date: loggedDate,
        meal_type: mealTypeSel,
        ...input,
      });
    }
    onSaved();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit entry" : "Add entry"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="snes-window flex w-full max-w-sm flex-col gap-4 p-6">
        <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          {editing ? "Edit Entry" : "Add Entry"} — {mealTypeSel}
        </h2>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Name
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
        <div className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Meal type
          <div className="flex gap-2">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={mealTypeSel === t}
                onClick={() => setMealTypeSel(t)}
                className={`flex flex-1 flex-col items-center gap-0.5 border-2 p-2 font-mono text-[10px] font-bold uppercase transition-colors ${
                  mealTypeSel === t
                    ? "border-primary bg-surface-container-high text-primary"
                    : "border-outline-variant bg-surface text-on-surface-variant opacity-60"
                }`}
              >
                <span className="material-symbols-outlined text-lg">{MEAL_ICONS[t]}</span>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase text-on-surface-variant">Serving size</span>
            <div className="flex items-stretch gap-1">
              <input
                type="number"
                min={0}
                step="any"
                aria-label="Serving size"
                value={amount}
                onChange={(e) => onAmount(e.target.value)}
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
                    {u === "g" ? "grams" : "servings"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {unit === "serving" && (
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              <span>1 serving =</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={gPerServing}
                  onChange={(e) => onGPerServing(e.target.value)}
                  className="w-20 border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                />
                <span>g</span>
              </div>
            </label>
          )}
        </div>
        <div className="font-mono text-xs text-on-surface-variant">
          Macros adjust automatically when you change the serving size
        </div>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Calories
          <input
            type="number"
            min={0}
            value={calories}
            onChange={(e) => onCalories(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
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
        {!editing && (
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Date
            <input
              type="date"
              value={loggedDate}
              onChange={(e) => setLoggedDate(e.target.value)}
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container [color-scheme:dark]"
            />
          </label>
        )}
        <div className="flex flex-col gap-2">
          {tried && (
            <p className="font-mono text-xs font-semibold uppercase text-error">
              Name and calories required.
            </p>
          )}
          <div className="flex gap-2">
            <button className="pixel-btn w-full" onClick={onClose}>
              Cancel
            </button>
            <button
              className="pixel-btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!name || !calories}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
