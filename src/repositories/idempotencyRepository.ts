/**
 * This file persists idempotency records used to replay safe responses and detect key misuse.
 * What calls it: src/services/paymentService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: only store the key, not the request fingerprint or response snapshot, which makes safe retries impossible to reason about.
 */
import { IdempotencyStatus, Prisma } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function findIdempotencyRecord(route: string, key: string, db: DatabaseClient = prisma) {
  return db.idempotencyRecord.findUnique({
    where: {
      route_key: {
        route,
        key,
      },
    },
  });
}

export function createIdempotencyRecord(
  input: {
    route: string;
    key: string;
    requestHash: string;
  },
  db: DatabaseClient = prisma,
) {
  return db.idempotencyRecord.create({
    data: {
      route: input.route,
      key: input.key,
      requestHash: input.requestHash,
      status: IdempotencyStatus.IN_PROGRESS,
      lockedAt: new Date(),
    },
  });
}

export function markIdempotencyCompleted(
  input: {
    id: string;
    resourceType: string;
    resourceId: string;
    responseStatusCode: number;
    responseBody: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.idempotencyRecord.update({
    where: { id: input.id },
    data: {
      status: IdempotencyStatus.COMPLETED,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      responseStatusCode: input.responseStatusCode,
      responseBody: input.responseBody,
      lockedAt: null,
    },
  });
}

export function markIdempotencyConflict(id: string, db: DatabaseClient = prisma) {
  return db.idempotencyRecord.update({
    where: { id },
    data: {
      status: IdempotencyStatus.CONFLICT,
      lockedAt: null,
    },
  });
}
