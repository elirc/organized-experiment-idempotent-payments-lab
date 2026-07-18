/**
 * This file holds pure authorization helpers so permission checks are testable without Next.js or the database.
 * What calls it: src/lib/auth/guards.ts, service-level ownership checks, and tests in tests/auth/authorization.test.ts.
 * What it calls: src/lib/permissions.ts and RouteError from src/lib/api/route-helpers.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: assume "authenticated" means "authorized" and skip the second check entirely.
 */
import type { AppUserRole } from "../domain/paymentTypes.ts";
import { RouteError } from "../errors.ts";
import { Permission, type PermissionValue, roleHasPermission } from "../permissions.ts";

export type SessionLike = {
  userId: string;
  role: AppUserRole;
};

export function requirePermission<T extends SessionLike>(session: T | null, permission: PermissionValue): T {
  if (!session) {
    throw new RouteError(401, "UNAUTHENTICATED", "You must sign in before calling this endpoint.");
  }

  if (!roleHasPermission(session.role, permission)) {
    throw new RouteError(403, "FORBIDDEN", `Role ${session.role} cannot perform ${permission}.`);
  }

  return session;
}

export function canReadPayment(session: SessionLike, ownerUserId: string) {
  if (roleHasPermission(session.role, Permission.PAYMENT_READ_ANY)) {
    return true;
  }

  return roleHasPermission(session.role, Permission.PAYMENT_READ_OWN) && session.userId === ownerUserId;
}
