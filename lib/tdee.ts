export type ActivityLevel = "sedentary" | "light" | "moderate" | "heavy" | "athlete";
export type Goal = "cut" | "maintain" | "bulk";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
  athlete: 1.9,
};

const GOAL_ADJUSTMENT: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  bulk: 400,
};

export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number) {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

export function calculateTargets(input: {
  age: number;
  gender: "male" | "female";
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}) {
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    (input.gender === "male" ? 5 : -161);

  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
  const dailyCalories = Math.round(tdee + GOAL_ADJUSTMENT[input.goal]);

  const proteinG = Math.round(2 * input.weightKg);
  const remaining = dailyCalories - proteinG * 4;
  const carbsG = Math.round((remaining * 0.4) / 4);
  const fatG = Math.round((remaining * 0.25) / 9);

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), dailyCalories, proteinG, carbsG, fatG };
}
