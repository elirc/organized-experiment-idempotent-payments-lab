/**
 * This file contains the authoritative payment queries used by operational services and the admin UI.
 * What calls it: src/services/paymentService.ts, src/services/refundService.ts, src/services/webhookService.ts, and src/services/reconciliationService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: return under-fetched records and then trigger N+1 follow-up queries from the service layer.
 */
import { PaymentStatus, ProviderPaymentStatus, Prisma } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

const paymentDetailInclude = {
  owner: true,
  createdBy: true,
  providerPayment: true,
  refunds: {
    orderBy: { createdAt: "desc" },
    include: { createdBy: true },
  },
  events: {
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
  },
  webhookDeliveries: {
    orderBy: { createdAt: "desc" },
  },
  processedWebhookEvents: {
    orderBy: { receivedAt: "desc" },
  },
} satisfies Prisma.PaymentInclude;

export function createPayment(
  input: {
    reference: string;
    amountMinor: number;
    currency: string;
    ownerUserId: string;
    createdByUserId: string;
    metadata: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.payment.create({
    data: {
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      ownerUserId: input.ownerUserId,
      createdByUserId: input.createdByUserId,
      status: PaymentStatus.PENDING,
      metadata: input.metadata,
    },
  });
}

export function findPaymentById(paymentId: string, db: DatabaseClient = prisma) {
  return db.payment.findUnique({
    where: { id: paymentId },
    include: paymentDetailInclude,
  });
}

export function listPayments(
  input: {
    ownerUserId?: string;
    statuses?: PaymentStatus[];
  } = {},
  db: DatabaseClient = prisma,
) {
  return db.payment.findMany({
    where: {
      ownerUserId: input.ownerUserId,
      status: input.statuses ? { in: input.statuses } : undefined,
    },
    include: {
      owner: true,
      createdBy: true,
      providerPayment: true,
      refunds: true,
      webhookDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function updatePaymentProviderView(
  input: {
    paymentId: string;
    providerPaymentId: string;
    providerStatus: ProviderPaymentStatus;
  },
  db: DatabaseClient = prisma,
) {
  return db.payment.update({
    where: { id: input.paymentId },
    data: {
      providerPaymentId: input.providerPaymentId,
      lastKnownProvider: input.providerStatus,
    },
  });
}

export function transitionPaymentStatus(
  input: {
    paymentId: string;
    nextStatus: PaymentStatus;
    providerStatus?: ProviderPaymentStatus;
    failureCode?: string | null;
    failureMessage?: string | null;
  },
  db: DatabaseClient = prisma,
) {
  return db.payment.update({
    where: { id: input.paymentId },
    data: {
      status: input.nextStatus,
      lastKnownProvider: input.providerStatus,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
    },
  });
}

export function listPaymentsForReconciliation(db: DatabaseClient = prisma) {
  return db.payment.findMany({
    include: {
      providerPayment: true,
      webhookDeliveries: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
