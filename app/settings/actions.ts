"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { caloriesFromMacros } from "@/lib/tdee";

export type SettingsState = {
  error?: string;
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
  redirect("/settings");
}
