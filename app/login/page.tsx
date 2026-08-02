import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LoginForm from "@/components/login-form";

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-app flex-col justify-center px-4">
      <LoginForm />
    </main>
  );
}
