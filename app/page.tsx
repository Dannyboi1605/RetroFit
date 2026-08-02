import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import HomeDashboard from "@/components/home-dashboard";

export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "has_completed_onboarding, daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal"
    )
    .eq("id", user.id)
    .single();

  if (!profile?.has_completed_onboarding) redirect("/quest");

  return <HomeDashboard profile={profile} />;
}
