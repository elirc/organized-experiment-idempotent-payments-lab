/**
 * This file stores the append-only payment history used for debugging and audit review.
 * What calls it: payment, refund, webhook, and reconciliation services.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: treat operational history as optional, then discover you cannot reconstruct what happened during a failed charge.
 */
import { PaymentEventType, Prisma } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createPaymentEvent(
  input: {
    paymentId: string;
    actorLabel: string;
    type: PaymentEventType;
    actorUserId?: string;
    payload?: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.paymentEvent.create({
    data: input,
  });
}
