# Guided Reading Path

## Step 1 — src/lib/permissions.ts
**Why read this:** This is the smallest file that tells you who is allowed to do what.
**What to look for:** The `rolePermissions` map and how `Permission` values are named after actions, not pages.
**What to trace:** `src/lib/auth/authorization.ts` calls `roleHasPermission()`, and `src/lib/auth/guards.ts` uses that through `requirePermission()`.
**What a junior would likely miss:** The difference between "can reach the page" and "can perform the operation" starts here, not in React.

## Step 2 — src/lib/auth/authorization.ts
**Why read this:** This is the pure policy gate that every protected route depends on.
**What to look for:** `requirePermission()` and `canReadPayment()` as separate concepts.
**What to trace:** Called by `src/lib/auth/guards.ts` and `src/services/paymentAccessPolicy.ts`; throws `RouteError` from `src/lib/errors.ts`.
**What a junior would likely miss:** Authenticated does not mean authorized, and list/read ownership logic is different from coarse role gating.

## Step 3 — src/lib/auth/guards.ts
**Why read this:** It is the framework bridge between cookie sessions and the pure permission layer.
**What to look for:** `withRouteAuth()` and `requirePagePermission()`.
**What to trace:** Called by API routes like `src/app/api/payments/route.ts` and pages like `src/app/admin/reconciliation/page.tsx`; it calls `src/lib/auth/session.ts` and `src/lib/auth/authorization.ts`.
**What a junior would likely miss:** If this wrapper is bypassed by even one route, the architecture looks secure but is not.

## Step 4 — prisma/schema.prisma
**Why read this:** The schema shows the real shape of the system better than any diagram.
**What to look for:** `IdempotencyRecord`, `ProviderPayment`, `WebhookDelivery`, and `ReconciliationIssue`.
**What to trace:** The write paths in `src/services/paymentService.ts`, `src/services/providerSimulatorService.ts`, and `src/services/reconciliationService.ts`.
**What a junior would likely miss:** `Payment` is not enough by itself to explain financial correctness once retries and async updates enter the picture.

## Step 5 — src/services/paymentService.ts
**Why read this:** This is the main write path and the clearest example of service-layer orchestration.
**What to look for:** `createPaymentWithIdempotency()`, request hashing, replay behavior, and the transaction boundary.
**What to trace:** Called by `src/app/api/payments/route.ts`; it calls `src/lib/idempotency/requestFingerprint.ts`, `src/repositories/idempotencyRepository.ts`, `src/services/paymentAccessPolicy.ts`, `src/repositories/paymentRepository.ts`, and `src/services/providerSimulatorService.ts`.
**What a junior would likely miss:** The idempotency response snapshot is part of the API contract, not a debugging convenience.

## Step 6 — src/services/providerSimulatorService.ts
**Why read this:** This file models the external system instead of pretending local status is the only truth.
**What to look for:** `resolveProviderSimulation()` and `dispatchPaymentToProvider()`.
**What to trace:** Called by `src/services/paymentService.ts`; it calls provider, attempt, event, and webhook repositories, and later `deliverPendingWebhooks()` calls `src/services/webhookService.ts`.
**What a junior would likely miss:** A "partial failure" is often a missing side effect around the provider result, not just a thrown exception.

## Step 7 — src/services/webhookService.ts
**Why read this:** It shows how to process async updates idempotently.
**What to look for:** `processProviderWebhook()` checking `providerEventId` before mutating state.
**What to trace:** Called by `src/app/api/webhooks/provider/route.ts` and `src/services/providerSimulatorService.ts`; it calls `src/lib/domain/paymentStateMachine.ts` and multiple repositories.
**What a junior would likely miss:** The event row is persisted before the mutation is considered complete, which helps make retries safe.

## Step 8 — src/lib/domain/paymentStateMachine.ts
**Why read this:** It is the explicit state-transition guardrail.
**What to look for:** `assertAllowedPaymentTransition()` and `assertRefundAllowed()`.
**What to trace:** Called by `src/services/webhookService.ts` and `src/services/refundService.ts`.
**What a junior would likely miss:** State transitions deserve a dedicated module once multiple workflows can change status.

## Step 9 — src/services/refundService.ts
**Why read this:** Refunds are where "money-moving correctness" gets real.
**What to look for:** `sumSuccessfulRefundsForPayment()` plus the full-vs-partial refund branch.
**What to trace:** Called by `src/app/api/payments/[paymentId]/refund/route.ts`; it calls `src/repositories/refundRepository.ts`, `src/repositories/paymentRepository.ts`, and `src/repositories/paymentEventRepository.ts`.
**What a junior would likely miss:** Prior refunds matter just as much as current payment status.

## Step 10 — src/services/reconciliationService.ts
**Why read this:** This is where eventual consistency becomes operationally visible.
**What to look for:** `runReconciliation()` computing mismatches between local and provider states.
**What to trace:** Called by `src/app/api/admin/reconciliation/run/route.ts`; it calls payment, provider, reconciliation, and event repositories.
**What a junior would likely miss:** Reconciliation is not a report-only concern; it is part of the system’s correctness story.

## Step 11 — src/services/paymentAccessPolicy.ts
**Why read this:** It is the clean example of explicit ownership policy outside of UI files.
**What to look for:** `buildPaymentListScope()` and `assertCanReadPaymentRecord()`.
**What to trace:** Called by `src/services/paymentQueryService.ts` and `src/services/paymentService.ts`.
**What a junior would likely miss:** List scoping bugs are usually more dangerous than detail-view bugs because they leak many rows at once.

## Step 12 — src/components/admin/ReconciliationPanel.tsx
**Why read this:** This is the best UI file for seeing how the operations surface maps onto backend workflows.
**What to look for:** The buttons that call `useDeliverWebhooks()` and `useRunReconciliation()`.
**What to trace:** It calls `src/hooks/useReconciliation.ts`, which calls the admin API routes.
**What a junior would likely miss:** The UI intentionally exposes system-repair actions, not just data browsing.

## Step 13 — src/hooks/usePaymentActions.ts
**Why read this:** It shows how the client keeps server state coherent after mutations.
**What to look for:** Query invalidation after create and refund mutations.
**What to trace:** Called by `src/components/payments/PaymentCreateForm.tsx` and `src/components/payments/RefundForm.tsx`; it calls `src/hooks/apiClient.ts`.
**What a junior would likely miss:** Stale caches are a real correctness bug in operational UIs, not just a cosmetic issue.

## Step 14 — src/app/api/payments/route.ts
**Why read this:** It is the thinnest version of the HTTP edge in this codebase.
**What to look for:** How little logic lives here once the architecture is set up correctly.
**What to trace:** It calls `src/lib/auth/guards.ts`, `src/lib/validation/paymentSchemas.ts`, and `src/services/paymentService.ts`.
**What a junior would likely miss:** A thin route is often a sign of good structure, not missing work.
