"use client";

/**
 * This file groups the payment-related mutations so create/refund flows share invalidation logic.
 * What calls it: payment UI components under src/components/payments/**.
 * What it calls: React Query mutation APIs, src/hooks/apiClient.ts, and payment query keys.
 * One thing a junior engineer would likely get wrong when writing something similar: invalidate nothing after a mutation and trust the UI to “eventually refresh.”
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "./apiClient";
import { paymentDetailQueryKey } from "./usePaymentDetail";
import { paymentListQueryKey } from "./usePayments";

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      amountMinor: number;
      currency: string;
      description: string;
      simulationMode: "SUCCEED" | "FAIL" | "PARTIAL_SUCCESS" | "NETWORK_UNKNOWN";
    }) =>
      fetchJson<{
        paymentId: string;
        reference: string;
        replayed: boolean;
      }>("/api/payments", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentListQueryKey });
    },
  });
}

export function useRefundPayment(paymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amountMinor: number; reason: string }) =>
      fetchJson<{ refundId: string; refundStatus: string }>(`/api/payments/${paymentId}/refund`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentListQueryKey }),
        queryClient.invalidateQueries({ queryKey: paymentDetailQueryKey(paymentId) }),
      ]);
    },
  });
}
