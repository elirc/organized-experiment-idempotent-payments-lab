"use client";

/**
 * This file owns the payments list query used by the admin table.
 * What calls it: src/components/payments/PaymentsTable.tsx.
 * What it calls: src/hooks/apiClient.ts and GET /api/admin/payments.
 * One thing a junior engineer would likely get wrong when writing something similar: embed the fetch directly in the component and lose cache invalidation control.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "./apiClient";

export const paymentListQueryKey = ["payments"] as const;

export type PaymentListItem = {
  id: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
  lastKnownProvider: string | null;
  createdAt: string;
  owner: {
    email: string;
    name: string;
  };
  createdBy: {
    email: string;
  };
  providerPayment: {
    externalPaymentId: string;
    status: string;
  } | null;
  refunds: Array<{ id: string; amountMinor: number; status: string }>;
  webhookDeliveries: Array<{ id: string; status: string; createdAt: string }>;
};

export function usePayments() {
  return useQuery({
    queryKey: paymentListQueryKey,
    queryFn: () => fetchJson<{ payments: PaymentListItem[] }>("/api/admin/payments"),
  });
}
