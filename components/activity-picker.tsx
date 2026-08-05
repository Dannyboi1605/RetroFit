"use client";

import { useState } from "react";
import { updateActivityLevel } from "@/app/settings/actions";
import SaveToast from "@/components/save-toast";
import type { ActivityLevel } from "@/lib/tdee";

const ACTIVITIES: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: "sedentary", label: "Sedentary", desc: "Desk job, no exercise" },
  { id: "light", label: "Light", desc: "1-3 workouts / week" },
  { id: "moderate", label: "Moderate", desc: "3-5 workouts / week" },
  { id: "heavy", label: "Heavy", desc: "6-7 workouts / week" },
  { id: "athlete", label: "Athlete", desc: "2x daily training" },
];

export default function ActivityPicker({ activityLevel }: { activityLevel: ActivityLevel }) {
  const [current, setCurrent] = useState(activityLevel);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function pick(id: ActivityLevel) {
    if (id === current || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await updateActivityLevel(id);
      if (res.error) setError(res.error);
      else {
        setCurrent(id);
        setFlash("saved");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {ACTIVITIES.map((a) => (
          <button
            type="button"
            key={a.id}
            aria-pressed={current === a.id}
            disabled={pending}
            aria-disabled={pending}
            onClick={() => pick(a.id)}
            style={current === a.id ? { borderColor: "var(--color-primary)" } : undefined}
            className={`snes-window flex items-center justify-between p-3 text-left ${
              current === a.id ? "" : "opacity-60"
            }`}
          >
            <span
              className={`font-mono text-sm font-bold uppercase ${current === a.id ? "text-primary" : "text-on-surface"}`}
            >
              {a.label}
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">{a.desc}</span>
          </button>
        ))}
        <p className="mt-2 text-center font-mono text-[10px] text-on-surface-variant">
          CHANGES YOUR ACTIVITY LEVEL — RECALCULATES YOUR DAILY MACROS
        </p>
      </div>
      {error && (
        <p role="alert" className="font-mono text-xs text-error">
          {error}
        </p>
      )}
      {flash && (
        <SaveToast key={flash} message="Activity updated!" onDone={() => setFlash(null)} />
      )}
    </>
  );
}
