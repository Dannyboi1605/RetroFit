import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import SyncStatus from "@/components/sync-status";
import TargetsForm from "@/components/targets-form";
import GoalPicker from "@/components/goal-picker";
import ActivityPicker from "@/components/activity-picker";
import { logout } from "./actions";
import type { ActivityLevel, Goal } from "@/lib/tdee";
export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal, activity_level"
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/quest");

  return (
    <AppShell activeTab="tdee">
      <div className="mx-auto max-w-5xl">
        <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
          <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
            Settings
          </h1>
        </div>

        <div className="flex flex-col gap-6">
          {/* Top row: Goal + Activity pickers */}
          <div className="grid grid-cols-2 gap-6">
            <div className="snes-window flex flex-col gap-2 p-4">
              <GoalPicker goal={profile.goal as Goal} />
            </div>
            <div className="snes-window flex flex-col gap-2 p-4">
              <ActivityPicker activityLevel={profile.activity_level as ActivityLevel} />
            </div>
          </div>

          {/* Middle row: Daily Targets */}
          <div className="flex flex-col gap-6">
            <TargetsForm profile={profile} />
            <a href="/quest?retake=1" className="pixel-btn-secondary w-full text-center">
              Retake Quest — Recalculate Your Targets
            </a>
          </div>

          {/* Bottom row: Sync + Logout */}
          <div className="grid grid-cols-2 gap-6">
            <SyncStatus />
            <div className="snes-window flex items-center justify-center p-4">
              <form action={logout}>
                <button type="submit" className="pixel-btn-danger">
                  Log Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
