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
One thing a junior reviewer would approve without questioning that a stronger reviewer would flag: a reconciliation report that identifies issues but provides no persisted issue history or operator workflow. (Post-review note: the history is persisted, but the workflow is not — no code path sets an issue to `RESOLVED` or `IGNORED`, so the "operator workflow" this slice warns about is still missing.)

## Stage 7 — Post-hoc code review (2026-10)

This stage was not part of the original build. It records what a line-by-line review of the finished code found when each slice's "reviewer should verify" list was actually checked. It is written in the same format as the slices so it can be read as "what the reviewer would have said".

### Slice 1 review — schema and persistence
- Verified: `@@unique([route, key])` (`prisma/schema.prisma:135`) is present and is what makes concurrent creates safe. `ProviderPayment.paymentId` is `@unique` (`:182`), so the mirror is genuinely 1:1.
- Missed: the unique scope does not include the caller, so keys are global (auth Finding A4). `lockedAt`, `CONFLICT`, `nextAttemptAt`, `REFUND_FAILED`, `RECONCILIATION_CLEARED`, `RESOLVED`/`IGNORED` are modelled but never used (full list in `docs/architecture/domain-model.md`).
- Missed: there is no `prisma/migrations/` directory in the repo; the schema can only be applied with `prisma migrate dev` (the `prisma:migrate` script), which generates migrations locally.

### Slice 2 review — auth and RBAC
- Verified: permission checks do happen before handler logic (`src/lib/auth/guards.ts:32`), and expired sessions are rejected server-side (`src/lib/auth/session.ts:32`).
- Missed: because the check happens *outside* the handler, its errors bypass `jsonError()` — clients get a 500, not the 401/403 the docs promised (Finding A1).
- Missed: `guards.ts:10` imports `RouteError` from `../api/route-helpers`, which does not export it (Finding A2). A type-check in CI would have caught this; the repo has no `typecheck` script.
- Missed: `LoginForm.tsx:24` routes every role to `/admin/payments`, including `CUSTOMER`, who is not allowed there.

### Slice 3 review — idempotent create
- Verified: a key reused with a different payload is rejected with `409` on both the fast path (`paymentService.ts:71`) and the race path (`:175`), as the slice asked.
- Missed: the browser client generates a fresh key per call (`src/hooks/usePaymentActions.ts:32`), so the UI never exercises replay.
- Missed: `NETWORK_UNKNOWN` behaves exactly like `SUCCEED` apart from a string in `PaymentAttempt.responsePayload` (`providerSimulatorService.ts:84`); the "ambiguous network" scenario is labelled, not modelled.

### Slice 4 review — webhooks, refunds, state machine
- Verified: `assertRefundAllowed()` checks against the *remaining* amount (`refundService.ts:32-34`), so sequential partial refunds cannot exceed the original — the exact bug this slice flagged.
- Missed: the same check is not concurrency-safe; two simultaneous refunds both pass (Finding L2, reproduced in scratch checks C9/C10).
- Missed: the rejected-webhook record is written through the transaction that is then rolled back (Finding L3).
- Missed: the provider webhook route is unauthenticated and unvalidated — acknowledged by the SENIOR NOTE at `src/app/api/webhooks/provider/route.ts:8`, but the docs elsewhere called the path "replay-safe" without qualification.

### Slice 5 review — reconciliation and UI
- Verified: the `missingWebhookDelivery` branch (`reconciliationService.ts:61-64`) correctly distinguishes "no delivery was ever queued" from "delivery queued but not yet processed".
- Missed: two of the four issue types cannot be produced by the app's own writes (`domain-model.md`, "Which rows does each simulation mode produce?").
- Missed: issues are never closed, so each run re-flags the same payment; the issues list is capped at 50 rows (`reconciliationRepository.ts:79`), so old runs eventually push current ones out of view only by recency, not by status.

### What I would change first, in order
1. Move `guards.ts:32` inside a `try` that returns `jsonError()`, and fix the `guards.ts:10` import. Two small edits; they make every auth failure observable and correct.
2. Make refunds safe: lock the payment row inside the transaction and recompute the refunded sum there. Add an idempotency key to the refund route.
3. Record webhook rejections outside the failed transaction; validate the payload with a zod schema; add a shared-secret HMAC check on the webhook route.
4. Retry `FAILED` deliveries whose `nextAttemptAt` has passed; add a claim step so two relays cannot process the same row.
5. Generate the idempotency key once per form intent in the client.
