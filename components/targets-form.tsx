"use client";

import { useState, useActionState } from "react";
import { updateTargets } from "@/app/settings/actions";
import SaveToast from "@/components/save-toast";

type Profile = {
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  goal: string;
};

export default function TargetsForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(updateTargets, {});
  const [flash, setFlash] = useState<string | null>(null);

  if (state.success && flash !== "saved") setFlash("saved");

  return (
    <>
      <form action={formAction} className="snes-window flex flex-col gap-4 p-4">
        <h2 className="flex items-center gap-2 border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
          <span className="material-symbols-outlined text-xl">track_changes</span>
          Daily Targets
        </h2>
        <p className="font-mono text-[11px] leading-relaxed text-on-surface-variant">
          Calories are always derived from macros (P×4 + C×4 + F×9). Goal: {profile.goal}.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Protein (g)", name: "proteinG", value: profile.protein_target_g, color: "text-error" },
            { label: "Carbs (g)", name: "carbsG", value: profile.carbs_target_g, color: "text-tertiary" },
            { label: "Fat (g)", name: "fatG", value: profile.fat_target_g, color: "text-on-surface" },
          ].map((f) => (
            <label
              key={f.name}
              className={`flex flex-col gap-1 font-mono text-[10px] uppercase ${f.color}`}
            >
              {f.label}
              <input
                type="number"
                min={0}
                name={f.name}
                defaultValue={f.value}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Resulting daily calories
          <div className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm font-bold text-primary">
            {profile.daily_calorie_target.toLocaleString()} kcal
          </div>
        </div>
        <button className="pixel-btn w-full" type="submit" disabled={pending}>
          <span className="material-symbols-outlined text-base">save</span>
          {pending ? "Saving..." : "Save Targets"}
        </button>
      </form>
      {state.error && (
        <p className="font-mono text-xs text-error" role="alert">
          {state.error}
        </p>
      )}
      {flash && (
        <SaveToast key={flash} message="Targets saved!" onDone={() => setFlash(null)} />
      )}
    </>
  );
}
