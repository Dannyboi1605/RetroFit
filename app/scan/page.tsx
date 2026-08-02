"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import ScanCamera from "@/components/scan-camera";
import AddEntryModal from "@/components/add-entry-modal";
import { addMeal } from "@/db/db";
import { analyzeScan } from "./actions";
import { todayStr } from "@/lib/date";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export default function ScanPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "barcode">("ai");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    name: string;
    calories: string;
    proteinG: string;
    carbsG: string;
    fatG: string;
    servingSize: string;
    mealType: MealType;
    source: "ai_scan" | "barcode";
    barcode?: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  async function handleCapture(dataUrl: string) {
    setAnalyzing(true);
    setError(null);
    setSaved(false);
    const res = await analyzeScan(dataUrl);
    setAnalyzing(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setResult({
      name: res.name,
      calories: String(res.calories),
      proteinG: String(res.protein_g),
      carbsG: String(res.carbs_g),
      fatG: String(res.fat_g),
      servingSize: res.serving_size,
      mealType: "snack",
      source: "ai_scan",
    });
  }

  async function handleSave() {
    if (!result || !result.name || !result.calories) return;
    await addMeal({
      logged_date: todayStr(),
      meal_type: result.mealType,
      name: result.name,
      calories: Number(result.calories),
      protein_g: Number(result.proteinG) || 0,
      carbs_g: Number(result.carbsG) || 0,
      fat_g: Number(result.fatG) || 0,
      source: result.source,
    });
    setSaved(true);
    setResult(null);
  }

  return (
    <AppShell activeTab="scan">
      <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Meal Scan
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className={`pixel-btn-secondary py-2 font-mono text-xs uppercase ${mode === "ai" ? "opacity-100" : "opacity-50"}`}
          onClick={() => setMode("ai")}
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          AI Scan
        </button>
        <button
          className={`pixel-btn-secondary py-2 font-mono text-xs uppercase ${mode === "barcode" ? "opacity-100" : "opacity-50"}`}
          onClick={() => setMode("barcode")}
        >
          <span className="material-symbols-outlined text-sm">barcode_scanner</span>
          Barcode
        </button>
      </div>

      {mode === "ai" && !result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Point &amp; Capture
          </h2>
          {analyzing ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <span className="material-symbols-outlined animate-pulse text-4xl text-primary">auto_awesome</span>
              <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
                Analyzing meal...
              </div>
            </div>
          ) : (
            <ScanCamera onCapture={handleCapture} onError={setError} />
          )}
          {error && (
            <div className="border-2 border-error bg-error/10 p-3 font-mono text-xs font-semibold text-error">
              {error}
            </div>
          )}
          <button className="pixel-btn-secondary w-full" onClick={() => setManualOpen(true)}>
            <span className="material-symbols-outlined text-base">edit_note</span>
            Enter Manually Instead
          </button>
        </div>
      )}

      {mode === "ai" && result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Review &amp; Confirm
          </h2>
          {result.servingSize && (
            <div className="font-mono text-[11px] uppercase text-on-surface-variant">
              Detected: {result.servingSize}
            </div>
          )}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Name
            <input
              value={result.name}
              onChange={(e) => setResult({ ...result, name: e.target.value })}
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Calories
            <input
              type="number"
              min={0}
              value={result.calories}
              onChange={(e) => setResult({ ...result, calories: e.target.value })}
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "P (g)", key: "proteinG" as const },
              { label: "C (g)", key: "carbsG" as const },
              { label: "F (g)", key: "fatG" as const },
            ].map((f) => (
              <label key={f.key} className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
                {f.label}
                <input
                  type="number"
                  min={0}
                  value={result[f.key]}
                  onChange={(e) => setResult({ ...result, [f.key]: e.target.value })}
                  className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Meal
            <div className="grid grid-cols-4 gap-2">
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <button
                  key={m}
                  className={`pixel-btn-secondary py-1 font-mono text-[10px] uppercase ${
                    result.mealType === m ? "opacity-100" : "opacity-50"
                  }`}
                  onClick={() => setResult({ ...result, mealType: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="pixel-btn-secondary w-full" onClick={() => setResult(null)}>
              Retake
            </button>
            <button className="pixel-btn w-full" onClick={handleSave}>
              <span className="material-symbols-outlined text-base">save</span>
              Save Meal
            </button>
          </div>
        </div>
      )}

      {mode === "ai" && saved && (
        <div className="border-2 border-tertiary bg-tertiary/10 p-3 font-mono text-xs font-semibold uppercase text-tertiary">
          Meal logged!
        </div>
      )}

      {mode === "barcode" && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Scan Barcode
          </h2>
          <div className="py-8 text-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
            Camera scanner coming up...
          </div>
        </div>
      )}

      {manualOpen && (
        <AddEntryModal
          open
          date={todayStr()}
          mealType="snack"
          onClose={() => setManualOpen(false)}
          onSaved={() => router.push("/log")}
        />
      )}
    </AppShell>
  );
}
