/**
 * This file owns payment creation, including idempotency replay, ownership validation, and provider dispatch orchestration.
 * What calls it: src/app/api/payments/route.ts.
 * What it calls: idempotency, payment, event, user repositories and providerSimulatorService.
 * One thing a junior engineer would likely get wrong when writing something similar: treat idempotency as "just a unique key" and never define what a duplicate request should actually return.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/db";
import { RouteError } from "../lib/errors";
import { buildRequestFingerprint } from "../lib/idempotency/requestFingerprint";
import type { AuthenticatedSession } from "../lib/auth/session";
import { createIdempotencyRecord, findIdempotencyRecord, markIdempotencyCompleted } from "../repositories/idempotencyRepository";
import { createPaymentEvent } from "../repositories/paymentEventRepository";
import { createPayment } from "../repositories/paymentRepository";
import { findUserById } from "../repositories/userRepository";
import { dispatchPaymentToProvider } from "./providerSimulatorService";
import { resolvePaymentOwnerForCreate } from "./paymentAccessPolicy";

export type CreatePaymentInput = {
  amountMinor: number;
  currency: string;
  description: string;
  ownerUserId?: string;
  simulationMode: "SUCCEED" | "FAIL" | "PARTIAL_SUCCESS" | "NETWORK_UNKNOWN";
};

type CreatePaymentResponse = {
  paymentId: string;
  reference: string;
  status: string;
  providerPaymentId: string;
  providerStatus: string;
  replayed: boolean;
  queuedWebhook: boolean;
};

function buildPaymentReference() {
  return `PAY-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function buildCompletedReplay(record: {
  responseStatusCode: number | null;
  responseBody: Prisma.JsonValue | null;
}) {
  return {
    statusCode: record.responseStatusCode ?? 200,
    body: {
      ...(record.responseBody as Record<string, unknown>),
      replayed: true,
    } satisfies CreatePaymentResponse,
  };
}

export async function createPaymentWithIdempotency(
  input: {
    body: CreatePaymentInput;
    idempotencyKey: string | null;
    session: AuthenticatedSession;
  },
) {
  if (!input.idempotencyKey) {
    throw new RouteError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required.");
  }

  const route = "POST:/api/payments";
  const requestHash = buildRequestFingerprint(input.body);
  const existingRecord = await findIdempotencyRecord(route, input.idempotencyKey);

  if (existingRecord) {
    if (existingRecord.requestHash !== requestHash) {
      throw new RouteError(
        409,
        "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
        "The same idempotency key was reused with a different payment request.",
      );
    }

    if (existingRecord.status === "COMPLETED" && existingRecord.responseBody) {
      return buildCompletedReplay(existingRecord);
    }

    throw new RouteError(409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "This payment request is already being processed.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await createIdempotencyRecord(
        {
          route,
          key: input.idempotencyKey!,
          requestHash,
        },
        tx,
      );

      const ownerUserId = resolvePaymentOwnerForCreate(input.session, input.body.ownerUserId);
      const owner = await findUserById(ownerUserId, tx);

      if (!owner) {
        throw new RouteError(404, "OWNER_NOT_FOUND", "The selected payment owner does not exist.");
      }

      const payment = await createPayment(
        {
          reference: buildPaymentReference(),
          amountMinor: input.body.amountMinor,
          currency: input.body.currency,
          ownerUserId: owner.id,
          createdByUserId: input.session.userId,
          metadata: {
            description: input.body.description,
            simulationMode: input.body.simulationMode,
          },
        },
        tx,
      );

      await createPaymentEvent(
        {
          paymentId: payment.id,
          actorUserId: input.session.userId,
          actorLabel: input.session.email,
          type: "PAYMENT_CREATED",
          payload: {
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            ownerUserId: payment.ownerUserId,
          },
        },
        tx,
      );

      const providerResult = await dispatchPaymentToProvider(
        {
          payment,
          simulationMode: input.body.simulationMode,
        },
        tx,
      );

      const responseBody = {
        paymentId: payment.id,
        reference: payment.reference,
        status: payment.status,
        providerPaymentId: providerResult.providerPaymentId,
        providerStatus: providerResult.providerStatus,
        queuedWebhook: providerResult.queuedWebhook,
        replayed: false,
      } satisfies CreatePaymentResponse;

      await markIdempotencyCompleted(
        {
          id: record.id,
          resourceType: "payment",
          resourceId: payment.id,
          responseStatusCode: 202,
          responseBody,
        },
        tx,
      );

      return {
        statusCode: 202,
        body: responseBody,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const collision = await findIdempotencyRecord(route, input.idempotencyKey);

      if (collision?.requestHash !== requestHash) {
        throw new RouteError(
          409,
          "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          "The same idempotency key was reused with a different payment request.",
        );
      }

      if (collision?.status === "COMPLETED" && collision.responseBody) {
        return buildCompletedReplay(collision);
      }

      throw new RouteError(409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "This payment request is already being processed.");
    }

    throw error;
  }
}
