"use client";

/**
 * This file renders the detailed audit/debug view for a single payment.
 * What calls it: src/app/admin/payments/[paymentId]/page.tsx.
 * What it calls: src/hooks/usePaymentDetail.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: show the current status without also surfacing the event trail and webhook history that explain how it got there.
 */
import { usePaymentDetail } from "../../hooks/usePaymentDetail";

function renderPayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  return (
    <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-200">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

export function PaymentDetailsCard({ paymentId }: { paymentId: string }) {
  const { data, isLoading, error } = usePaymentDetail(paymentId);

  if (isLoading) {
    return <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel">Loading payment...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel text-danger">
        {error?.message ?? "Payment not found."}
      </div>
    );
  }

  const { payment } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-accent">Payment Detail</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{payment.reference}</h2>
            <p className="mt-2 text-sm text-slate-600">
              Owner: {payment.owner.email} · Created by {payment.createdBy.email}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Local {payment.status} / Provider {payment.providerPayment?.status ?? "UNKNOWN"}
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Identifiers</div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>Payment ID: {payment.id}</div>
              <div>Provider ID: {payment.providerPaymentId ?? "Not assigned"}</div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Failure Signals</div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>Code: {payment.failureCode ?? "None"}</div>
              <div>Message: {payment.failureMessage ?? "None"}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
        <h3 className="text-lg font-semibold text-ink">Refunds</h3>
        <div className="mt-4 space-y-3">
          {payment.refunds.length === 0 ? <p className="text-sm text-slate-500">No refunds yet.</p> : null}
          {payment.refunds.map((refund) => (
            <div key={refund.id} className="rounded-2xl border border-slate-200 px-4 py-3">
              <div className="font-medium text-slate-800">
                {refund.amountMinor / 100} {payment.currency} · {refund.status}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {refund.reason} · {refund.createdBy.email}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
        <h3 className="text-lg font-semibold text-ink">Webhook Trail</h3>
        <div className="mt-4 space-y-3">
          {payment.webhookDeliveries.length === 0 ? <p className="text-sm text-slate-500">No webhook delivery was queued.</p> : null}
          {payment.webhookDeliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-2xl border border-slate-200 px-4 py-3">
              <div className="font-medium text-slate-800">
                {delivery.providerEventId} · {delivery.status}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Attempts: {delivery.attempts} · Last error: {delivery.lastError ?? "None"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
        <h3 className="text-lg font-semibold text-ink">Payment Events</h3>
        <div className="mt-4 space-y-4">
          {payment.events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-slate-800">{event.type}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {new Date(event.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="mt-1 text-sm text-slate-600">Actor: {event.actorLabel}</div>
              {renderPayload(event.payload)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
