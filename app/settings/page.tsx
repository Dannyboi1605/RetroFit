import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import SyncStatus from "@/components/sync-status";
import { updateTargets, type SettingsState } from "./actions";
export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/quest");

  const saveTargets = async (formData: FormData) => {
    "use server";
    await updateTargets({} as SettingsState, formData);
  };

  return (
    <AppShell activeTab="tdee">
      <div className="inline-block self-start border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Settings
        </h1>
      </div>

      <form
        action={saveTargets}
        className="snes-window flex flex-col gap-4 p-4"
      >
        <h2 className="flex items-center gap-2 border-b-2 border-surface-variant pb-2 font-headline text-lg font-bold uppercase tracking-widest text-tertiary">
          <span className="material-symbols-outlined text-xl">track_changes</span>
          Daily Targets
        </h2>
        <p className="font-mono text-[11px] leading-relaxed text-on-surface-variant">
          Calories are always derived from macros (P×4 + C×4 + F×9). Goal: {profile.goal}.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Protein (g)", name: "proteinG", value: profile.protein_target_g, color: "text-error" },
            { label: "Carbs (g)", name: "carbsG", value: profile.carbs_target_g, color: "text-tertiary" },
            { label: "Fat (g)", name: "fatG", value: profile.fat_target_g, color: "text-on-surface" },
          ].map((f) => (
            <label
              key={f.name}
              className={`flex flex-col gap-1 font-mono text-[10px] uppercase ${f.color}`}
            >
              {f.label}
              <input
                type="number"
                min={0}
                name={f.name}
                defaultValue={f.value}
                className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
          Resulting daily calories
          <div className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm font-bold text-primary">
            {profile.daily_calorie_target.toLocaleString()} kcal
          </div>
        </div>
        <button className="pixel-btn w-full" type="submit">
          <span className="material-symbols-outlined text-base">save</span>
          Save Targets
        </button>
      </form>

      <SyncStatus />
    </AppShell>
  );
}
