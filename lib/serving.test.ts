import { toDisplayed, fromDisplayed, convertAmount, amountToGrams } from "./serving";

const per100 = { calories: 500, proteinG: 10, carbsG: 20, fatG: 5 };

const d = toDisplayed(per100, "g", 200, 100);
console.assert(d.calories === 1000 && d.proteinG === 20 && d.carbsG === 40 && d.fatG === 10, "200g doubles per-100g");

const s = toDisplayed(per100, "serving", 0.5, 200);
console.assert(s.calories === 500 && s.proteinG === 10 && s.carbsG === 20 && s.fatG === 5, "0.5 serving of 200g = 100g");

console.assert(amountToGrams(2, "serving", 150) === 300, "servings to grams");
console.assert(convertAmount(300, "g", "serving", 150) === 2, "g to servings");
console.assert(convertAmount(2, "serving", "g", 150) === 300, "servings to g");

const rt = fromDisplayed(toDisplayed(per100, "g", 150, 100), "g", 150, 100);
console.assert(rt.calories === 500 && rt.proteinG === 10 && rt.carbsG === 20 && rt.fatG === 5, "invert round-trips");

const zero = fromDisplayed(per100, "g", 0, 100);
console.assert(Number.isFinite(zero.calories) && zero.calories === 500, "zero grams is a no-op, not NaN");

console.assert(convertAmount(150, "g", "serving", 0) === 0, "zero gPerServing never produces Infinity");
const z = toDisplayed(per100, "serving", 1, 0);
console.assert(z.calories === 0 && z.proteinG === 0, "zero gPerServing displays zero macros, not NaN");

console.log("serving ok");
