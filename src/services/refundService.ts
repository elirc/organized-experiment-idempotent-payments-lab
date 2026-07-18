/**
 * This file handles refund initiation and enforces refund amount safety.
 * What calls it: src/app/api/payments/[paymentId]/refund/route.ts.
 * What it calls: payment/refund repositories, payment state machine, and payment event repository.
 * One thing a junior engineer would likely get wrong when writing something similar: allow a refund as long as the payment succeeded once, ignoring prior partial refunds.
 */
import { RefundStatus } from "@prisma/client";

import { prisma } from "../lib/db";
import { RouteError } from "../lib/errors";
import { assertRefundAllowed } from "../lib/domain/paymentStateMachine";
import type { AuthenticatedSession } from "../lib/auth/session";
import { createPaymentEvent } from "../repositories/paymentEventRepository";
import { findPaymentById, transitionPaymentStatus } from "../repositories/paymentRepository";
import { createRefund, sumSuccessfulRefundsForPayment, transitionRefundStatus } from "../repositories/refundRepository";

export async function createRefundForPayment(
  input: {
    paymentId: string;
    amountMinor: number;
    reason: string;
    session: AuthenticatedSession;
  },
) {
  const payment = await findPaymentById(input.paymentId);

  if (!payment) {
    throw new RouteError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  }

  const refundedAmount = await sumSuccessfulRefundsForPayment(payment.id);
  const remainingRefundableAmount = payment.amountMinor - refundedAmount;

  assertRefundAllowed(payment.status, input.amountMinor, remainingRefundableAmount);

  return prisma.$transaction(async (tx) => {
    const refund = await createRefund(
      {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        createdByUserId: input.session.userId,
      },
      tx,
    );

    await createPaymentEvent(
      {
        paymentId: payment.id,
        actorUserId: input.session.userId,
        actorLabel: input.session.email,
        type: "REFUND_REQUESTED",
        payload: {
          refundId: refund.id,
          amountMinor: refund.amountMinor,
          reason: refund.reason,
        },
      },
      tx,
    );

    const providerRefundId = `prov_ref_${crypto.randomUUID()}`;
    await transitionRefundStatus(refund.id, RefundStatus.SUCCEEDED, providerRefundId, tx);

    const fullyRefunded = refundedAmount + refund.amountMinor === payment.amountMinor;

    if (fullyRefunded) {
      await transitionPaymentStatus(
        {
          paymentId: payment.id,
          nextStatus: "REFUNDED",
          providerStatus: "REFUNDED",
        },
        tx,
      );
    }

    // ⚠️ SENIOR NOTE: partial refunds should not blindly flip the payment to REFUNDED or downstream reporting will understate captured revenue.
    await createPaymentEvent(
      {
        paymentId: payment.id,
        actorUserId: input.session.userId,
        actorLabel: input.session.email,
        type: "REFUND_SUCCEEDED",
        payload: {
          refundId: refund.id,
          providerRefundId,
          fullyRefunded,
        },
      },
      tx,
    );

    return {
      refundId: refund.id,
      paymentId: payment.id,
      refundStatus: "SUCCEEDED",
      paymentStatus: fullyRefunded ? "REFUNDED" : payment.status,
      providerRefundId,
    };
  });
}
