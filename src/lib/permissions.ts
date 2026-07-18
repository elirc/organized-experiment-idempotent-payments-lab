/**
 * This file defines the explicit RBAC policy used by pages, routes, and services.
 * What calls it: src/lib/auth/authorization.ts and server pages that need role-aware rendering.
 * What it calls: no external modules; this is the pure policy source of truth.
 * One thing a junior engineer would likely get wrong when writing something similar: encode role checks inline in random routes so permission behavior becomes unreviewable.
 */
import type { AppUserRole } from "./domain/paymentTypes.ts";

export const Permission = {
  PAYMENT_CREATE: "payment:create",
  PAYMENT_READ_ANY: "payment:read:any",
  PAYMENT_READ_OWN: "payment:read:own",
  PAYMENT_REFUND: "payment:refund",
  WEBHOOK_DELIVER: "webhook:deliver",
  RECONCILIATION_RUN: "reconciliation:run",
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

const rolePermissions: Record<AppUserRole, PermissionValue[]> = {
  CUSTOMER: [Permission.PAYMENT_CREATE, Permission.PAYMENT_READ_OWN],
  SUPPORT: [Permission.PAYMENT_READ_ANY],
  OPS: [
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ_ANY,
    Permission.PAYMENT_REFUND,
    Permission.WEBHOOK_DELIVER,
    Permission.RECONCILIATION_RUN,
  ],
  ADMIN: [
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ_ANY,
    Permission.PAYMENT_REFUND,
    Permission.WEBHOOK_DELIVER,
    Permission.RECONCILIATION_RUN,
  ],
};

export function roleHasPermission(role: AppUserRole, permission: PermissionValue) {
  return rolePermissions[role].includes(permission);
}
