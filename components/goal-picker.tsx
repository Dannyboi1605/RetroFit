"use client";

import { useState } from "react";
import { updateGoal } from "@/app/settings/actions";
import SaveToast from "@/components/save-toast";
import type { Goal } from "@/lib/tdee";

const GOALS: { id: Goal; label: string; desc: string }[] = [
  { id: "cut", label: "Cut", desc: "Lose weight" },
  { id: "maintain", label: "Maintain", desc: "Stay the same" },
  { id: "bulk", label: "Bulk", desc: "Gain weight" },
];

export default function GoalPicker({ goal }: { goal: Goal }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function pickGoal(id: Goal) {
    if (id === goal || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await updateGoal(id);
      if (res.error) setError(res.error);
      else setFlash("saved");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {GOALS.map((g) => (
          <button
            type="button"
            key={g.id}
            aria-pressed={goal === g.id}
            disabled={pending}
            aria-disabled={pending}
            onClick={() => pickGoal(g.id)}
            style={goal === g.id ? { borderColor: "var(--color-primary)" } : undefined}
            className={`snes-window flex items-center justify-between p-3 text-left ${
              goal === g.id ? "" : "opacity-60"
            }`}
          >
            <span
              className={`font-mono text-sm font-bold uppercase ${goal === g.id ? "text-primary" : "text-on-surface"}`}
            >
              {g.label}
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">{g.desc}</span>
          </button>
        ))}
        <p className="mt-2 text-center font-mono text-[10px] text-on-surface-variant">
          FOR WEIGHT-TREND GUIDANCE — RECALCULATES YOUR DAILY MACROS
        </p>
      </div>
      {error && (
        <p role="alert" className="font-mono text-xs text-error">
          {error}
        </p>
      )}
      {flash && (
        <SaveToast key={flash} message="Goal updated!" onDone={() => setFlash(null)} />
      )}
    </>
  );
}
