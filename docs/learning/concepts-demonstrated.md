# Concepts Demonstrated

## Service layer
Where to look: `src/services/paymentService.ts` — `createPaymentWithIdempotency()` orchestrates hashing, policy checks, transactions, repository calls, and provider dispatch without leaking those details into the route.
Also see: `src/services/reconciliationService.ts` for a read-heavy operational service.
Risk if wrong: Routes become fat, business rules fragment, and changes become hard to review safely.

## Repository pattern
Where to look: `src/repositories/paymentRepository.ts` — `createPayment()`, `findPaymentById()`, and `transitionPaymentStatus()` are the only payment-row write/read primitives services use.
Also see: `src/repositories/idempotencyRepository.ts` for a repository around an operational correctness concern rather than a user-facing entity.
Risk if wrong: Query logic spreads into services and ownership or relation loading becomes inconsistent.

## Zod validation boundary
Where to look: `src/lib/validation/paymentSchemas.ts` — `createPaymentSchema` and `refundPaymentSchema`.
Also see: `src/app/api/payments/route.ts` and `src/app/api/payments/[paymentId]/refund/route.ts` where `.parse()` is called before business logic.
Risk if wrong: Malformed money values or weak refund reasons reach service code and fail later in less predictable ways.

## Auth/session flow
Where to look: `src/services/authService.ts` — `login()` creates the server-side session row and `src/lib/auth/session.ts` resolves it from cookies.
Also see: `src/app/api/auth/login/route.ts` for the HTTP entrypoint.
Risk if wrong: Cookie values can be trusted without server verification, which is an auth bug.

## Role-based access control
Where to look: `src/lib/permissions.ts` — `rolePermissions` is the policy source of truth.
Also see: `src/lib/auth/guards.ts` where `withRouteAuth()` enforces it before handlers run.
Risk if wrong: Powerful operational actions like refunds or reconciliation become callable by the wrong staff role.

## Ownership/data isolation
Where to look: `src/services/paymentAccessPolicy.ts` — `buildPaymentListScope()` and `assertCanReadPaymentRecord()`.
Also see: `src/services/paymentQueryService.ts` where those functions are applied to list/detail reads.
Risk if wrong: Customer payment data leaks across users even when authentication works correctly.

## Idempotency
Where to look: `src/services/paymentService.ts` — `createPaymentWithIdempotency()` and `buildCompletedReplay()`.
Also see: `src/repositories/idempotencyRepository.ts` for durable persistence of request hash and response snapshot.
Risk if wrong: Retries create duplicate charges or ambiguous API behavior.

## Status/state transitions
Where to look: `src/lib/domain/paymentStateMachine.ts` — `assertAllowedPaymentTransition()` and `assertRefundAllowed()`.
Also see: `src/services/webhookService.ts` and `src/services/refundService.ts`, where those guards are used before writes.
Risk if wrong: Terminal payment states can be overwritten or refunds can exceed captured amounts.

## Audit logging via domain events
Where to look: `src/repositories/paymentEventRepository.ts` — `createPaymentEvent()` is called from payment, refund, webhook, and reconciliation services.
Also see: `src/components/payments/PaymentDetailsCard.tsx`, which renders the event trail.
Risk if wrong: Operators lose the historical sequence needed to explain incidents or financial anomalies.

## Background-job style async workflow
Where to look: `src/services/providerSimulatorService.ts` — `deliverPendingWebhooks()` drains queued `WebhookDelivery` rows.
Also see: `src/app/api/admin/webhooks/deliver/route.ts`, which exposes the operation to the admin UI.
Risk if wrong: The system pretends async provider confirmation is synchronous and fails to model eventual consistency.

## Reconciliation
Where to look: `src/services/reconciliationService.ts` — `runReconciliation()` compares local and provider views and writes `ReconciliationIssue` rows.
Also see: `prisma/schema.prisma` models `ReconciliationRun` and `ReconciliationIssue`.
Risk if wrong: Silent inconsistencies accumulate until finance or support discovers them manually.
