import Link from "next/link";

import { requireStaffPaymentsPage } from "../../lib/auth/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffPaymentsPage();

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Operations Console</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Payment Debugging Workspace</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-2 font-medium">
              {session.name} · {session.role}
            </span>
            <Link href="/admin/payments" className="rounded-full border border-slate-300 px-4 py-2 font-medium">
              Payments
            </Link>
            <Link href="/admin/reconciliation" className="rounded-full border border-slate-300 px-4 py-2 font-medium">
              Reconciliation
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-full bg-ink px-4 py-2 font-medium text-white">Log Out</button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
