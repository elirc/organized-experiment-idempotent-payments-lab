/**
 * This file owns read-side payment access for the admin UI and customer-visible payment views.
 * What calls it: src/app/api/admin/payments/route.ts, src/app/api/admin/payments/[paymentId]/route.ts, and server pages under src/app/admin/**.
 * What it calls: payment repository queries and payment access policy checks.
 * One thing a junior engineer would likely get wrong when writing something similar: assume a route-level role check is enough and forget the per-record ownership check on details.
 */
import type { AuthenticatedSession } from "../lib/auth/session";
import { RouteError } from "../lib/errors";
import { findPaymentById, listPayments } from "../repositories/paymentRepository";
import { assertCanReadPaymentRecord, buildPaymentListScope } from "./paymentAccessPolicy";

export async function listVisiblePayments(session: AuthenticatedSession) {
  const scope = buildPaymentListScope(session);
  return listPayments(scope);
}

export async function getVisiblePaymentDetail(paymentId: string, session: AuthenticatedSession) {
  const payment = await findPaymentById(paymentId);

  if (!payment) {
    throw new RouteError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  }

  assertCanReadPaymentRecord(session, payment.ownerUserId);

  return payment;
}
