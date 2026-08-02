import { extractJson, sumTotals } from "./ai";

const fenced = 'Sure! Here is the analysis:\n```json\n{"description":"Nasi Lemak","items":[]}\n```\n';
console.assert(JSON.parse(extractJson(fenced)).description === "Nasi Lemak", "extract json from fenced block");

const prefixed = 'Here you go: {"description":"Fried Rice","items":[]}';
console.assert(JSON.parse(extractJson(prefixed)).description === "Fried Rice", "extract bare json after preamble");

const bare = '{"description":"Soup","items":[]}';
console.assert(JSON.parse(extractJson(bare)).description === "Soup", "extract plain json");

const items = [
  { name: "Rice", portion_description: "1 cup", estimated_weight_g: 150, calories: 195, protein_g: 4, carbs_g: 43, fat_g: 1 },
  { name: "Chicken", portion_description: "1 piece", estimated_weight_g: 120, calories: 320, protein_g: 24, carbs_g: 12, fat_g: 20 },
];
const total = sumTotals(items);
console.assert(total.calories === 515, `sum calories ${total.calories} != 515`);
console.assert(total.protein_g === 28, `sum protein ${total.protein_g} != 28`);
console.assert(total.carbs_g === 55, `sum carbs ${total.carbs_g} != 55`);
console.assert(total.fat_g === 21, `sum fat ${total.fat_g} != 21`);

const crazy = [{ ...items[0], calories: 99999, protein_g: 99999 }, { ...items[1], calories: 99999 }];
const capped = sumTotals(crazy);
console.assert(capped.calories === 6000, `totals clamped to 6000 (got ${capped.calories})`);
console.assert(capped.protein_g === 2000, `macros clamped to 2000 (got ${capped.protein_g})`);

console.log("ai ok");