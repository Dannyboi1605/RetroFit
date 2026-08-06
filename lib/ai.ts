const OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

export type MealItem = {
  name: string;
  portion_description: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealAnalysisResult = {
  description: string;
  reasoning?: string;
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  items: MealItem[];
};

export interface BarcodeResult {
  name: string;
  barcode: string;
  serving_size: string;
  serving_quantity: number;
  calories_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
}

export class AIError extends Error {}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function cleanStr(v: unknown, fallback: string, maxLen: number): string {
  const s = String(v ?? "").trim().slice(0, maxLen);
  return s || fallback;
}

// free Gemma sometimes wraps output in ```json fences or preambles — pull the
// first balanced {...} object out before JSON.parse.
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) return fenced[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

const ITEM_CAP = { calories: 2000, protein: 500, carbs: 500, fat: 300, weight: 2000 };

function cleanItem(raw: unknown): MealItem {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    name: cleanStr(o.name, "Unknown item", 80),
    portion_description: cleanStr(o.portion_description, "", 80),
    estimated_weight_g: clampInt(o.estimated_weight_g, 0, ITEM_CAP.weight),
    calories: clampInt(o.calories, 0, ITEM_CAP.calories),
    protein_g: clampInt(o.protein_g, 0, ITEM_CAP.protein),
    carbs_g: clampInt(o.carbs_g, 0, ITEM_CAP.carbs),
    fat_g: clampInt(o.fat_g, 0, ITEM_CAP.fat),
  };
}

export function sumTotals(items: MealItem[]): MealAnalysisResult["total"] {
  return {
    calories: clampInt(items.reduce((a, i) => a + i.calories, 0), 0, 6000),
    protein_g: clampInt(items.reduce((a, i) => a + i.protein_g, 0), 0, 2000),
    carbs_g: clampInt(items.reduce((a, i) => a + i.carbs_g, 0), 0, 2000),
    fat_g: clampInt(items.reduce((a, i) => a + i.fat_g, 0), 0, 2000),
  };
}

const GEMINI_MODEL = "gemini-3.5-flash-lite";

function parseResult(raw: string): MealAnalysisResult {
  if (!raw) throw new AIError("AI returned no result");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new AIError("AI returned an unreadable result");
  }

  // some runs ignore the "items" array and emit a flat single-meal object — fold it in
  const items = Array.isArray(parsed.items) ? parsed.items.map(cleanItem) : [cleanItem(parsed)];
  return {
    description: cleanStr(parsed.description, cleanStr(parsed.name, "Unknown meal", 80), 120),
    reasoning:
      typeof parsed.reasoning === "string" && parsed.reasoning.trim()
        ? parsed.reasoning.trim().slice(0, 2000)
        : undefined,
    items,
    total: sumTotals(items),
  };
}

async function geminiAnalyze(key: string, prompt: string, dataUrl?: string): Promise<MealAnalysisResult> {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{ text: prompt }];
  if (dataUrl) {
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!m) throw new AIError("AI could not read the image");
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return parseResult(text);
}

function runAnalysis(prompt: string, dataUrl?: string): Promise<MealAnalysisResult> {
  return (async () => {
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: prompt },
    ];
    if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl } });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        return await geminiAnalyze(geminiKey, prompt, dataUrl);
      } catch (e) {
        // fall through to OpenRouter rather than surface a transient Gemini failure
        const msg = e instanceof AIError ? e.message : "AI request failed";
        console.error(`[ai] Gemini failed, falling back to OpenRouter: ${msg}`);
      }
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new AIError("AI is not configured");

    let lastError = "AI request failed";
    for (const model of OPENROUTER_MODELS) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return parseResult(data?.choices?.[0]?.message?.content);
      }

      // provider-side failures (401/403) and shared-pool limits (429) are transient — try the next model
      if (res.status === 429) lastError = "AI is busy right now — try again in a moment";
      else lastError = `AI request failed (${res.status})`;
    }
    throw new AIError(lastError);
  })();
}

const SHAPE_HINT =
  'Return exactly this shape: {"reasoning": string, "description": string, "items": [{"name", "portion_description", "estimated_weight_g", "calories", "protein_g", "carbs_g", "fat_g"}]}. ' +
  '"description" is the meal name shown in history: keep it short, 3-5 words, e.g. "Grilled chicken & rice", never a sentence.';

export async function analyzeMealImage(dataUrl: string, userNotes?: string): Promise<MealAnalysisResult> {
  let prompt =
    "Analyze this food photo step-by-step and return ONLY valid JSON — no markdown, no code fences, no extra text.\n" +
    "Reason through it first:\n" +
    "1. Judge the plate/bowl size to establish a visual scale.\n" +
    "2. List each distinct food item you can see.\n" +
    "3. Estimate each item's volume and weight in grams against that scale.\n" +
    "4. Estimate calories and macros per item using typical nutritional values scaled by the estimated weight.\n" +
    SHAPE_HINT;
  if (userNotes && userNotes.trim()) {
    prompt += `\n\nFor context, the user adds: ${userNotes.trim().slice(0, 500)}`;
  }
  return runAnalysis(prompt, dataUrl);
}

export async function analyzeMealText(description: string): Promise<MealAnalysisResult> {
  const prompt =
    "The user could not take a photo, so they describe their meal in text instead. Estimate calories and macros for it and return ONLY valid JSON — no markdown, no code fences, no extra text.\n" +
    "Reason through it first:\n" +
    "1. Identify each distinct food item from the description.\n" +
    `2. The user said: "${description.trim().slice(0, 500)}"\n` +
    "3. Estimate each item's weight in grams and its calories and macros using typical nutritional values.\n" +
    SHAPE_HINT;
  return runAnalysis(prompt);
}

// Open Food Facts rejects bare/generic user agents; the UA must describe the app.
const OFF_HEADERS = { "User-Agent": "NutriTrackApp - Web - Version 1.0 - contact@example.com" };

async function fetchBarcodeProduct(code: string): Promise<BarcodeResult | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
    headers: OFF_HEADERS,
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const servingQ = num(p.serving_quantity);

  return {
    barcode: code,
    name: cleanStr(p.product_name, `Product ${code}`, 80),
    serving_size: cleanStr(p.serving_size, "100 g", 40),
    serving_quantity: servingQ && servingQ > 0 ? servingQ : 100,
    calories_100g: num(n["energy-kcal_100g"]),
    protein_100g: num(n["proteins_100g"]),
    carbs_100g: num(n["carbohydrates_100g"]),
    fat_100g: num(n["fat_100g"]),
  };
}

export async function lookupBarcode(barcode: string): Promise<BarcodeResult | null> {
  const code = String(barcode).trim();
  if (!/^\d{8,14}$/.test(code)) return null;

  const result = await fetchBarcodeProduct(code);
  if (result) return result;
  // US products often scan as 12-digit UPC-A; OFF indexes the same digits as a
  // 13-digit EAN-13 with a leading zero — retry that.
  if (code.length === 12) return fetchBarcodeProduct(`0${code}`);
  return null;
}