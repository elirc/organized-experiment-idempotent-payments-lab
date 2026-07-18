/**
 * This file centralizes ownership-aware payment access decisions so services do not drift on data isolation rules.
 * What calls it: src/services/paymentService.ts and src/services/paymentQueryService.ts.
 * What it calls: src/lib/auth/authorization.ts and src/lib/permissions.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: enforce access on the detail page but forget the list endpoint, which still leaks other users' records.
 */
import type { AuthenticatedSession } from "../lib/auth/session.ts";
import { RouteError } from "../lib/errors.ts";
import { canReadPayment } from "../lib/auth/authorization.ts";
import { Permission, roleHasPermission } from "../lib/permissions.ts";

export function resolvePaymentOwnerForCreate(
  session: AuthenticatedSession,
  requestedOwnerUserId?: string,
) {
  if (!requestedOwnerUserId) {
    return session.userId;
  }

  if (requestedOwnerUserId === session.userId) {
    return requestedOwnerUserId;
  }

  if (!roleHasPermission(session.role, Permission.PAYMENT_READ_ANY)) {
    throw new RouteError(
      403,
      "FORBIDDEN_OWNER_OVERRIDE",
      "You cannot create payments on behalf of another user.",
    );
  }

  return requestedOwnerUserId;
}

export function buildPaymentListScope(session: AuthenticatedSession) {
  if (roleHasPermission(session.role, Permission.PAYMENT_READ_ANY)) {
    return {};
  }

  // ⚠️ SENIOR NOTE: this ownership filter is the thin line between "customer sees their own payments" and a full data leak.
  return { ownerUserId: session.userId };
}

export function assertCanReadPaymentRecord(session: AuthenticatedSession, ownerUserId: string) {
  if (!canReadPayment(session, ownerUserId)) {
    throw new RouteError(403, "FORBIDDEN", "You are not allowed to view this payment.");
  }
}
