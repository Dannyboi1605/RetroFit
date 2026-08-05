"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import {
  caloriesFromMacros,
  calculateTargets,
  type ActivityLevel,
  type Goal,
} from "@/lib/tdee";

export type SettingsState = {
  error?: string;
  success?: boolean;
};

export async function updateTargets(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const proteinG = Number(formData.get("proteinG"));
  const carbsG = Number(formData.get("carbsG"));
  const fatG = Number(formData.get("fatG"));

  if (!(proteinG >= 0 && carbsG >= 0 && fatG >= 0))
    return { error: "Macros must be 0 or more grams." };

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
    .update({
      daily_calorie_target: dailyCalories,
      protein_target_g: proteinG,
      carbs_target_g: carbsG,
      fat_target_g: fatG,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateActivityLevel(
  activityLevel: string
): Promise<{ error?: string }> {
  if (
    !["sedentary", "light", "moderate", "heavy", "athlete"].includes(activityLevel)
  )
    return { error: "Pick an activity level." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("age, gender, height_cm, current_weight_kg, goal")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.age == null ||
    !profile.gender ||
    profile.height_cm == null ||
    profile.current_weight_kg == null ||
    !profile.goal
  )
    return { error: "Onboarding data missing — redo the quest first." };

  const targets = calculateTargets({
    age: profile.age,
    gender: profile.gender,
    heightCm: Number(profile.height_cm),
    weightKg: Number(profile.current_weight_kg),
    activityLevel: activityLevel as ActivityLevel,
    goal: profile.goal as Goal,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      activity_level: activityLevel,
      daily_calorie_target: targets.dailyCalories,
      protein_target_g: targets.proteinG,
      carbs_target_g: targets.carbsG,
      fat_target_g: targets.fatG,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  return {};
}

export async function updateGoal(goal: string): Promise<{ error?: string }> {
  if (!["cut", "maintain", "bulk"].includes(goal))
    return { error: "Pick a goal." };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("age, gender, height_cm, current_weight_kg, activity_level")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.age == null ||
    !profile.gender ||
    profile.height_cm == null ||
    profile.current_weight_kg == null ||
    !profile.activity_level
  )
    return { error: "Onboarding data missing — redo the quest first." };

  const targets = calculateTargets({
    age: profile.age,
    gender: profile.gender,
    heightCm: Number(profile.height_cm),
    weightKg: Number(profile.current_weight_kg),
    activityLevel: profile.activity_level,
    goal: goal as Goal,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      goal,
      daily_calorie_target: targets.dailyCalories,
      protein_target_g: targets.proteinG,
      carbs_target_g: targets.carbsG,
      fat_target_g: targets.fatG,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/settings");
  return {};
}
