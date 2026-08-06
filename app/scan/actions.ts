"use server";

import { analyzeMealImage, analyzeMealText, lookupBarcode, AIError, type MealAnalysisResult, type BarcodeResult } from "@/lib/ai";

export async function analyzeScan(dataUrl: string, userNotes?: string): Promise<MealAnalysisResult | { error: string }> {
  try {
    return await analyzeMealImage(dataUrl, userNotes);
  } catch (e) {
    if (e instanceof AIError) return { error: e.message };
    return { error: "AI analysis failed — try again" };
  }
}

export async function analyzeTextScan(description: string): Promise<MealAnalysisResult | { error: string }> {
  try {
    if (!description.trim()) return { error: "Describe your meal first" };
    return await analyzeMealText(description);
  } catch (e) {
    if (e instanceof AIError) return { error: e.message };
    return { error: "AI analysis failed — try again" };
  }
}

export async function lookupBarcodeScan(barcode: string): Promise<BarcodeResult | { success: false; error: string }> {
  try {
    const result = await lookupBarcode(barcode);
    if (!result) return { success: false, error: "Barcode not found in Open Food Facts" };
    return result;
  } catch {
    return { success: false, error: "Lookup failed — try again" };
  }
}
