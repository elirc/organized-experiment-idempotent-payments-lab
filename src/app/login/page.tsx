import { LoginForm } from "../../components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
      <div className="grid w-full gap-8 rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-panel backdrop-blur md:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Demo Access</p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">Sign in to inspect and operate payment flows.</h1>
          <p className="max-w-xl text-base leading-7 text-slate-600">
            Use one of the seeded demo users from <code>prisma/seed.ts</code>. Support can inspect payments, while
            Ops and Admin can also create refunds, deliver webhooks, and run reconciliation.
          </p>
          <div className="grid gap-3 rounded-3xl bg-slate-950 p-5 text-sm text-slate-200">
            <div><strong>Customer:</strong> customer@example.com</div>
            <div><strong>Support:</strong> support@example.com</div>
            <div><strong>Ops:</strong> ops@example.com</div>
            <div><strong>Admin:</strong> admin@example.com</div>
            <div><strong>Password:</strong> password123</div>
          </div>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
