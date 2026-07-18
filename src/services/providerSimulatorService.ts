/**
 * This file simulates the external payment provider and queues webhook deliveries that reconcile local state later.
 * What calls it: src/services/paymentService.ts and src/app/api/admin/webhooks/deliver/route.ts.
 * What it calls: provider, attempt, payment event, webhook repositories and webhookService.
 * One thing a junior engineer would likely get wrong when writing something similar: update the local payment directly and skip modeling the provider's separate source of truth.
 */
import { ProviderDecision, ProviderPaymentStatus } from "@prisma/client";

import type { DatabaseClient } from "../lib/db";
import { createPaymentAttempt } from "../repositories/paymentAttemptRepository";
import { createPaymentEvent } from "../repositories/paymentEventRepository";
import { createProviderPayment } from "../repositories/providerRepository";
import { updatePaymentProviderView } from "../repositories/paymentRepository";
import {
  createWebhookDelivery,
  listPendingWebhookDeliveries,
  markWebhookDeliveryDelivered,
  markWebhookDeliveryFailed,
} from "../repositories/webhookRepository";
import { processProviderWebhook } from "./webhookService";

type SimulationMode = "SUCCEED" | "FAIL" | "PARTIAL_SUCCESS" | "NETWORK_UNKNOWN";

export function resolveProviderSimulation(mode: SimulationMode) {
  switch (mode) {
    case "FAIL":
      return {
        decision: ProviderDecision.FAIL,
        providerStatus: ProviderPaymentStatus.FAILED,
        queueWebhook: true,
      };
    case "PARTIAL_SUCCESS":
      return {
        decision: ProviderDecision.PARTIAL_SUCCESS,
        providerStatus: ProviderPaymentStatus.SUCCEEDED,
        queueWebhook: false,
      };
    case "NETWORK_UNKNOWN":
      return {
        decision: ProviderDecision.NETWORK_UNKNOWN,
        providerStatus: ProviderPaymentStatus.SUCCEEDED,
        queueWebhook: true,
      };
    case "SUCCEED":
    default:
      return {
        decision: ProviderDecision.SUCCEED,
        providerStatus: ProviderPaymentStatus.SUCCEEDED,
        queueWebhook: true,
      };
  }
}

export async function dispatchPaymentToProvider(
  input: {
    payment: {
      id: string;
      reference: string;
      amountMinor: number;
      currency: string;
    };
    simulationMode: SimulationMode;
  },
  db: DatabaseClient,
) {
  const providerRequestId = `prov_req_${crypto.randomUUID()}`;
  const providerPaymentId = `prov_pay_${crypto.randomUUID()}`;
  const providerEventId = `prov_evt_${crypto.randomUUID()}`;
  const simulation = resolveProviderSimulation(input.simulationMode);

  await createPaymentAttempt(
    {
      paymentId: input.payment.id,
      providerRequestId,
      decision: simulation.decision,
      requestPayload: {
        paymentReference: input.payment.reference,
        amountMinor: input.payment.amountMinor,
        currency: input.payment.currency,
      },
      responsePayload: {
        providerPaymentId,
        providerStatus: simulation.providerStatus,
        transport: input.simulationMode === "NETWORK_UNKNOWN" ? "AMBIGUOUS" : "ACKNOWLEDGED",
      },
    },
    db,
  );

  await createProviderPayment(
    {
      paymentId: input.payment.id,
      externalPaymentId: providerPaymentId,
      amountMinor: input.payment.amountMinor,
      currency: input.payment.currency,
      status: simulation.providerStatus,
      decision: simulation.decision,
      latestPayload: {
        providerPaymentId,
        providerStatus: simulation.providerStatus,
        providerEventId,
      },
    },
    db,
  );

  await updatePaymentProviderView(
    {
      paymentId: input.payment.id,
      providerPaymentId,
      providerStatus: simulation.providerStatus,
    },
    db,
  );

  await createPaymentEvent(
    {
      paymentId: input.payment.id,
      actorLabel: "provider-simulator",
      type: "PROVIDER_ACCEPTED",
      payload: {
        providerPaymentId,
        providerStatus: simulation.providerStatus,
        decision: simulation.decision,
      },
    },
    db,
  );

  if (simulation.queueWebhook) {
    await createWebhookDelivery(
      {
        providerEventId,
        paymentId: input.payment.id,
        providerPaymentId,
        eventType: "payment.updated",
        payload: {
          providerEventId,
          providerPaymentId,
          paymentId: input.payment.id,
          status: simulation.providerStatus,
          eventType: "payment.updated",
        },
      },
      db,
    );
  }

  return {
    providerPaymentId,
    providerStatus: simulation.providerStatus,
    queuedWebhook: simulation.queueWebhook,
    decision: simulation.decision,
  };
}

export async function deliverPendingWebhooks(limit: number) {
  const deliveries = await listPendingWebhookDeliveries(limit);
  const results: Array<{ id: string; status: "DELIVERED" | "FAILED"; message: string }> = [];

  for (const delivery of deliveries) {
    try {
      await processProviderWebhook(delivery.payload as Record<string, unknown>);
      await markWebhookDeliveryDelivered(delivery.id);
      results.push({
        id: delivery.id,
        status: "DELIVERED",
        message: "Webhook processed successfully.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook failure";
      await markWebhookDeliveryFailed(delivery.id, message);
      results.push({
        id: delivery.id,
        status: "FAILED",
        message,
      });
    }
  }

  return {
    delivered: results.filter((result) => result.status === "DELIVERED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    results,
  };
}
