import Link from "next/link";

import { getSessionForPage } from "../lib/auth/session";

const concepts = [
  "Durable idempotency records with request fingerprinting",
  "Asynchronous webhook processing with replay-safe handling",
  "Reconciliation runs that compare local vs provider state",
  "RBAC-protected admin tools for refunds and debugging",
];

export default async function HomePage() {
  const session = await getSessionForPage();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <section className="grid gap-8 rounded-3xl border border-white/70 bg-white/70 p-8 shadow-panel backdrop-blur md:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Payment Systems Lab</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink md:text-6xl">
            Build senior-level instincts for idempotent payment flows.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            This app simulates a Stripe-like payment backend with retries, provider webhooks, refund handling,
            reconciliation, and a staff debugging UI.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={session ? "/admin/payments" : "/login"}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {session ? "Open Admin Console" : "Sign In"}
            </Link>
            <a
              href="https://github.com/prisma/prisma"
              className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            >
              Stack Uses Prisma + Next.js
            </a>
          </div>
        </div>
        <div className="rounded-3xl bg-ink p-6 text-slate-100">
          <p className="text-sm uppercase tracking-[0.3em] text-teal-300">What You’ll Practice</p>
          <ul className="mt-5 space-y-4 text-sm leading-6 text-slate-200">
            {concepts.map((concept) => (
              <li key={concept} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                {concept}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-4 text-sm text-amber-100">
            Seeded demo users live in <code>prisma/seed.ts</code>. Default password: <code>password123</code>.
          </div>
        </div>
      </section>
    </main>
  );
}
