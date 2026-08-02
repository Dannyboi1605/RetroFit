"use client";

import { useEffect, useRef, useState } from "react";
import { addMeal, updateMeal, type Meal } from "@/db/db";

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

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setCalories(String(editing.calories));
      setProteinG(String(editing.protein_g));
      setCarbsG(String(editing.carbs_g));
      setFatG(String(editing.fat_g));
    } else {
      setName("");
      setCalories("");
      setProteinG("");
      setCarbsG("");
      setFatG("");
    }
    setMealTypeSel(mealType);
    setLoggedDate(date);
    setTried(false);
  }, [editing, open, mealType, date]);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open) return null;

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
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Calories
          <input
            type="number"
            min={0}
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "P (g)", value: proteinG, set: setProteinG },
            { label: "C (g)", value: carbsG, set: setCarbsG },
            { label: "F (g)", value: fatG, set: setFatG },
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
                onChange={(e) => f.set(e.target.value)}
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
