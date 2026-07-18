"use client";

/**
 * This file is the operational console for draining webhooks and reviewing reconciliation issues.
 * What calls it: src/app/admin/reconciliation/page.tsx.
 * What it calls: src/hooks/useReconciliation.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: build reconciliation as a static report and omit the operator actions that make the system recoverable.
 */
import Link from "next/link";
import { useState } from "react";

import {
  useDeliverWebhooks,
  useReconciliationIssues,
  useRunReconciliation,
} from "../../hooks/useReconciliation";

export function ReconciliationPanel() {
  const issuesQuery = useReconciliationIssues();
  const deliverMutation = useDeliverWebhooks();
  const reconciliationMutation = useRunReconciliation();
  const [limit, setLimit] = useState(10);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
          <h2 className="text-xl font-semibold text-ink">Drain Pending Webhooks</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This simulates the provider eventually calling our webhook endpoint. It is the fastest way to move local
            state from <code>PENDING</code> to the provider’s terminal result.
          </p>
          <div className="mt-5 flex gap-3">
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="w-24 rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-accent"
            />
            <button
              onClick={() => deliverMutation.mutate(limit)}
              disabled={deliverMutation.isPending}
              className="rounded-2xl bg-accent px-4 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              {deliverMutation.isPending ? "Delivering..." : "Deliver"}
            </button>
          </div>
          {deliverMutation.data ? (
            <p className="mt-4 text-sm text-emerald-900">
              Delivered {deliverMutation.data.delivered}, failed {deliverMutation.data.failed}.
            </p>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
          <h2 className="text-xl font-semibold text-ink">Run Reconciliation</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Reconciliation compares the provider mirror table against local payments and flags mismatches or missing
            webhook scheduling.
          </p>
          <button
            onClick={() => reconciliationMutation.mutate()}
            disabled={reconciliationMutation.isPending}
            className="mt-5 rounded-2xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {reconciliationMutation.isPending ? "Reconciling..." : "Run Reconciliation"}
          </button>
          {reconciliationMutation.data ? (
            <p className="mt-4 text-sm text-slate-700">
              Run {reconciliationMutation.data.runId} found {reconciliationMutation.data.issueCount} issue(s).
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
        <h2 className="text-xl font-semibold text-ink">Latest Issues</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These rows exist to teach the difference between “the payment row exists” and “the payment system is actually
          internally consistent.”
        </p>
        <div className="mt-6 space-y-3">
          {issuesQuery.isLoading ? <p className="text-sm text-slate-500">Loading issues...</p> : null}
          {issuesQuery.error ? <p className="text-sm text-danger">{issuesQuery.error.message}</p> : null}
          {issuesQuery.data?.issues.length === 0 ? <p className="text-sm text-slate-500">No reconciliation issues yet.</p> : null}
          {issuesQuery.data?.issues.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink">{issue.type}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Local {issue.localStatus ?? "NONE"} / Provider {issue.providerStatus ?? "NONE"}
                  </div>
                </div>
                {issue.payment ? (
                  <Link href={`/admin/payments/${issue.payment.id}`} className="text-sm font-medium text-accent underline underline-offset-4">
                    {issue.payment.reference}
                  </Link>
                ) : (
                  <span className="text-sm text-warning">No local payment row</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
