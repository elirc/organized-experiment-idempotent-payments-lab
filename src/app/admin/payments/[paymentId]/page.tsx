import Link from "next/link";

import { PaymentDetailsCard } from "../../../../components/payments/PaymentDetailsCard";
import { RefundForm } from "../../../../components/payments/RefundForm";
import { requireStaffPaymentsPage } from "../../../../lib/auth/guards";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await requireStaffPaymentsPage();
  const { paymentId } = await params;

  return (
    <section className="space-y-6">
      <Link href="/admin/payments" className="inline-flex text-sm font-medium text-slate-600 underline underline-offset-4">
        Back to payments
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <PaymentDetailsCard paymentId={paymentId} />
        {session.role === "SUPPORT" ? (
          <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
            <h2 className="text-xl font-semibold text-ink">Refund Controls</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Support can review history but cannot trigger money-moving operations.
            </p>
          </div>
        ) : (
          <RefundForm paymentId={paymentId} />
        )}
      </div>
    </section>
  );
}
