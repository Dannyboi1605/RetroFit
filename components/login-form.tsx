"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="snes-window flex flex-col gap-4 p-6">
      <h1 className="font-headline text-2xl font-extrabold uppercase tracking-widest text-primary">
        RetroFit
      </h1>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
        />
      </label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase text-on-surface-variant">
        Password
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-2 border-outline-variant bg-surface p-2 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
        />
      </label>
      {error && <p className="font-mono text-xs text-error">{error}</p>}
      <button type="submit" className="pixel-btn w-full">
        Start Game
      </button>
    </form>
  );
}
