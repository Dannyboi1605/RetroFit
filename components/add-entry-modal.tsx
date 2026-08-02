"use client";

import { useEffect, useState } from "react";
import { addMeal, updateMeal, type Meal } from "@/db/db";

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
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");

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
  }, [editing, open]);

  if (!open) return null;

  async function handleSave() {
    if (!name || !calories) return;
    const input = {
      name,
      calories: Number(calories),
      protein_g: Number(proteinG) || 0,
      carbs_g: Number(carbsG) || 0,
      fat_g: Number(fatG) || 0,
    };
    if (editing) {
      await updateMeal(editing.client_id, input);
    } else {
      await addMeal({
        logged_date: date,
        meal_type: mealType,
        ...input,
      });
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="snes-window flex w-full max-w-sm flex-col gap-4 p-6">
        <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          {editing ? "Edit Entry" : "Add Entry"} — {mealType}
        </h2>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
          />
        </label>
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
        <div className="flex gap-2">
          <button className="pixel-btn w-full" onClick={onClose}>
            Cancel
          </button>
          <button className="pixel-btn w-full" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
