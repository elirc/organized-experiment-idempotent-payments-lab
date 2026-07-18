/**
 * This file is the explicit state machine for payment and refund transitions.
 * What calls it: src/services/webhookService.ts, src/services/refundService.ts, src/services/reconciliationService.ts, and tests in tests/services/paymentStateMachine.test.ts.
 * What it calls: RouteError from src/lib/errors.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: update statuses with ad hoc if statements across multiple services until invalid transitions slip through.
 */
import type { PaymentStatusValue, ProviderPaymentStatusValue } from "./paymentTypes.ts";
import { RouteError } from "../errors.ts";

const allowedTransitions: Record<PaymentStatusValue, PaymentStatusValue[]> = {
  PENDING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};

export function assertAllowedPaymentTransition(
  currentStatus: PaymentStatusValue,
  nextStatus: PaymentStatusValue,
) {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new RouteError(
      409,
      "INVALID_PAYMENT_TRANSITION",
      `Cannot transition payment from ${currentStatus} to ${nextStatus}.`,
    );
  }
}

export function resolveLocalStatusFromProviderStatus(
  status: ProviderPaymentStatusValue,
): PaymentStatusValue {
  switch (status) {
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    case "RECEIVED":
    case "PROCESSING":
      return "PENDING";
  }
}

export function assertRefundAllowed(
  currentStatus: PaymentStatusValue,
  refundAmountMinor: number,
  capturedAmountMinor: number,
) {
  if (currentStatus !== "SUCCEEDED") {
    throw new RouteError(409, "PAYMENT_NOT_REFUNDABLE", "Only succeeded payments can be refunded.");
  }

  // ⚠️ SENIOR NOTE: refund validation needs the captured amount, not just current status, or repeated partial refunds can exceed the original charge.
  if (refundAmountMinor > capturedAmountMinor) {
    throw new RouteError(409, "REFUND_AMOUNT_EXCEEDS_CAPTURE", "Refund amount exceeds the captured payment amount.");
  }
}
