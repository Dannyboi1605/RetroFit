"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import ScanCamera, { fileToDataUrl } from "@/components/scan-camera";
import AddEntryModal from "@/components/add-entry-modal";
import SaveToast from "@/components/save-toast";
import { addMeal } from "@/db/db";
import { analyzeScan, analyzeTextScan, lookupBarcodeScan } from "./actions";
import { todayStr } from "@/lib/date";
import { caloriesFromMacros } from "@/lib/tdee";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type ItemRow = {
  name: string;
  portion: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
};

type ReviewResult = {
  description: string;
  reasoning?: string;
  items: ItemRow[];
  mealType: MealType;
  source: "ai_scan" | "barcode";
  barcode?: string;
};

const EMPTY_ITEM: ItemRow = { name: "", portion: "per 100g", calories: "", proteinG: "", carbsG: "", fatG: "" };

function sumItems(items: ItemRow[]) {
  return items.reduce(
    (t, i) => {
      t.calories += Number(i.calories) || 0;
      t.proteinG += Number(i.proteinG) || 0;
      t.carbsG += Number(i.carbsG) || 0;
      t.fatG += Number(i.fatG) || 0;
      return t;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

export default function ScanPage() {
  const [mode, setMode] = useState<"ai" | "barcode">("ai");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [describe, setDescribe] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  function barcodeReview(res: {
    name: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    serving_size?: string;
    barcode: string;
  }): ReviewResult {
    return {
      description: res.name,
      items: [
        {
          name: res.name,
          portion: res.serving_size ?? "per 100g",
          calories: res.calories ? String(res.calories) : "",
          proteinG: res.protein_g ? String(res.protein_g) : "",
          carbsG: res.carbs_g ? String(res.carbs_g) : "",
          fatG: res.fat_g ? String(res.fat_g) : "",
        },
      ],
      mealType: "snack",
      source: "barcode",
      barcode: res.barcode,
    };
  }

  useEffect(() => {
    if (mode !== "barcode" || result) return;
    let stopped = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (stopped) return;
      const scanner = new Html5Qrcode("barcode-container");
      scannerRef.current = scanner;
      setScanning(true);
      setError(null);
      await scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            await scanner.stop();
            scannerRef.current = null;
            setScanning(false);
            const res = await lookupBarcodeScan(decodedText);
            setResult(
              "error" in res
                ? {
                    description: "",
                    items: [{ ...EMPTY_ITEM, portion: "Barcode: " + decodedText }],
                    mealType: "snack",
                    source: "barcode",
                    barcode: decodedText,
                  }
                : barcodeReview(res)
            );
          },
          () => {}
        )
        .catch(() => {
          scannerRef.current = null;
          if (!stopped) setError("Camera unavailable — enter the barcode manually instead.");
        });
    })();
    return () => {
      stopped = true;
      try {
        scannerRef.current?.stop();
      } catch {
        // scanner was never started (camera unavailable) — nothing to stop
      }
      scannerRef.current = null;
    };
  }, [mode, result]);

  function applyResult(res: { description: string; reasoning?: string; items: { name: string; portion_description: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }[] }) {
    setNotes("");
    setDescribe("");
    setResult({
      description: res.description,
      reasoning: res.reasoning,
      items: res.items.map((i) => ({
        name: i.name,
        portion: i.portion_description,
        calories: String(i.calories),
        proteinG: String(i.protein_g),
        carbsG: String(i.carbs_g),
        fatG: String(i.fat_g),
      })),
      mealType: "snack",
      source: "ai_scan",
    });
  }

  async function handleCapture(dataUrl: string, note?: string) {
    setAnalyzing(true);
    setError(null);
    setFlash(null);
    const res = await analyzeScan(dataUrl, note);
    setAnalyzing(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    applyResult(res);
  }

  async function handleDescribe() {
    if (!describe.trim()) {
      setError("Describe your meal first");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setFlash(null);
    const res = await analyzeTextScan(describe);
    setAnalyzing(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    applyResult(res);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      await handleCapture(await fileToDataUrl(file), notes);
    } catch {
      setError("Could not read that file — try another photo");
    }
  }

  function setItem(index: number, patch: Partial<ItemRow>) {
    setResult((r) => (r ? { ...r, items: r.items.map((it, j) => (j === index ? { ...it, ...patch } : it)) } : r));
  }

  function setMacro(index: number, key: "proteinG" | "carbsG" | "fatG", value: string) {
    setResult((r) => {
      if (!r) return r;
      const next = { ...r.items[index], [key]: value };
      const p = Number(next.proteinG) || 0;
      const c = Number(next.carbsG) || 0;
      const f = Number(next.fatG) || 0;
      if (p + c + f > 0) next.calories = String(caloriesFromMacros(p, c, f));
      return { ...r, items: r.items.map((it, j) => (j === index ? next : it)) };
    });
  }

  async function handleSave() {
    if (!result) return;
    const t = sumItems(result.items);
    const name = result.description.trim() || result.items.find((i) => i.name)?.name || "Meal";
    if (!t.calories) {
      setError("Enter calories before saving");
      return;
    }
    await addMeal({
      // log to the date /log asked for (e.g. past day), defaulting to today
      logged_date: new URLSearchParams(window.location.search).get("date") || todayStr(),
      meal_type: result.mealType,
      name,
      calories: t.calories,
      protein_g: t.proteinG,
      carbs_g: t.carbsG,
      fat_g: t.fatG,
      source: result.source,
    });
    setFlash("Meal logged!");
    setResult(null);
  }

  async function lookupManual(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLookingUp(true);
    try {
      const res = await lookupBarcodeScan(trimmed);
      setResult(
        "error" in res
          ? {
              description: "",
              items: [{ ...EMPTY_ITEM, portion: "Not found — fill in the details" }],
              mealType: "snack",
              source: "barcode",
              barcode: trimmed,
            }
          : barcodeReview(res)
      );
    } finally {
      setLookingUp(false);
    }
  }

  const t = result ? sumItems(result.items) : null;

  return (
    <AppShell activeTab="scan">
      <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Meal Scan
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          aria-pressed={mode === "ai"}
          aria-label="Switch to AI scan"
          className={`pixel-btn-secondary py-2 ${mode === "ai" ? "border-primary text-primary" : "opacity-60"}`}
          onClick={() => setMode("ai")}
        >
          <span className="material-symbols-outlined text-base">auto_awesome</span>
          AI Scan
        </button>
        <button
          aria-pressed={mode === "barcode"}
          aria-label="Switch to barcode scan"
          className={`pixel-btn-secondary py-2 ${mode === "barcode" ? "border-primary text-primary" : "opacity-60"}`}
          onClick={() => setMode("barcode")}
        >
          <span className="material-symbols-outlined text-base">barcode_scanner</span>
          Barcode
        </button>
      </div>

      {mode === "ai" && !result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Point &amp; Capture
          </h2>
          <div className="lg:grid lg:grid-cols-2 lg:gap-6">
            <div className="flex flex-col gap-4">
              {analyzing ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <span className="material-symbols-outlined animate-pulse text-4xl text-primary">auto_awesome</span>
                  <div className="font-mono text-xs font-semibold uppercase text-on-surface-variant">
                    Analyzing meal...
                  </div>
                </div>
              ) : (
                <ScanCamera onCapture={(url) => handleCapture(url, notes)} onError={setError} />
              )}
              <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. cooked in oil, extra gravy, chicken is fried"
                  className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                />
              </label>
              <label
                className={`pixel-btn-secondary w-full cursor-pointer ${analyzing ? "pointer-events-none opacity-50" : ""}`}
                aria-disabled={analyzing}
              >
                <span className="material-symbols-outlined text-base">photo_library</span>
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {!analyzing && (
              <div className="flex flex-col gap-4 lg:border-l-2 lg:border-outline-variant lg:pl-6">
                <div className="flex items-center gap-2 lg:hidden">
                  <div className="h-0 flex-1 border-t-2 border-outline-variant" />
                  <span className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">OR</span>
                  <div className="h-0 flex-1 border-t-2 border-outline-variant" />
                </div>
                <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
                  Describe your meal
                  <textarea
                    value={describe}
                    onChange={(e) => setDescribe(e.target.value)}
                    rows={6}
                    placeholder="e.g. half a plate of fried rice with an egg, two pieces of fried chicken, and a bowl of soup"
                    className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                  />
                </label>
                <button
                  className="pixel-btn-secondary w-full"
                  onClick={handleDescribe}
                  disabled={!describe.trim()}
                >
                  <span className="material-symbols-outlined text-base">keyboard_alt</span>
                  Analyze Description
                </button>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="border-2 border-error bg-error/10 p-3 font-mono text-xs font-semibold text-error">
              {error}
            </div>
          )}
          <button className="pixel-btn-secondary w-full" onClick={() => setManualOpen(true)}>
            <span className="material-symbols-outlined text-base">edit_note</span>
            Enter Manually Instead
          </button>
        </div>
      )}

      {result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Review &amp; Confirm
          </h2>
          {result.barcode && (
            <div className="border border-outline-variant bg-surface-container-low p-2 font-mono text-xs uppercase text-on-surface-variant">
              Barcode: {result.barcode}
            </div>
          )}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Description
            <input
              value={result.description}
              onChange={(e) => setResult({ ...result, description: e.target.value })}
              placeholder="e.g. Nasi Lemak with Fried Chicken"
              className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
            />
          </label>

          {result.items.map((item, i) => (
            <fieldset key={i} className="flex flex-col gap-2 border-2 border-outline-variant p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase text-tertiary">Item {i + 1}</span>
                  <input
                    aria-label={`Item ${i + 1} name`}
                    value={item.name}
                    onChange={(e) => setItem(i, { name: e.target.value })}
                    placeholder="Name"
                    className="w-full border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                  />
                </div>
              </div>
              <div className="font-mono text-[11px] uppercase text-on-surface-variant">{item.portion}</div>
              <div className="grid grid-cols-4 gap-2">
                <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
                  Kcal
                  <input
                    type="number"
                    min={0}
                    value={item.calories}
                    onChange={(e) => setItem(i, { calories: e.target.value })}
                    className="border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                  />
                </label>
                {([
                  ["P (g)", "proteinG"],
                  ["C (g)", "carbsG"],
                  ["F (g)", "fatG"],
                ] as const).map(([label, key]) => (
                  <label key={key} className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
                    {label}
                    <input
                      type="number"
                      min={0}
                      value={item[key]}
                      onChange={(e) => setMacro(i, key, e.target.value)}
                      className="border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="border-2 border-primary bg-surface-container p-3">
            <div className="flex justify-between font-mono text-sm font-bold uppercase text-primary">
              <span>Total</span>
              <span>{t ? `${t.calories} kcal` : "—"}</span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-xs text-on-surface-variant">
              <span>P {t ? `${t.proteinG}g` : "—"}</span>
              <span>C {t ? `${t.carbsG}g` : "—"}</span>
              <span>F {t ? `${t.fatG}g` : "—"}</span>
            </div>
          </div>

          {result.reasoning && (
            <details className="border-2 border-outline-variant p-2">
              <summary className="cursor-pointer font-mono text-[11px] font-bold uppercase text-on-surface-variant">
                AI Estimation Reasoning
              </summary>
              <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-on-surface-variant">
                {result.reasoning}
              </p>
            </details>
          )}

          <div className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Meal
            <div className="grid grid-cols-4 gap-2">
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={result.mealType === m}
                  className={`pixel-btn-secondary px-1 py-1 font-mono text-xs uppercase ${
                    result.mealType === m ? "border-primary text-primary" : "opacity-60"
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

      {flash && <SaveToast key={flash} message={flash} onDone={() => setFlash(null)} />}

      {mode === "barcode" && !result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Scan Barcode
          </h2>
          <div className="relative aspect-square w-full overflow-hidden border-2 border-outline-variant bg-surface-container lg:mx-auto lg:max-w-md">
            <div id="barcode-container" className="h-full w-full" />
            {scanning && (
              <div className="pointer-events-none absolute inset-0">
                <div className="scanline-anim pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/60" />
                <div className="absolute inset-0 flex items-end justify-center pb-3 font-mono text-[10px] font-semibold uppercase text-on-surface-variant">
                  Point at the barcode
                </div>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="border-2 border-error bg-error/10 p-3 font-mono text-xs font-semibold text-error">
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Or type the code
            <div className="flex gap-2">
              <input
                id="manual-barcode"
                aria-label="Barcode number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                placeholder="e.g. 5449000000996"
                onKeyDown={(e) => {
                  if (e.key === "Enter") lookupManual(manualCode);
                }}
              />
              <button
                className="pixel-btn-secondary shrink-0 px-3 disabled:opacity-50"
                disabled={lookingUp}
                onClick={() => lookupManual(manualCode)}
              >
                {lookingUp ? "Looking up..." : "Look Up"}
              </button>
            </div>
          </label>
        </div>
      )}

      {manualOpen && (
        <AddEntryModal
          open
          date={todayStr()}
          mealType="snack"
          onClose={() => setManualOpen(false)}
          onSaved={() => setFlash("Meal logged!")}
        />
      )}
    </AppShell>
  );
}