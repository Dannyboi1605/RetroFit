import { calculateTargets, caloriesFromMacros } from "./tdee";

const base = { age: 30, gender: "male" as const, heightCm: 180, weightKg: 80, activityLevel: "moderate" as const };

for (const goal of ["cut", "maintain", "bulk"] as const) {
  const r = calculateTargets({ ...base, goal });
  const total = caloriesFromMacros(r.proteinG, r.carbsG, r.fatG);
  const delta = Math.abs(total - r.dailyCalories);
  console.assert(delta <= 5, `${goal}: macros ${total} != dailyCalories ${r.dailyCalories} (off by ${delta})`);
  console.assert(r.dailyCalories === r.tdee + { cut: -500, maintain: 0, bulk: 400 }[goal], `${goal} adjustment`);
}
console.assert(r_protein(), `protein 2g/kg`);
function r_protein() {
  const r = calculateTargets({ ...base, goal: "maintain" });
  return r.proteinG === 160;
}
console.log("tdee ok");
