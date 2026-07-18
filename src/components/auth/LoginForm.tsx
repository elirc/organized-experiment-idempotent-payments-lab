"use client";

import { FormEvent, useState } from "react";

import { fetchJson } from "../../hooks/apiClient";

export function LoginForm() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await fetchJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      window.location.href = "/admin/payments";
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-ink">Sign In</h2>
      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
          />
        </label>
      </div>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-2xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing In..." : "Sign In"}
      </button>
    </form>
  );
}
