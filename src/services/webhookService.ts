/**
 * This file processes provider webhook events idempotently and applies local payment state transitions.
 * What calls it: src/app/api/webhooks/provider/route.ts and src/services/providerSimulatorService.ts.
 * What it calls: webhook, provider, payment, and event repositories plus the payment state machine.
 * One thing a junior engineer would likely get wrong when writing something similar: process the same webhook twice and accidentally re-run transitions or duplicate side effects.
 */
import { prisma } from "../lib/db";
import { RouteError } from "../lib/errors";
import { assertAllowedPaymentTransition, resolveLocalStatusFromProviderStatus } from "../lib/domain/paymentStateMachine";
import { createPaymentEvent } from "../repositories/paymentEventRepository";
import { findProviderPaymentByExternalId, updateProviderPaymentStatus } from "../repositories/providerRepository";
import { findPaymentById, transitionPaymentStatus } from "../repositories/paymentRepository";
import {
  createWebhookEvent,
  findWebhookEventByProviderEventId,
  markWebhookEventProcessed,
  markWebhookEventRejected,
} from "../repositories/webhookRepository";

type ProviderWebhookPayload = {
  providerEventId: string;
  providerPaymentId: string;
  paymentId?: string;
  status: "RECEIVED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  eventType: string;
};

export async function processProviderWebhook(payload: Record<string, unknown>) {
  const parsedPayload = payload as ProviderWebhookPayload;
  const existingEvent = await findWebhookEventByProviderEventId(parsedPayload.providerEventId);

  if (existingEvent?.processingStatus === "PROCESSED") {
    return {
      duplicate: true,
      paymentId: existingEvent.paymentId,
    };
  }

  const providerPayment = await findProviderPaymentByExternalId(parsedPayload.providerPaymentId);

  if (!providerPayment) {
    throw new RouteError(404, "PROVIDER_PAYMENT_NOT_FOUND", "Provider payment does not exist.");
  }

  const payment = await findPaymentById(providerPayment.paymentId);

  if (!payment) {
    throw new RouteError(404, "PAYMENT_NOT_FOUND", "Local payment does not exist.");
  }

  const localStatus = resolveLocalStatusFromProviderStatus(parsedPayload.status);

  return prisma.$transaction(async (tx) => {
    const webhookEvent =
      existingEvent ??
      (await createWebhookEvent(
        {
          providerEventId: parsedPayload.providerEventId,
          paymentId: payment.id,
          providerPaymentId: parsedPayload.providerPaymentId,
          eventType: parsedPayload.eventType,
          payload: parsedPayload,
        },
        tx,
      ));

    try {
      await updateProviderPaymentStatus(
        {
          paymentId: payment.id,
          status: parsedPayload.status,
          latestPayload: parsedPayload,
        },
        tx,
      );

      await createPaymentEvent(
        {
          paymentId: payment.id,
          actorLabel: "provider-webhook",
          type: "WEBHOOK_RECEIVED",
          payload: parsedPayload,
        },
        tx,
      );

      if (payment.status !== localStatus) {
        assertAllowedPaymentTransition(payment.status, localStatus);

        await transitionPaymentStatus(
          {
            paymentId: payment.id,
            nextStatus: localStatus,
            providerStatus: parsedPayload.status,
            failureCode: localStatus === "FAILED" ? "PROVIDER_DECLINED" : null,
            failureMessage: localStatus === "FAILED" ? "Provider marked the payment as failed." : null,
          },
          tx,
        );

        await createPaymentEvent(
          {
            paymentId: payment.id,
            actorLabel: "provider-webhook",
            type: "STATUS_CHANGED",
            payload: {
              from: payment.status,
              to: localStatus,
              providerStatus: parsedPayload.status,
            },
          },
          tx,
        );
      }

      await markWebhookEventProcessed(webhookEvent.id, tx);

      return {
        duplicate: false,
        paymentId: payment.id,
        status: localStatus,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook processing error";
      await markWebhookEventRejected(webhookEvent.id, message, tx);
      throw error;
    }
  });
}
