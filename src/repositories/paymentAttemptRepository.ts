/**
 * This file records each attempt to talk to the simulated provider.
 * What calls it: src/services/providerSimulatorService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: only store the last provider call and lose the retry/debugging history you need during incidents.
 */
import { ProviderDecision, Prisma } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createPaymentAttempt(
  input: {
    paymentId: string;
    providerRequestId: string;
    decision: ProviderDecision;
    requestPayload: Prisma.InputJsonValue;
    responsePayload?: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.paymentAttempt.create({
    data: input,
  });
}
