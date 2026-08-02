const OPENROUTER_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
];

export type AIMealResult = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size: string;
};

export type BarcodeResult = {
  name: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  serving_size?: string;
  barcode: string;
};

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

export async function analyzeMealImage(imageDataUrl: string): Promise<AIMealResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AIError("AI is not configured");

  const base64 = imageDataUrl.includes("base64,") ? imageDataUrl.split("base64,")[1] : imageDataUrl;

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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this food photo and return JSON only with exactly these keys: name (string), calories (number, whole), protein_g (number, grams), carbs_g (number, grams), fat_g (number, grams), serving_size (string). Estimate portion size from the photo. No markdown, no extra text.",
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new AIError("AI returned no result");

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new AIError("AI returned an unreadable result");
      }

      return {
        name: cleanStr(parsed.name, "Unknown meal", 80),
        calories: clampInt(parsed.calories, 0, 6000),
        protein_g: clampInt(parsed.protein_g, 0, 2000),
        carbs_g: clampInt(parsed.carbs_g, 0, 2000),
        fat_g: clampInt(parsed.fat_g, 0, 2000),
        serving_size: cleanStr(parsed.serving_size, "", 80),
      };
    }

    // provider-side outages (401/404) and shared-pool limits (429) are transient — try the next model
    if (res.status === 429) lastError = "AI is busy right now — try again in a moment";
    else lastError = `AI request failed (${res.status})`;
  }
  throw new AIError(lastError);
}

export async function lookupBarcode(barcode: string): Promise<BarcodeResult | null> {
  const code = String(barcode).trim();
  if (!/^\d{8,14}$/.test(code)) return null;

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
    headers: { "User-Agent": "RetroFit/1.0 (personal calorie tracker)" },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};
  const quantityG = Number(p.quantity?.match(/\d+(\.\d+)?/)?.[0]);
  const scale = quantityG && quantityG > 0 ? quantityG / 100 : 1;

  const result: BarcodeResult = {
    name: cleanStr(p.product_name, `Product ${code}`, 80),
    barcode: code,
    serving_size: p.quantity ? String(p.quantity).slice(0, 40) : "per 100g",
  };
  for (const [key, field] of [
    ["calories", "energy-kcal_100g"],
    ["protein_g", "proteins_100g"],
    ["carbs_g", "carbohydrates_100g"],
    ["fat_g", "fat_100g"],
  ] as const) {
    if (Number.isFinite(Number(n[field]))) {
      result[key] = Math.round(Number(n[field]) * scale);
    }
  }
  return result;
}
