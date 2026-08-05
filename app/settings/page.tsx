import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import SyncStatus from "@/components/sync-status";
import TargetsForm from "@/components/targets-form";
import GoalPicker from "@/components/goal-picker";
import { logout } from "./actions";
import type { Goal } from "@/lib/tdee";
export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal"
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/quest");

  return (
    <AppShell activeTab="tdee">
      <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Settings
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <GoalPicker goal={profile.goal as Goal} />

        <TargetsForm profile={profile} />
      </div>

      <a
        href="/quest?retake=1"
        className="pixel-btn w-full text-center"
      >
        Retake Quest — Recalculate Your Targets
      </a>

      <SyncStatus />

      <form action={logout}>
        <button type="submit" className="pixel-btn w-full bg-error text-on-error">
          Log Out
        </button>
      </form>
    </AppShell>
  );
}
