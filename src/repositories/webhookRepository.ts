/**
 * This file owns both outbound webhook delivery tracking and inbound webhook event persistence.
 * What calls it: src/services/providerSimulatorService.ts and src/services/webhookService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: only process webhook payloads in-memory and lose the retry/error trail when a handler fails.
 */
import { Prisma, WebhookDeliveryStatus, WebhookProcessingStatus } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createWebhookDelivery(
  input: {
    providerEventId: string;
    paymentId: string;
    providerPaymentId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.webhookDelivery.create({
    data: {
      ...input,
      status: WebhookDeliveryStatus.PENDING,
    },
  });
}

export function listPendingWebhookDeliveries(limit: number, db: DatabaseClient = prisma) {
  return db.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PENDING,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export function markWebhookDeliveryDelivered(id: string, db: DatabaseClient = prisma) {
  return db.webhookDelivery.update({
    where: { id },
    data: {
      status: WebhookDeliveryStatus.DELIVERED,
      deliveredAt: new Date(),
      attempts: {
        increment: 1,
      },
      lastError: null,
    },
  });
}

export function markWebhookDeliveryFailed(id: string, error: string, db: DatabaseClient = prisma) {
  return db.webhookDelivery.update({
    where: { id },
    data: {
      status: WebhookDeliveryStatus.FAILED,
      attempts: {
        increment: 1,
      },
      lastError: error,
      nextAttemptAt: new Date(Date.now() + 60_000),
    },
  });
}

export function createWebhookEvent(
  input: {
    providerEventId: string;
    paymentId?: string;
    providerPaymentId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.webhookEvent.create({
    data: {
      ...input,
      processingStatus: WebhookProcessingStatus.RECEIVED,
    },
  });
}

export function findWebhookEventByProviderEventId(providerEventId: string, db: DatabaseClient = prisma) {
  return db.webhookEvent.findUnique({
    where: { providerEventId },
  });
}

export function markWebhookEventProcessed(id: string, db: DatabaseClient = prisma) {
  return db.webhookEvent.update({
    where: { id },
    data: {
      processingStatus: WebhookProcessingStatus.PROCESSED,
      processedAt: new Date(),
      processingError: null,
    },
  });
}

export function markWebhookEventRejected(id: string, error: string, db: DatabaseClient = prisma) {
  return db.webhookEvent.update({
    where: { id },
    data: {
      processingStatus: WebhookProcessingStatus.REJECTED,
      processingError: error,
      processedAt: new Date(),
    },
  });
}
