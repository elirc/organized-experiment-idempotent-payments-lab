"use client";

/**
 * This file is the admin-facing form for creating a payment request with a chosen failure mode.
 * What calls it: src/app/admin/payments/page.tsx.
 * What it calls: src/hooks/usePaymentActions.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: hard-code only the happy path and make the debugging UI useless for failure-mode learning.
 */
import { FormEvent, useState } from "react";

import { useCreatePayment } from "../../hooks/usePaymentActions";

const simulationModes = [
  {
    value: "SUCCEED",
    label: "Succeed",
    description: "Provider succeeds and a webhook is queued.",
  },
  {
    value: "FAIL",
    label: "Fail",
    description: "Provider declines and a failure webhook is queued.",
  },
  {
    value: "PARTIAL_SUCCESS",
    label: "Partial Failure",
    description: "Provider succeeds but no webhook delivery is queued.",
  },
  {
    value: "NETWORK_UNKNOWN",
    label: "Network Unknown",
    description: "Provider succeeds but transport certainty is ambiguous.",
  },
] as const;

export function PaymentCreateForm() {
  const createPayment = useCreatePayment();
  const [amountMinor, setAmountMinor] = useState(1250);
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("Demo course purchase");
  const [simulationMode, setSimulationMode] = useState<(typeof simulationModes)[number]["value"]>("SUCCEED");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createPayment.mutateAsync({
      amountMinor,
      currency,
      description,
      simulationMode,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
        <span className="text-sm font-medium text-slate-700">Currency</span>
        <input
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 uppercase outline-none transition focus:border-accent"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Simulation mode</span>
        <select
          value={simulationMode}
          onChange={(event) => setSimulationMode(event.target.value as typeof simulationMode)}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
        >
          {simulationModes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        {simulationModes.find((mode) => mode.value === simulationMode)?.description}
      </div>
      {createPayment.data ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Created {createPayment.data.reference} ({createPayment.data.paymentId})
          {createPayment.data.replayed ? " via idempotent replay." : "."}
        </div>
      ) : null}
      {createPayment.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {createPayment.error.message}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={createPayment.isPending}
        className="w-full rounded-2xl bg-accent px-4 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {createPayment.isPending ? "Creating Payment..." : "Submit Payment Request"}
      </button>
    </form>
  );
}
