/**
 * This file persists the simulated provider's view of payments so reconciliation has an external truth to compare against.
 * What calls it: src/services/providerSimulatorService.ts, src/services/webhookService.ts, and src/services/reconciliationService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: overwrite provider state directly onto the local payment row and lose the ability to compare local vs external truth.
 */
import { ProviderDecision, ProviderPaymentStatus, Prisma } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createProviderPayment(
  input: {
    paymentId: string;
    externalPaymentId: string;
    amountMinor: number;
    currency: string;
    status: ProviderPaymentStatus;
    decision: ProviderDecision;
    latestPayload: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.providerPayment.create({
    data: input,
  });
}

export function findProviderPaymentByPaymentId(paymentId: string, db: DatabaseClient = prisma) {
  return db.providerPayment.findUnique({
    where: { paymentId },
  });
}

export function findProviderPaymentByExternalId(externalPaymentId: string, db: DatabaseClient = prisma) {
  return db.providerPayment.findUnique({
    where: { externalPaymentId },
  });
}

export function updateProviderPaymentStatus(
  input: {
    paymentId: string;
    status: ProviderPaymentStatus;
    latestPayload: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.providerPayment.update({
    where: { paymentId: input.paymentId },
    data: {
      status: input.status,
      latestPayload: input.latestPayload,
    },
  });
}

export function listProviderPayments(db: DatabaseClient = prisma) {
  return db.providerPayment.findMany({
    orderBy: { createdAt: "desc" },
  });
}
