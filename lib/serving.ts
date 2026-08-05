export type Unit = "g" | "serving";

export type Per100 = { calories: number; proteinG: number; carbsG: number; fatG: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function amountToGrams(amount: number, unit: Unit, gPerServing: number): number {
  return unit === "g" ? amount : amount * gPerServing;
}

export function toDisplayed(per100: Per100, unit: Unit, amount: number, gPerServing: number): Per100 {
  const f = amountToGrams(amount, unit, gPerServing) / 100;
  return {
    calories: round1(per100.calories * f),
    proteinG: round1(per100.proteinG * f),
    carbsG: round1(per100.carbsG * f),
    fatG: round1(per100.fatG * f),
  };
}

export function fromDisplayed(macros: Per100, unit: Unit, amount: number, gPerServing: number): Per100 {
  const grams = amountToGrams(amount, unit, gPerServing);
  if (grams <= 0) return macros;
  const f = 100 / grams;
  return {
    calories: round1(macros.calories * f),
    proteinG: round1(macros.proteinG * f),
    carbsG: round1(macros.carbsG * f),
    fatG: round1(macros.fatG * f),
  };
}

export function convertAmount(amount: number, from: Unit, to: Unit, gPerServing: number): number {
  const grams = amountToGrams(amount, from, gPerServing);
  return to === "g" ? grams : gPerServing > 0 ? grams / gPerServing : 0;
}
