function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export function defaultMealType(d: Date = new Date()): MealType {
  const h = d.getHours();
  if (h >= 5 && h < 10) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 17 && h < 21) return "dinner";
  return "snack";
}
