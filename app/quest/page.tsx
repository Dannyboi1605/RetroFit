import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import QuestWizard, { type QuestInitial } from "@/components/quest-wizard";

export default async function QuestPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { retake } = await searchParams;
  const isRetake = retake === "1";

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "has_completed_onboarding, age, gender, height_cm, current_weight_kg, activity_level, protein_target_g, carbs_target_g, fat_target_g, goal"
    )
    .eq("id", user.id)
    .single();

  if (!isRetake && profile?.has_completed_onboarding) redirect("/");

  const initial: QuestInitial | undefined =
    isRetake && profile
      ? {
          age: String(profile.age),
          gender: (profile.gender ?? "") as "male" | "female" | "",
          heightCm: String(profile.height_cm),
          weightKg: String(profile.current_weight_kg),
          activityLevel: profile.activity_level ?? "",
          proteinG: String(profile.protein_target_g),
          carbsG: String(profile.carbs_target_g),
          fatG: String(profile.fat_target_g),
          goal: profile.goal ?? "",
        }
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-app flex-col justify-center gap-6 px-4">
      <div className="inline-block self-center border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          {isRetake ? "Recalculate Your Targets." : "Welcome to RetroFit."}
        </h1>
      </div>
      <p className="text-center font-mono text-xs text-on-surface-variant">
        {isRetake ? "RETAKE THE QUEST — UPDATES YOUR DAILY TARGETS" : "5-STEP QUEST: CALCULATE YOUR DAILY TARGETS"}
      </p>
      <QuestWizard initial={initial} />
    </main>
  );
}