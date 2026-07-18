"use client";

/**
 * This file owns the payment detail query for the payment drill-down page.
 * What calls it: src/components/payments/PaymentDetailsCard.tsx and src/components/payments/RefundForm.tsx.
 * What it calls: src/hooks/apiClient.ts and GET /api/admin/payments/[paymentId].
 * One thing a junior engineer would likely get wrong when writing something similar: use a single generic query key so every payment detail page clobbers each other's cache entry.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "./apiClient";

export const paymentDetailQueryKey = (paymentId: string) => ["payments", paymentId] as const;

export type PaymentDetail = {
  id: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  providerPaymentId: string | null;
  lastKnownProvider: string | null;
  metadata: Record<string, unknown> | null;
  owner: {
    email: string;
    name: string;
  };
  createdBy: {
    email: string;
    name: string;
  };
  providerPayment: {
    externalPaymentId: string;
    status: string;
    decision: string;
  } | null;
  refunds: Array<{
    id: string;
    amountMinor: number;
    reason: string;
    status: string;
    providerRefundId: string | null;
    createdAt: string;
    createdBy: {
      email: string;
    };
  }>;
  events: Array<{
    id: string;
    type: string;
    actorLabel: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }>;
  webhookDeliveries: Array<{
    id: string;
    providerEventId: string;
    status: string;
    lastError: string | null;
    attempts: number;
    createdAt: string;
  }>;
  processedWebhookEvents: Array<{
    id: string;
    providerEventId: string;
    eventType: string;
    processingStatus: string;
    processingError: string | null;
    receivedAt: string;
  }>;
};

export function usePaymentDetail(paymentId: string) {
  return useQuery({
    queryKey: paymentDetailQueryKey(paymentId),
    queryFn: () => fetchJson<{ payment: PaymentDetail }>(`/api/admin/payments/${paymentId}`),
  });
}
