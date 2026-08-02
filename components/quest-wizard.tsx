"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { saveQuest, type QuestState } from "@/app/quest/actions";
import {
  calculateTargets,
  caloriesFromMacros,
  type ActivityLevel,
} from "@/lib/tdee";

const STEPS = [
  { id: 1, label: "AGE & GENDER" },
  { id: 2, label: "HEIGHT & WEIGHT" },
  { id: 3, label: "ACTIVITY" },
  { id: 4, label: "MACROS" },
  { id: 5, label: "GOAL" },
];

const ACTIVITIES = [
  { id: "sedentary", label: "Sedentary", desc: "Desk job, no exercise" },
  { id: "light", label: "Light", desc: "1-3 workouts / week" },
  { id: "moderate", label: "Moderate", desc: "3-5 workouts / week" },
  { id: "heavy", label: "Heavy", desc: "6-7 workouts / week" },
  { id: "athlete", label: "Athlete", desc: "2x daily training" },
];

const GOALS = [
  { id: "cut", label: "Cut", desc: "Lose weight" },
  { id: "maintain", label: "Maintain", desc: "Stay the same" },
  { id: "bulk", label: "Bulk", desc: "Gain weight" },
];

const initialState: QuestState = {};

export default function QuestWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [goal, setGoal] = useState("");

  const [state, formAction, pending] = useActionState(saveQuest, initialState);

  const targets =
    age && gender && heightCm && weightKg && activityLevel
      ? calculateTargets({
          age: Number(age),
          gender: gender as "male" | "female",
          heightCm: Number(heightCm),
          weightKg: Number(weightKg),
          activityLevel: activityLevel as ActivityLevel,
          goal: "maintain",
        })
      : null;

  const totalCalories = caloriesFromMacros(
    Number(proteinG) || 0,
    Number(carbsG) || 0,
    Number(fatG) || 0
  );

  const canContinue =
    (step === 1 && age && gender) ||
    (step === 2 && heightCm && weightKg) ||
    (step === 3 && activityLevel) ||
    (step === 4 && proteinG && carbsG && fatG) ||
    (step === 5 && goal);

  function goNext() {
    if (step === 3 && targets) {
      setProteinG(String(targets.proteinG));
      setCarbsG(String(targets.carbsG));
      setFatG(String(targets.fatG));
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-on-surface-variant">
          {STEPS.map((s) => (
            <span key={s.id} className={s.id <= step ? "text-primary" : ""}>
              {s.id < step ? (
                <span className="material-symbols-outlined align-middle text-sm">check</span>
              ) : s.id === step ? (
                "▶ "
              ) : (
                ""
              )}
              {s.label}
            </span>
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase text-on-surface-variant">
          Step {step} of {STEPS.length}
        </p>
      </div>

      <form
        action={async (formData: FormData) => {
          formData.set("age", age);
          formData.set("gender", gender);
          formData.set("heightCm", heightCm);
          formData.set("weightKg", weightKg);
          formData.set("activityLevel", activityLevel);
          formData.set("proteinG", proteinG);
          formData.set("carbsG", carbsG);
          formData.set("fatG", fatG);
          formData.set("goal", goal);
          const res = (await formAction(formData)) as QuestState | undefined;
          if (!res?.error) router.replace("/");
        }}
        className="snes-window flex flex-col gap-4 p-6"
      >
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Age
              <input
                type="number"
                inputMode="numeric"
                min={13}
                max={100}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
            <div className="flex gap-4">
              {(["male", "female"] as const).map((g) => (
                <div key={g} className={`w-full ${gender === g ? "border-2 border-primary" : ""}`}>
                  <button
                    type="button"
                    aria-pressed={gender === g}
                    onClick={() => setGender(g)}
                    className={`pixel-btn w-full ${gender === g ? "" : "opacity-60"}`}
                  >
                    {g}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Height (cm)
              <input
                type="number"
                inputMode="decimal"
                min={100}
                max={250}
                required
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
            <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
              Weight (kg)
              <input
                type="number"
                inputMode="decimal"
                min={30}
                max={300}
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            {ACTIVITIES.map((a) => (
              <button
                type="button"
                key={a.id}
                aria-pressed={activityLevel === a.id}
                onClick={() => setActivityLevel(a.id)}
                style={activityLevel === a.id ? { borderColor: "var(--color-primary)" } : undefined}
                className={`snes-window flex items-center justify-between p-3 text-left ${activityLevel === a.id ? "" : "opacity-60"}`}
              >
                <span
                  className={`font-mono text-sm font-bold uppercase ${activityLevel === a.id ? "text-primary" : "text-on-surface"}`}
                >
                  {a.label}
                </span>
                <span className="font-mono text-[10px] text-on-surface-variant">{a.desc}</span>
              </button>
            ))}
            {targets && (
              <p className="mt-2 text-center font-mono text-xs text-on-surface-variant">
                REFERENCE TDEE: <span className="text-tertiary">{targets.tdee.toLocaleString()} KCAL</span>
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-xs uppercase text-on-surface-variant">
              Daily targets — editable, calories auto-calc:
            </p>
            {[
              { label: "Protein (g)", value: proteinG, set: setProteinG, color: "text-error" },
              { label: "Carbs (g)", value: carbsG, set: setCarbsG, color: "text-tertiary" },
              { label: "Fat (g)", value: fatG, set: setFatG, color: "text-on-surface" },
            ].map((f) => (
              <label
                key={f.label}
                className={`flex items-center justify-between gap-2 font-mono text-xs uppercase ${f.color}`}
              >
                {f.label}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  required
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-24 border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                />
              </label>
            ))}
            <div className="border-t-2 border-surface-variant pt-3 text-center">
              <span className="font-mono text-xs uppercase text-on-surface-variant">Total: </span>
              <span className="font-headline text-2xl font-extrabold text-primary">
                {totalCalories.toLocaleString()} kcal
              </span>
            </div>
            <p className="text-center font-mono text-[10px] text-on-surface-variant">
              REFERENCE TDEE: {targets ? targets.tdee.toLocaleString() : "—"} KCAL
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-2">
            {GOALS.map((g) => (
              <button
                type="button"
                key={g.id}
                aria-pressed={goal === g.id}
                onClick={() => setGoal(g.id)}
                style={goal === g.id ? { borderColor: "var(--color-primary)" } : undefined}
                className={`snes-window flex items-center justify-between p-3 text-left ${goal === g.id ? "" : "opacity-60"}`}
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
              FOR WEIGHT-TREND GUIDANCE — DOES NOT CHANGE YOUR MACROS
            </p>
          </div>
        )}

        {state?.error && (
          <p role="alert" className="font-mono text-xs text-error">
            {state.error}
          </p>
        )}

        {step < STEPS.length && (
          <button
            type="button"
            className="pixel-btn w-full"
            disabled={!canContinue || pending}
            aria-disabled={!canContinue || pending}
            onClick={goNext}
          >
            Continue
          </button>
        )}

        {step === 5 && (
          <button type="submit" className="pixel-btn w-full" disabled={pending}>
            {pending ? "Saving..." : "Complete Quest"}
          </button>
        )}

        {step > 1 && (
          <button
            type="button"
            className="pixel-btn-secondary w-full"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        )}
      </form>
    </div>
  );
}
