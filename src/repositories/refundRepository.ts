/**
 * This file handles refund persistence and aggregation for refund safety checks.
 * What calls it: src/services/refundService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: forget to sum prior successful refunds before allowing another one.
 */
import { RefundStatus } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createRefund(
  input: {
    paymentId: string;
    amountMinor: number;
    reason: string;
    createdByUserId: string;
  },
  db: DatabaseClient = prisma,
) {
  return db.refund.create({
    data: {
      ...input,
      status: RefundStatus.PENDING,
    },
  });
}

export async function sumSuccessfulRefundsForPayment(paymentId: string, db: DatabaseClient = prisma) {
  const aggregate = await db.refund.aggregate({
    where: {
      paymentId,
      status: RefundStatus.SUCCEEDED,
    },
    _sum: {
      amountMinor: true,
    },
  });

  return aggregate._sum.amountMinor ?? 0;
}

export function transitionRefundStatus(
  refundId: string,
  status: RefundStatus,
  providerRefundId?: string,
  db: DatabaseClient = prisma,
) {
  return db.refund.update({
    where: { id: refundId },
    data: {
      status,
      providerRefundId,
    },
  });
}
