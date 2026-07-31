import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import QuestWizard from "@/components/quest-wizard";

export default async function QuestPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_completed_onboarding")
    .eq("id", user.id)
    .single();

  if (profile?.has_completed_onboarding) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[600px] flex-col justify-center gap-6 px-4">
      <div className="inline-block self-center border-2 border-outline bg-surface-container px-4 py-2">
        <h1 className="font-headline text-lg font-bold uppercase tracking-widest text-primary">
          Welcome to RetroFit.
        </h1>
      </div>
      <p className="text-center font-mono text-xs text-on-surface-variant">
        4-STEP QUEST: CALCULATE YOUR DAILY TARGETS
      </p>
      <QuestWizard />
    </main>
  );
}
