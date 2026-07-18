import { PaymentCreateForm } from "../../../components/payments/PaymentCreateForm";
import { PaymentsTable } from "../../../components/payments/PaymentsTable";
import { requireStaffPaymentsPage } from "../../../lib/auth/guards";

export default async function AdminPaymentsPage() {
  const session = await requireStaffPaymentsPage();

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
          <h2 className="text-xl font-semibold text-ink">Create Payment</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Payment creation always starts in <code>PENDING</code>. Final provider truth arrives later through a
            webhook or gets surfaced by reconciliation if something goes wrong.
          </p>
          {session.role === "SUPPORT" ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Support can inspect payments but cannot create or mutate them.
            </div>
          ) : (
            <div className="mt-5">
              <PaymentCreateForm />
            </div>
          )}
        </div>
      </div>
      <PaymentsTable />
    </section>
  );
}
