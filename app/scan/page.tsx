"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import ScanCamera, { fileToDataUrl } from "@/components/scan-camera";
import AddEntryModal from "@/components/add-entry-modal";
import SaveToast from "@/components/save-toast";
import { addMeal } from "@/db/db";
import { analyzeScan, analyzeTextScan, lookupBarcodeScan } from "./actions";
import type { BarcodeResult } from "@/lib/ai";
import { todayStr } from "@/lib/date";
import { caloriesFromMacros } from "@/lib/tdee";
import { toDisplayed, fromDisplayed, convertAmount, type Unit, type Per100 } from "@/lib/serving";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type ItemRow = {
  name: string;
  portionLabel: string;
  unit: Unit;
  amount: string;
  gPerServing: number;
  per100: Per100;
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

const EMPTY_ITEM: ItemRow = {
  name: "",
  portionLabel: "per 100g",
  unit: "g",
  amount: "100",
  gPerServing: 100,
  per100: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  calories: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
};

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
  const [started, setStarted] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  function barcodeReview(res: BarcodeResult): ReviewResult {
    const amount = res.serving_quantity > 0 ? res.serving_quantity : 100;
    const per100: Per100 = {
      calories: res.calories_100g ?? 0,
      proteinG: res.protein_100g ?? 0,
      carbsG: res.carbs_100g ?? 0,
      fatG: res.fat_100g ?? 0,
    };
    const d = toDisplayed(per100, "g", amount, amount);
    return {
      description: res.name,
      items: [
        {
          name: res.name,
          portionLabel: res.serving_size || "100 g",
          unit: "g",
          amount: String(amount),
          gPerServing: amount,
          per100,
          calories: d.calories ? String(d.calories) : "",
          proteinG: d.proteinG ? String(d.proteinG) : "",
          carbsG: d.carbsG ? String(d.carbsG) : "",
          fatG: d.fatG ? String(d.fatG) : "",
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
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (stopped) return;
      const scanner = new Html5Qrcode("barcode-container", {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.ITF,
        ],
      });
      scannerRef.current = scanner;
      setScanning(true);
      setStarted(false);
      setError(null);
      await scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: { width: 280, height: 180 },
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: "continuous",
            } as MediaTrackConstraints,
          },
          async (decodedText) => {
            await scanner.stop();
            scannerRef.current = null;
            setScanning(false);
            const res = await lookupBarcodeScan(decodedText);
            setResult(
              "error" in res
                ? {
                    description: "",
                    items: [{ ...EMPTY_ITEM, portionLabel: "Barcode: " + decodedText }],
                    mealType: "snack",
                    source: "barcode",
                    barcode: decodedText,
                  }
                : barcodeReview(res)
            );
          },
          () => {}
        )
        .then(() => {
          if (!stopped) setStarted(true);
        })
        .catch(() => {
          scannerRef.current = null;
          setScanning(false);
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
      setScanning(false);
      setStarted(false);
    };
  }, [mode, result]);

  function applyResult(res: {
    description: string;
    reasoning?: string;
    items: {
      name: string;
      portion_description: string;
      estimated_weight_g: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }[];
  }) {
    setNotes("");
    setDescribe("");
    setResult({
      description: res.description,
      reasoning: res.reasoning,
      items: res.items.map((i) => {
        const weight = i.estimated_weight_g > 0 ? i.estimated_weight_g : 100;
        return {
          name: i.name,
          portionLabel: i.portion_description,
          unit: "g",
          amount: String(weight),
          gPerServing: weight,
          per100: fromDisplayed(
            { calories: i.calories, proteinG: i.protein_g, carbsG: i.carbs_g, fatG: i.fat_g },
            "g",
            weight,
            weight
          ),
          calories: String(i.calories),
          proteinG: String(i.protein_g),
          carbsG: String(i.carbs_g),
          fatG: String(i.fat_g),
        };
      }),
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

  function removeItem(index: number) {
    setResult((r) => (r ? { ...r, items: r.items.filter((_, j) => j !== index) } : r));
  }

  function addItem() {
    setResult((r) =>
      r
        ? {
            ...r,
            items: [
              ...r.items,
              {
                ...EMPTY_ITEM,
                name: `Ingredient ${r.items.length + 1}`,
              },
            ],
          }
        : r
    );
  }

  function setMacro(index: number, key: "proteinG" | "carbsG" | "fatG", value: string) {
    setResult((r) => {
      if (!r) return r;
      const item = r.items[index];
      const next = { ...item, [key]: value };
      const p = Number(next.proteinG) || 0;
      const c = Number(next.carbsG) || 0;
      const f = Number(next.fatG) || 0;
      if (p + c + f > 0) next.calories = String(caloriesFromMacros(p, c, f));
      next.per100 = fromDisplayed(
        { calories: Number(next.calories) || 0, proteinG: p, carbsG: c, fatG: f },
        next.unit,
        Number(next.amount) || 0,
        next.gPerServing
      );
      return { ...r, items: r.items.map((it, j) => (j === index ? next : it)) };
    });
  }

  function setCaloriesField(index: number, value: string) {
    setResult((r) => {
      if (!r) return r;
      return {
        ...r,
        items: r.items.map((it, j) =>
          j === index
            ? {
                ...it,
                calories: value,
                per100: fromDisplayed(
                  { calories: Number(value) || 0, proteinG: Number(it.proteinG) || 0, carbsG: Number(it.carbsG) || 0, fatG: Number(it.fatG) || 0 },
                  it.unit,
                  Number(it.amount) || 0,
                  it.gPerServing
                ),
              }
            : it
        ),
      };
    });
  }

  function setAmount(index: number, value: string) {
    setResult((r) => {
      if (!r || value === "-") return r;
      const item = r.items[index];
      const n = Number(value) || 0;
      const d = toDisplayed(item.per100, item.unit, n, item.gPerServing);
      return {
        ...r,
        items: r.items.map((it, j) =>
          j === index
            ? { ...it, amount: value, calories: String(d.calories), proteinG: String(d.proteinG), carbsG: String(d.carbsG), fatG: String(d.fatG) }
            : it
        ),
      };
    });
  }

  function setUnit(index: number, unit: Unit) {
    setResult((r) => {
      if (!r) return r;
      const item = r.items[index];
      if (item.unit === unit) return r;
      const amount = String(convertAmount(Number(item.amount) || 0, item.unit, unit, item.gPerServing));
      const d = toDisplayed(item.per100, unit, Number(amount), item.gPerServing);
      return {
        ...r,
        items: r.items.map((it, j) =>
          j === index
            ? { ...it, unit, amount, calories: String(d.calories), proteinG: String(d.proteinG), carbsG: String(d.carbsG), fatG: String(d.fatG) }
            : it
        ),
      };
    });
  }

  function setGPerServing(index: number, value: string) {
    setResult((r) => {
      if (!r || value === "-") return r;
      const item = r.items[index];
      const gPerServing = Number(value);
      const next = { ...item, gPerServing };
      if (item.unit === "serving") {
        const d = toDisplayed(item.per100, item.unit, Number(item.amount) || 0, gPerServing);
        next.calories = String(d.calories);
        next.proteinG = String(d.proteinG);
        next.carbsG = String(d.carbsG);
        next.fatG = String(d.fatG);
      }
      return { ...r, items: r.items.map((it, j) => (j === index ? next : it)) };
    });
  }

  async function handleSave() {
    if (!result) return;
    const t = sumItems(result.items);
    const name = result.description.trim() || result.items.find((i) => i.name)?.name || "Meal";
    if (!t.calories && result.items.length > 0) {
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
      ingredients: result.items.map((item) => ({
        name: item.name || "Ingredient",
        calories: Number(item.calories) || 0,
        protein_g: Number(item.proteinG) || 0,
        carbs_g: Number(item.carbsG) || 0,
        fat_g: Number(item.fatG) || 0,
        amount: item.amount,
        unit: item.unit,
      })),
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
              items: [{ ...EMPTY_ITEM, portionLabel: "Not found — fill in the details" }],
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
                <div className="flex flex-1 items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase text-tertiary">Item {i + 1}</span>
                  <input
                    aria-label={`Item ${i + 1} name`}
                    value={item.name}
                    onChange={(e) => setItem(i, { name: e.target.value })}
                    placeholder="Name"
                    className="w-full border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${item.name || `Item ${i + 1}`}`}
                  title="Delete ingredient"
                  onClick={() => removeItem(i)}
                  className="flex items-center gap-1 border border-error/50 bg-error/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-error transition-colors hover:bg-error hover:text-on-error"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Delete
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">Serving size</span>
                  <div className="flex items-stretch gap-1">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Item ${i + 1} serving size`}
                      value={item.amount}
                      onChange={(e) => setAmount(i, e.target.value)}
                      className="w-20 border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                    />
                    <div className="flex border-2 border-outline-variant">
                      {(["g", "serving"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          aria-pressed={item.unit === u}
                          onClick={() => setUnit(i, u)}
                          className={`px-2 py-1.5 font-mono text-[10px] font-bold uppercase transition-colors ${
                            item.unit === u
                              ? "bg-surface-container-high text-primary"
                              : "bg-surface text-on-surface-variant opacity-60"
                          }`}
                        >
                          {u === "g" ? "grams" : "servings"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {item.unit === "serving" && (
                  <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
                    <span>1 serving =</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.gPerServing}
                        onChange={(e) => setGPerServing(i, e.target.value)}
                        className="w-20 border-2 border-outline-variant bg-surface p-1.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
                      />
                      <span>g</span>
                    </div>
                  </label>
                )}
                {item.portionLabel && (
                  <span className="ml-auto font-mono text-[11px] uppercase text-on-surface-variant">{item.portionLabel}</span>
                )}
              </div>
              <div className="font-mono text-[10px] text-on-surface-variant">
                Macros adjust automatically when you change the serving size
              </div>
              <div className="grid grid-cols-4 gap-2">
                <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
                  Kcal
                  <input
                    type="number"
                    min={0}
                    value={item.calories}
                    onChange={(e) => setCaloriesField(i, e.target.value)}
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

          {result.items.length === 0 && (
            <div className="border-2 border-dashed border-outline-variant p-4 text-center font-mono text-xs text-on-surface-variant">
              No ingredients listed. Click &quot;Add Ingredient&quot; below to add one manually.
            </div>
          )}

          <button type="button" className="pixel-btn-secondary w-full" onClick={addItem}>
            <span className="material-symbols-outlined text-base">add</span>
            Add Ingredient
          </button>

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
            {scanning && !started && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                Starting camera...
              </div>
            )}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-4 top-4 h-1 border-x-2 border-t-2 border-tertiary" />
              <div className="absolute inset-x-4 bottom-4 h-1 border-x-2 border-b-2 border-tertiary" />
              <div className="absolute inset-y-4 left-4 w-1 border-y-2 border-l-2 border-tertiary" />
              <div className="absolute inset-y-4 right-4 w-1 border-y-2 border-r-2 border-tertiary" />
            </div>
            {scanning && started && (
              <div className="pointer-events-none absolute inset-0">
                <div className="scanline-anim pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/60" />
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="flex items-center gap-1.5 bg-surface/80 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-on-surface-variant">
                    <span className="material-symbols-outlined text-xs">barcode_scanner</span>
                    Point at the barcode
                  </span>
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