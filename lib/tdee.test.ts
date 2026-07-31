import { calculateTargets, caloriesFromMacros } from "./tdee";

const r = calculateTargets({
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  goal: "maintain",
});
const expected = {
  bmr: 10 * 80 + 6.25 * 180 - 5 * 30 + 5, // 1775
  tdee: Math.round((10 * 80 + 6.25 * 180 - 5 * 30 + 5) * 1.55), // 2751
};
console.assert(r.bmr === expected.bmr, `bmr ${r.bmr} != ${expected.bmr}`);
console.assert(r.tdee === expected.tdee, `tdee ${r.tdee} != ${expected.tdee}`);
console.assert(r.dailyCalories === expected.tdee, `maintain should equal tdee`);
console.assert(r.proteinG === 160, `protein 2g/kg`);
console.assert(caloriesFromMacros(100, 200, 50) === 1650, `4/4/9 math: 100*4+200*4+50*9 = 1650`);
console.log("tdee ok");
