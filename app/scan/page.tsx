"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import ScanCamera, { fileToDataUrl } from "@/components/scan-camera";
import AddEntryModal from "@/components/add-entry-modal";
import { addMeal } from "@/db/db";
import { analyzeScan, lookupBarcodeScan } from "./actions";
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
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

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
            if ("error" in res) {
              setResult({
                name: "",
                calories: "",
                proteinG: "",
                carbsG: "",
                fatG: "",
                servingSize: "Barcode: " + decodedText,
                mealType: "snack",
                source: "barcode",
                barcode: decodedText,
              });
            } else {
              setResult({
                name: res.name,
                calories: res.calories ? String(res.calories) : "",
                proteinG: res.protein_g ? String(res.protein_g) : "",
                carbsG: res.carbs_g ? String(res.carbs_g) : "",
                fatG: res.fat_g ? String(res.fat_g) : "",
                servingSize: res.serving_size ?? "per 100g",
                mealType: "snack",
                source: "barcode",
                barcode: res.barcode,
              });
            }
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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      await handleCapture(await fileToDataUrl(file));
    } catch {
      setError("Could not read that file — try another photo");
    }
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
          className={`pixel-btn-secondary py-2 ${mode === "ai" ? "opacity-100" : "opacity-50"}`}
          onClick={() => setMode("ai")}
        >
          <span className="material-symbols-outlined text-base">auto_awesome</span>
          AI Scan
        </button>
        <button
          className={`pixel-btn-secondary py-2 ${mode === "barcode" ? "opacity-100" : "opacity-50"}`}
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
                  className={`pixel-btn-secondary px-1 py-1 font-mono text-xs uppercase ${
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

      {saved && (
        <div className="border-2 border-tertiary bg-tertiary/10 p-3 font-mono text-xs font-semibold uppercase text-tertiary">
          Meal logged!
        </div>
      )}

      {mode === "barcode" && !result && (
        <div className="snes-window flex flex-col gap-4 p-4">
          <h2 className="border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
            Scan Barcode
          </h2>
          <div className="relative aspect-square w-full overflow-hidden border-2 border-outline-variant bg-surface-container">
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
            <div className="border-2 border-error bg-error/10 p-3 font-mono text-xs font-semibold text-error">
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
            Or type the code
            <div className="flex gap-2">
              <input
                id="manual-barcode"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                placeholder="e.g. 5449000000996"
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  const code = (e.target as HTMLInputElement).value.trim();
                  if (!code) return;
                  const res = await lookupBarcodeScan(code);
                  if ("error" in res)
                    setResult({
                      name: "",
                      calories: "",
                      proteinG: "",
                      carbsG: "",
                      fatG: "",
                      servingSize: "Not found — fill in the details",
                      mealType: "snack",
                      source: "barcode",
                      barcode: code,
                    });
                  else
                    setResult({
                      name: res.name,
                      calories: res.calories ? String(res.calories) : "",
                      proteinG: res.protein_g ? String(res.protein_g) : "",
                      carbsG: res.carbs_g ? String(res.carbs_g) : "",
                      fatG: res.fat_g ? String(res.fat_g) : "",
                      servingSize: res.serving_size ?? "per 100g",
                      mealType: "snack",
                      source: "barcode",
                      barcode: res.barcode,
                    });
                }}
              />
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
          onSaved={() => router.push("/log")}
        />
      )}
    </AppShell>
  );
}
