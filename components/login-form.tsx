"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      setMessage("Account created — check your email to confirm.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    setError(null);
    setMessage(null);
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Password reset link sent — check your inbox.");
  }

  return (
    <form onSubmit={handleSubmit} className="snes-window flex flex-col gap-4 p-6">
      <h1 className="font-headline text-2xl font-extrabold uppercase tracking-widest text-primary">
        {mode === "signup" ? "Create Account" : "RetroFit"}
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
      {error && (
        <p role="alert" className="font-mono text-xs text-error">
          {error}
        </p>
      )}
      {message && <p className="font-mono text-xs text-tertiary">{message}</p>}
      <button type="submit" className="pixel-btn w-full">
        {mode === "signup" ? "Create Account" : "Start Game"}
      </button>
      <button
        type="button"
        onClick={handleForgotPassword}
        className="font-mono text-xs text-on-surface-variant hover:text-primary"
      >
        Forgot password?
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="font-mono text-xs text-on-surface-variant hover:text-primary"
      >
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
