# Build Journal

## Stage 1 — Project framing
Built: chose a Next.js + Prisma + REST architecture with an admin UI and async provider simulation.
Decision: modeled idempotency as a dedicated table instead of only a unique key on `Payment`.
Why: `src/services/paymentService.ts` needs request fingerprinting plus a replayable response body, which a payment-row unique constraint cannot provide cleanly.

## Stage 2 — Schema and domain modeling
Built: `prisma/schema.prisma` with `Payment`, `IdempotencyRecord`, `ProviderPayment`, `WebhookDelivery`, `WebhookEvent`, `Refund`, `PaymentEvent`, `ReconciliationRun`, and `ReconciliationIssue`.
Decision: kept provider truth in `ProviderPayment` instead of writing it directly onto `Payment`.
Options considered:
1. Single `Payment` table only. Pro: simpler queries. Con: no real reconciliation story.
2. Separate provider mirror table. Pro: explicit local-vs-external comparison. Con: more joins.
3. Event-sourcing only. Pro: very flexible. Con: too heavy for this learning project.
Choice: option 2.
What junior/mid/senior engineers notice differently:
- Junior: extra table feels redundant.
- Mid: it enables reconciliation.
- Senior: it creates an explicit consistency boundary and incident-debugging surface.

## Stage 3 — Auth and permission boundaries
Built: `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/authorization.ts`, and `src/lib/permissions.ts`.
Decision: centralized page and route auth instead of scattering checks in handlers and React files.
Why: the same `requirePermission()` path now protects `src/app/api/payments/route.ts` and `src/app/api/admin/reconciliation/run/route.ts`.

## Stage 4 — Payment, provider, and webhook workflows
Built: `src/services/paymentService.ts`, `src/services/providerSimulatorService.ts`, `src/services/webhookService.ts`, and the repository layer they call.
Decision: modeled partial failure as "provider reached terminal truth but webhook scheduling/delivery did not complete."
Why: this is the real-world shape of many payment-system incidents and it makes reconciliation meaningful.

## Stage 5 — Refund and reconciliation operations
Built: `src/services/refundService.ts`, `src/services/reconciliationService.ts`, and the admin-facing routes for both.
Decision: full refunds transition to `REFUNDED`, partial refunds do not.
Why: `src/services/refundService.ts` keeps captured-vs-refunded accounting explicit and avoids overstating refund completion.

## Stage 6 — UI, tests, and docs
Built: admin pages, React Query hooks, focused tests, and the docs in `docs/architecture/**` and `docs/learning/**`.
Decision: kept React components thin and made the services the primary learning artifact.
Why: `src/components/payments/PaymentCreateForm.tsx` and `src/components/admin/ReconciliationPanel.tsx` are easier to read because they mostly call hooks, not business logic.

## PR Slices

### Slice 1
Purpose in one sentence: Establish the schema and persistence boundaries for payments, idempotency, provider state, and sessions.
Files containing novel logic:
- `prisma/schema.prisma`
- `src/repositories/paymentRepository.ts`
- `src/repositories/idempotencyRepository.ts`
- `src/repositories/providerRepository.ts`
- `src/repositories/sessionRepository.ts`
Reviewer should verify:
- `prisma/schema.prisma` around `IdempotencyRecord` and `ProviderPayment` for uniqueness and relationship shape.
- `src/repositories/paymentRepository.ts` near `paymentDetailInclude` to confirm the read model includes the history operators need.
- `src/repositories/idempotencyRepository.ts` near `markIdempotencyCompleted()` to confirm response snapshots are durable.
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: collapsing provider status into `Payment` and removing the mirror table.

### Slice 2
Purpose in one sentence: Add cookie-backed auth and explicit RBAC before exposing any operational route.
Files containing novel logic:
- `src/lib/auth/session.ts`
- `src/lib/auth/guards.ts`
- `src/lib/auth/authorization.ts`
- `src/lib/permissions.ts`
- `src/services/authService.ts`
Reviewer should verify:
- `src/lib/auth/guards.ts` near `withRouteAuth()` to ensure permission checks happen before handler logic.
- `src/lib/auth/session.ts` near `getSessionForRequest()` to ensure expired sessions are rejected server-side.
- `src/lib/permissions.ts` near `rolePermissions` to confirm support cannot mutate money-moving flows.
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: checking auth only in pages and not in the API routes.

### Slice 3
Purpose in one sentence: Build idempotent payment creation and simulated provider dispatch.
Files containing novel logic:
- `src/services/paymentService.ts`
- `src/services/providerSimulatorService.ts`
- `src/lib/idempotency/requestFingerprint.ts`
- `src/services/paymentAccessPolicy.ts`
- `src/app/api/payments/route.ts`
Reviewer should verify:
- `src/services/paymentService.ts` around `createPaymentWithIdempotency()` for replay vs conflict behavior.
- `src/services/providerSimulatorService.ts` around `resolveProviderSimulation()` for how partial failure is represented.
- `src/services/paymentAccessPolicy.ts` near `buildPaymentListScope()` because it is a data-leak boundary.
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: treating an idempotency collision with a different payload as a harmless replay.

### Slice 4
Purpose in one sentence: Add webhook processing, refunds, and state-machine enforcement.
Files containing novel logic:
- `src/services/webhookService.ts`
- `src/lib/domain/paymentStateMachine.ts`
- `src/services/refundService.ts`
- `src/app/api/payments/[paymentId]/refund/route.ts`
- `src/app/api/webhooks/provider/route.ts`
Reviewer should verify:
- `src/services/webhookService.ts` around the `providerEventId` dedupe check.
- `src/lib/domain/paymentStateMachine.ts` near `assertAllowedPaymentTransition()` and `assertRefundAllowed()`.
- `src/services/refundService.ts` near the `fullyRefunded` branch.
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: allowing repeated partial refunds to exceed the original payment amount.

### Slice 5
Purpose in one sentence: Add reconciliation operations, the admin debugging UI, and learning-oriented tests/docs.
Files containing novel logic:
- `src/services/reconciliationService.ts`
- `src/components/admin/ReconciliationPanel.tsx`
- `src/components/payments/PaymentDetailsCard.tsx`
- `tests/auth/authorization.test.ts`
- `tests/services/paymentStateMachine.test.ts`
- `docs/architecture/request-lifecycle.md`
Reviewer should verify:
- `src/services/reconciliationService.ts` around the `missingWebhookDelivery` branch.
- `src/components/admin/ReconciliationPanel.tsx` to confirm the UI exposes both delivery and reconciliation actions instead of only reports.
- `docs/architecture/request-lifecycle.md` to verify the documented flow still matches the real call chain.
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: a reconciliation report that identifies issues but provides no persisted issue history or operator workflow.
