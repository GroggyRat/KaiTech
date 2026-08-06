"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = "/";
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/kaiworkforce-logo-transparent.png"
            alt="Kai Workforce"
            width={260}
            height={90}
            className="mx-auto h-14 w-auto"
            priority
          />
          <p className="text-sm text-[var(--foreground-muted)] mt-2">Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{error}</div>
          )}
          <div><label className="label">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@company.com" required /></div>
          <div><label className="label">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" required /></div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full">{isLoading ? "Signing in..." : "Sign In"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">Don't have an account? <Link href="/auth/register/" className="text-[var(--accent)] hover:underline">Contact your agency admin</Link></p>
      </div>
    </div>
  );
}
