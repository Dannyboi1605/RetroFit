"use client";

import { useState } from "react";
import { addMeal } from "@/db/db";

export default function AddEntryModal({
  open,
  onClose,
  mealType,
  onSaved,
}: {
  open: boolean;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");

  if (!open) return null;

  async function handleSave() {
    if (!name || !calories) return;
    await addMeal({
      logged_date: new Date().toISOString().slice(0, 10),
      meal_type: mealType,
      name,
      calories: Number(calories),
      protein_g: Number(proteinG) || 0,
      carbs_g: Number(carbsG) || 0,
      fat_g: Number(fatG) || 0,
    });
    setName("");
    setCalories("");
    setProteinG("");
    setCarbsG("");
    setFatG("");
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="snes-window flex w-full max-w-sm flex-col gap-4 p-6">
        <h2 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Add Entry — {mealType}
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
