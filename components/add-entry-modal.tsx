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
  const [amount, setAmountSel] = useState("100");
  const [gPerServing, setGPerServingSel] = useState(100);
  const [per100, setPer100] = useState<Per100>({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const [ingredients, setIngredients] = useState<Meal["ingredients"]>([]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setCalories(String(editing.calories));
      setProteinG(String(editing.protein_g));
      setCarbsG(String(editing.carbs_g));
      setFatG(String(editing.fat_g));
      setUnitSel("g");
      setAmountSel("100");
      setGPerServingSel(100);
      setIngredients(editing.ingredients ? JSON.parse(JSON.stringify(editing.ingredients)) : []);
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
      setAmountSel("100");
      setGPerServingSel(100);
      setIngredients([]);
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

  function recalculateFromIngredients(ings: NonNullable<Meal["ingredients"]>) {
    if (ings.length === 0) return;
    const totals = ings.reduce(
      (acc, i) => ({
        calories: acc.calories + (Number(i.calories) || 0),
        protein_g: acc.protein_g + (Number(i.protein_g) || 0),
        carbs_g: acc.carbs_g + (Number(i.carbs_g) || 0),
        fat_g: acc.fat_g + (Number(i.fat_g) || 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    setCalories(String(totals.calories));
    setProteinG(String(totals.protein_g));
    setCarbsG(String(totals.carbs_g));
    setFatG(String(totals.fat_g));
    setPer100(
      fromDisplayed(
        { calories: totals.calories, proteinG: totals.protein_g, carbsG: totals.carbs_g, fatG: totals.fat_g },
        unit,
        Number(amount) || 0,
        gPerServing
      )
    );
  }

  function handleDeleteIngredient(index: number) {
    const next = (ingredients ?? []).filter((_, i) => i !== index);
    setIngredients(next);
    recalculateFromIngredients(next);
  }

  function handleUpdateIngredient(index: number, patch: Partial<NonNullable<Meal["ingredients"]>[number]>) {
    const next = (ingredients ?? []).map((ing, i) => (i === index ? { ...ing, ...patch } : ing));
    setIngredients(next);
    recalculateFromIngredients(next);
  }

  function handleAddIngredient() {
    const next = [
      ...(ingredients ?? []),
      { name: `Ingredient ${(ingredients?.length ?? 0) + 1}`, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    ];
    setIngredients(next);
  }

  function onMacro(key: "proteinG" | "carbsG" | "fatG", value: string) {
    if (key === "proteinG") setProteinG(value);
    if (key === "carbsG") setCarbsG(value);
    if (key === "fatG") setFatG(value);
    const p = key === "proteinG" ? Number(value) || 0 : Number(proteinG) || 0;
    const c = key === "carbsG" ? Number(value) || 0 : Number(carbsG) || 0;
    const f = key === "fatG" ? Number(value) || 0 : Number(fatG) || 0;
    const cal = p + c + f > 0 ? caloriesFromMacros(p, c, f) : Number(calories) || 0;
    if (p + c + f > 0) setCalories(String(cal));
    setPer100(fromDisplayed({ calories: cal, proteinG: p, carbsG: c, fatG: f }, unit, Number(amount) || 0, gPerServing));
  }

  function onCalories(value: string) {
    setCalories(value);
    setPer100(
      fromDisplayed(
        { calories: Number(value) || 0, proteinG: Number(proteinG) || 0, carbsG: Number(carbsG) || 0, fatG: Number(fatG) || 0 },
        unit,
        Number(amount) || 0,
        gPerServing
      )
    );
  }

  function onAmount(value: string) {
    if (value === "-") return;
    setAmountSel(value);
    const n = Number(value) || 0;
    const d = toDisplayed(per100, unit, n, gPerServing);
    setCalories(String(d.calories));
    setProteinG(String(d.proteinG));
    setCarbsG(String(d.carbsG));
    setFatG(String(d.fatG));
  }

  function onUnit(u: Unit) {
    if (u === unit) return;
    const next = String(convertAmount(Number(amount) || 0, unit, u, gPerServing));
    setUnitSel(u);
    setAmountSel(next);
    const d = toDisplayed(per100, u, Number(next), gPerServing);
    setCalories(String(d.calories));
    setProteinG(String(d.proteinG));
    setCarbsG(String(d.carbsG));
    setFatG(String(d.fatG));
  }

  function onGPerServing(value: string) {
    if (value === "-") return;
    const n = Number(value);
    setGPerServingSel(n);
    if (unit !== "serving") return;
    const d = toDisplayed(per100, unit, Number(amount) || 0, n);
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
      ingredients: ingredients && ingredients.length > 0 ? ingredients : undefined,
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
      <div className="snes-window flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto p-6">
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

        {/* Ingredients section */}
        <div className="flex flex-col gap-2 border-2 border-outline-variant bg-surface-container-low p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-tertiary">
              Ingredients / Breakdown
            </span>
            <button
              type="button"
              onClick={handleAddIngredient}
              className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Ingredient
            </button>
          </div>

          {ingredients && ingredients.length > 0 ? (
            <div className="flex flex-col gap-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex flex-col gap-1.5 border border-outline-variant bg-surface p-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      aria-label={`Ingredient ${i + 1} name`}
                      value={ing.name}
                      onChange={(e) => handleUpdateIngredient(i, { name: e.target.value })}
                      placeholder="Ingredient name (e.g. Veges)"
                      className="w-full border border-outline-variant bg-surface-container p-1 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
                    />
                    <button
                      type="button"
                      aria-label={`Delete ingredient ${ing.name}`}
                      title="Delete ingredient"
                      onClick={() => handleDeleteIngredient(i)}
                      className="flex items-center gap-1 border border-error/50 bg-error/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-error transition-colors hover:bg-error hover:text-on-error"
                    >
                      <span className="material-symbols-outlined text-xs">delete</span>
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase text-on-surface-variant">
                      Kcal
                      <input
                        type="number"
                        min={0}
                        value={ing.calories}
                        onChange={(e) => handleUpdateIngredient(i, { calories: Number(e.target.value) || 0 })}
                        className="border border-outline-variant bg-surface-container p-1 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase text-on-surface-variant">
                      P (g)
                      <input
                        type="number"
                        min={0}
                        value={ing.protein_g}
                        onChange={(e) => handleUpdateIngredient(i, { protein_g: Number(e.target.value) || 0 })}
                        className="border border-outline-variant bg-surface-container p-1 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase text-on-surface-variant">
                      C (g)
                      <input
                        type="number"
                        min={0}
                        value={ing.carbs_g}
                        onChange={(e) => handleUpdateIngredient(i, { carbs_g: Number(e.target.value) || 0 })}
                        className="border border-outline-variant bg-surface-container p-1 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase text-on-surface-variant">
                      F (g)
                      <input
                        type="number"
                        min={0}
                        value={ing.fat_g}
                        onChange={(e) => handleUpdateIngredient(i, { fat_g: Number(e.target.value) || 0 })}
                        className="border border-outline-variant bg-surface-container p-1 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-on-surface-variant">
              No ingredients listed. Delete or add ingredients here to adjust meal totals automatically.
            </p>
          )}
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
          Macros adjust automatically when you change the serving size or edit ingredients
        </div>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Total Calories
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
