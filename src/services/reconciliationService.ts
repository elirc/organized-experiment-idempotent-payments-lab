/**
 * This file compares local payment state against provider state and stores reconciliation issues for operators.
 * What calls it: src/app/api/admin/reconciliation/run/route.ts and src/app/api/admin/reconciliation/issues/route.ts.
 * What it calls: reconciliation, payment, provider, and event repositories plus the payment state machine.
 * One thing a junior engineer would likely get wrong when writing something similar: only check for missing rows and ignore semantic mismatches like provider succeeded while local remains pending.
 */
import { ReconciliationIssueStatus, ReconciliationIssueType } from "@prisma/client";

import { prisma } from "../lib/db";
import { resolveLocalStatusFromProviderStatus } from "../lib/domain/paymentStateMachine";
import type { AuthenticatedSession } from "../lib/auth/session";
import { createPaymentEvent } from "../repositories/paymentEventRepository";
import { listPaymentsForReconciliation } from "../repositories/paymentRepository";
import {
  completeReconciliationRun,
  createReconciliationIssues,
  createReconciliationRun,
  failReconciliationRun,
  listLatestReconciliationIssues,
} from "../repositories/reconciliationRepository";
import { listProviderPayments } from "../repositories/providerRepository";

export async function runReconciliation(session: AuthenticatedSession) {
  const run = await createReconciliationRun({
    startedByUserId: session.userId,
  });

  try {
    const [payments, providerPayments] = await Promise.all([
      listPaymentsForReconciliation(),
      listProviderPayments(),
    ]);

    const providerByPaymentId = new Map(providerPayments.map((providerPayment) => [providerPayment.paymentId, providerPayment]));
    const localPaymentIds = new Set(payments.map((payment) => payment.id));

    const issues = [];

    for (const payment of payments) {
      const providerPayment = providerByPaymentId.get(payment.id);

      if (!providerPayment) {
        issues.push({
          runId: run.id,
          paymentId: payment.id,
          providerPaymentId: payment.providerPaymentId,
          type: ReconciliationIssueType.MISSING_PROVIDER_PAYMENT,
          status: ReconciliationIssueStatus.OPEN,
          localStatus: payment.status,
          providerStatus: null,
          details: {
            message: "Local payment has no provider mirror record.",
          },
        });
        continue;
      }

      const expectedLocalStatus = resolveLocalStatusFromProviderStatus(providerPayment.status);

      if (payment.status !== expectedLocalStatus) {
        const missingWebhookDelivery =
          providerPayment.status !== "RECEIVED" &&
          providerPayment.status !== "PROCESSING" &&
          payment.webhookDeliveries.length === 0;

        issues.push({
          runId: run.id,
          paymentId: payment.id,
          providerPaymentId: providerPayment.externalPaymentId,
          type: missingWebhookDelivery
            ? ReconciliationIssueType.MISSING_WEBHOOK_DELIVERY
            : ReconciliationIssueType.STATUS_MISMATCH,
          status: ReconciliationIssueStatus.OPEN,
          localStatus: payment.status,
          providerStatus: providerPayment.status,
          details: {
            message: missingWebhookDelivery
              ? "Provider reached a terminal state but no webhook delivery was queued."
              : "Provider and local statuses disagree.",
          },
        });
      }
    }

    for (const providerPayment of providerPayments) {
      if (!localPaymentIds.has(providerPayment.paymentId)) {
        issues.push({
          runId: run.id,
          paymentId: null,
          providerPaymentId: providerPayment.externalPaymentId,
          type: ReconciliationIssueType.MISSING_LOCAL_PAYMENT,
          status: ReconciliationIssueStatus.OPEN,
          localStatus: null,
          providerStatus: providerPayment.status,
          details: {
            message: "Provider payment exists without a local payment row.",
          },
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await createReconciliationIssues(issues, tx);

      for (const issue of issues) {
        if (issue.paymentId) {
          await createPaymentEvent(
            {
              paymentId: issue.paymentId,
              actorUserId: session.userId,
              actorLabel: session.email,
              type: "RECONCILIATION_FLAGGED",
              payload: {
                runId: run.id,
                type: issue.type,
              },
            },
            tx,
          );
        }
      }

      await completeReconciliationRun(
        {
          runId: run.id,
          summary: {
            issueCount: issues.length,
            completedBy: session.email,
          },
        },
        tx,
      );
    });

    return {
      runId: run.id,
      issueCount: issues.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reconciliation error";
    await failReconciliationRun(run.id, message);
    throw error;
  }
}

export function listReconciliationIssues() {
  return listLatestReconciliationIssues();
}
