"use client";

/**
 * This file renders the operations-facing payments list and lightweight filtering controls.
 * What calls it: src/app/admin/payments/page.tsx.
 * What it calls: src/hooks/usePayments.ts and Next.js Link for drill-down navigation.
 * One thing a junior engineer would likely get wrong when writing something similar: fetch far more than the UI needs and then perform every expensive transform on each keystroke.
 */
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { usePayments } from "../../hooks/usePayments";

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function PaymentsTable() {
  const { data, isLoading, error } = usePayments();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const filteredPayments = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    if (!needle) {
      return data?.payments ?? [];
    }

    return (data?.payments ?? []).filter((payment) => {
      return [payment.reference, payment.owner.email, payment.createdBy.email, payment.status]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.payments, deferredSearch]);

  return (
    <section className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Payment Timeline</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Search by reference, owner email, actor email, or status to study how requests evolved.
          </p>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search payments"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent md:max-w-xs"
        />
      </div>

      {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading payments...</p> : null}
      {error ? <p className="mt-6 text-sm text-danger">{error.message}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-3 pr-4 font-medium">Reference</th>
              <th className="py-3 pr-4 font-medium">Owner</th>
              <th className="py-3 pr-4 font-medium">Amount</th>
              <th className="py-3 pr-4 font-medium">Local</th>
              <th className="py-3 pr-4 font-medium">Provider</th>
              <th className="py-3 pr-4 font-medium">Webhook</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPayments.map((payment) => (
              <tr key={payment.id} className="align-top text-slate-700">
                <td className="py-4 pr-4">
                  <Link href={`/admin/payments/${payment.id}`} className="font-semibold text-ink underline underline-offset-4">
                    {payment.reference}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString()}</div>
                </td>
                <td className="py-4 pr-4">
                  <div>{payment.owner.email}</div>
                  <div className="mt-1 text-xs text-slate-500">Created by {payment.createdBy.email}</div>
                </td>
                <td className="py-4 pr-4">{formatMoney(payment.amountMinor, payment.currency)}</td>
                <td className="py-4 pr-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{payment.status}</span>
                </td>
                <td className="py-4 pr-4">
                  {payment.providerPayment ? (
                    <div>
                      <div className="font-medium">{payment.providerPayment.status}</div>
                      <div className="mt-1 text-xs text-slate-500">{payment.providerPayment.externalPaymentId}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400">No provider record</span>
                  )}
                </td>
                <td className="py-4 pr-4">
                  {payment.webhookDeliveries[0] ? (
                    <div>
                      <div className="font-medium">{payment.webhookDeliveries[0].status}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(payment.webhookDeliveries[0].createdAt).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <span className="text-warning">Not queued</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
