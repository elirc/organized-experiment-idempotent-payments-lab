/**
 * This file holds framework-agnostic payment role and status unions used by pure policy/state-machine code.
 * What calls it: src/lib/permissions.ts, src/lib/domain/paymentStateMachine.ts, and pure tests.
 * What it calls: nothing.
 * One thing a junior engineer would likely get wrong when writing something similar: force every policy helper to depend on generated ORM enums even when plain string unions would do.
 */
export const appRoles = ["CUSTOMER", "SUPPORT", "OPS", "ADMIN"] as const;
export type AppUserRole = (typeof appRoles)[number];

export const paymentStatuses = ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"] as const;
export type PaymentStatusValue = (typeof paymentStatuses)[number];

export const providerPaymentStatuses = [
  "RECEIVED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
] as const;
export type ProviderPaymentStatusValue = (typeof providerPaymentStatuses)[number];
