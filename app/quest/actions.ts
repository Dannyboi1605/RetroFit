"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { caloriesFromMacros } from "@/lib/tdee";

export type QuestState = {
  error?: string;
};

export async function saveQuest(
  _prev: QuestState,
  formData: FormData
): Promise<QuestState> {
  const age = Number(formData.get("age"));
  const gender = String(formData.get("gender"));
  const heightCm = Number(formData.get("heightCm"));
  const weightKg = Number(formData.get("weightKg"));
  const activityLevel = String(formData.get("activityLevel"));
  const proteinG = Number(formData.get("proteinG"));
  const carbsG = Number(formData.get("carbsG"));
  const fatG = Number(formData.get("fatG"));
  const goal = String(formData.get("goal"));

  if (!(age >= 13 && age <= 100)) return { error: "Age must be 13-100." };
  if (!(heightCm >= 100 && heightCm <= 250)) return { error: "Height must be 100-250 cm." };
  if (!(weightKg >= 30 && weightKg <= 300)) return { error: "Weight must be 30-300 kg." };
  if (!(proteinG >= 0 && carbsG >= 0 && fatG >= 0))
    return { error: "Macros must be 0 or more grams." };
  if (!["cut", "maintain", "bulk"].includes(goal))
    return { error: "Pick a goal." };

  const dailyCalories = caloriesFromMacros(proteinG, carbsG, fatG);
  if (dailyCalories < 800 || dailyCalories > 6000)
    return { error: "Total calories must stay between 800-6000." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        has_completed_onboarding: true,
        age,
        gender,
        height_cm: heightCm,
        current_weight_kg: weightKg,
        activity_level: activityLevel,
        goal,
        daily_calorie_target: dailyCalories,
        protein_target_g: proteinG,
        carbs_target_g: carbsG,
        fat_target_g: fatG,
      },
      { onConflict: "id" }
    );

  if (error) return { error: error.message };

  const rawNext = String(formData.get("next") || "/");
  const next = /^\/[^/\\]/.test(rawNext) ? rawNext : "/";

  redirect(next);
}
