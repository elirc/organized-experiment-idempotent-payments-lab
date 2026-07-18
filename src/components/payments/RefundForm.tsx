"use client";

/**
 * This file is the operator control for issuing a refund against a succeeded payment.
 * What calls it: src/app/admin/payments/[paymentId]/page.tsx.
 * What it calls: src/hooks/usePaymentActions.ts and src/hooks/usePaymentDetail.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: trust the UI's disabled state alone and forget the server still needs to reject invalid refund attempts.
 */
import { FormEvent, useState } from "react";

import { useRefundPayment } from "../../hooks/usePaymentActions";
import { usePaymentDetail } from "../../hooks/usePaymentDetail";

export function RefundForm({ paymentId }: { paymentId: string }) {
  const { data } = usePaymentDetail(paymentId);
  const refundMutation = useRefundPayment(paymentId);
  const [amountMinor, setAmountMinor] = useState(500);
  const [reason, setReason] = useState("Customer requested a partial refund.");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refundMutation.mutateAsync({ amountMinor, reason });
  }

  const payment = data?.payment;
  const refundDisabled = payment?.status !== "SUCCEEDED";

  return (
    <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <h2 className="text-xl font-semibold text-ink">Refund Payment</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Refunds are only accepted once the local payment status is <code>SUCCEEDED</code>. Partial refunds keep the
        payment in <code>SUCCEEDED</code>; full refunds transition it to <code>REFUNDED</code>.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Amount (minor units)</span>
          <input
            type="number"
            min={1}
            value={amountMinor}
            onChange={(event) => setAmountMinor(Number(event.target.value))}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Reason</span>
          <textarea
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
          />
        </label>
        {refundMutation.data ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Refund {refundMutation.data.refundId} succeeded.
          </div>
        ) : null}
        {refundMutation.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {refundMutation.error.message}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={refundDisabled || refundMutation.isPending}
          className="w-full rounded-2xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refundMutation.isPending ? "Submitting Refund..." : refundDisabled ? "Payment Not Refundable Yet" : "Issue Refund"}
        </button>
      </form>
    </section>
  );
}
