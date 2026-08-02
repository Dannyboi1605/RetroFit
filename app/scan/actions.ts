"use server";

import { analyzeMealImage, lookupBarcode, AIError, type AIMealResult, type BarcodeResult } from "@/lib/ai";

export async function analyzeScan(imageDataUrl: string): Promise<AIMealResult | { error: string }> {
  try {
    return await analyzeMealImage(imageDataUrl);
  } catch (e) {
    if (e instanceof AIError) return { error: e.message };
    return { error: "AI analysis failed — try again" };
  }
}

export async function lookupBarcodeScan(barcode: string): Promise<BarcodeResult | { error: string }> {
  try {
    const result = await lookupBarcode(barcode);
    if (!result) return { error: "Barcode not found in Open Food Facts" };
    return result;
  } catch {
    return { error: "Lookup failed — try again" };
  }
}
