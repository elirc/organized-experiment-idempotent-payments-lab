"use client";

/**
 * This file owns the operational mutations and queries for webhook delivery and reconciliation.
 * What calls it: src/components/admin/ReconciliationPanel.tsx.
 * What it calls: React Query, src/hooks/apiClient.ts, and payment query keys.
 * One thing a junior engineer would likely get wrong when writing something similar: run operational actions without refreshing the list views they affect.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "./apiClient";
import { paymentListQueryKey } from "./usePayments";

const reconciliationIssuesQueryKey = ["reconciliation", "issues"] as const;

export type ReconciliationIssue = {
  id: string;
  type: string;
  status: string;
  localStatus: string | null;
  providerStatus: string | null;
  createdAt: string;
  providerPaymentId: string | null;
  payment: {
    id: string;
    reference: string;
    owner: {
      email: string;
    };
  } | null;
  run: {
    id: string;
    startedAt: string;
  };
};

export function useReconciliationIssues() {
  return useQuery({
    queryKey: reconciliationIssuesQueryKey,
    queryFn: () => fetchJson<{ issues: ReconciliationIssue[] }>("/api/admin/reconciliation/issues"),
  });
}

export function useDeliverWebhooks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limit: number) =>
      fetchJson<{ delivered: number; failed: number }>("/api/admin/webhooks/deliver", {
        method: "POST",
        body: JSON.stringify({ limit }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentListQueryKey }),
        queryClient.invalidateQueries({ queryKey: reconciliationIssuesQueryKey }),
      ]);
    },
  });
}

export function useRunReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson<{ runId: string; issueCount: number }>("/api/admin/reconciliation/run", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentListQueryKey }),
        queryClient.invalidateQueries({ queryKey: reconciliationIssuesQueryKey }),
      ]);
    },
  });
}
