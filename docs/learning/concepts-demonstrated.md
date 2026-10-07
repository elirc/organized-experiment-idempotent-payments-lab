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
Also see: `src/services/webhookService.ts` and `src/services/refundService.ts`, where those guards are used before writes. (Precision: `webhookService.ts:88` calls `assertAllowedPaymentTransition()` before its write; `refundService.ts:34` calls `assertRefundAllowed()` before opening its transaction, but the `REFUNDED` write at `refundService.ts:68-75` does not call `assertAllowedPaymentTransition()`.)
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

---

## Each concept as it actually appears in this code

The entries above say where to look. This section says what you will find when you get there — the specific mechanism, its exact boundary, and the gap a reviewer should notice. Line numbers were verified against the source.

### Idempotency — the concept the repo is named after

- **Mechanism.** A dedicated `IdempotencyRecord` table (`prisma/schema.prisma:121-136`) stores the key, a route string, a SHA-256 fingerprint of the parsed body, a status, and the response snapshot. The route string is hard-coded as `"POST:/api/payments"` (`src/services/paymentService.ts:66`), so the same key can be reused on a different route without conflict.
- **Fingerprint.** `stableStringify()` (`src/lib/idempotency/requestFingerprint.ts:9-25`) sorts object keys recursively with `localeCompare` before hashing, so `{a,b}` and `{b,a}` match (scratch check C1). It hashes the *parsed* body — after zod's `trim()` and `toUpperCase()` on currency (`paymentSchemas.ts:18`) — so `" usd"` and `"USD"` with the same key are treated as the same request, not a mismatch.
- **Atomicity.** Comes from the database: the insert is inside the transaction and the unique constraint serializes duplicates (see `docs/learning/flow-traces.md` Flow 7). The pre-read at `paymentService.ts:68` is an optimization only.
- **Replay contract.** `buildCompletedReplay()` (`:42-53`) returns the stored status code (falls back to 200 if null, though it is always stored as 202) and spreads the stored body with `replayed: true`.
- **Gaps.** No per-user scope (auth Finding A4); `CONFLICT` status and `lockedAt` are never used; no TTL or cleanup — records live forever; the browser hook mints a new key per call (`usePaymentActions.ts:32`), so the UI never benefits; refunds have no idempotency at all.
- **What a stronger implementation adds.** Scope the key to the caller; generate the key once per *user intent* (e.g. in component state when the form is opened) so retries reuse it; expire records after a retention window.

### Transactions as a consistency boundary

- **Where they are.** Payment create (`paymentService.ts:87`), webhook processing (`webhookService.ts:53`), refund (`refundService.ts:36`), reconciliation write-out (`reconciliationService.ts:102`).
- **What is inside vs outside.** The create path puts *everything* inside, including the simulated provider call — fine for a simulator, but with a real HTTP provider this would hold a database transaction open across a network call. The webhook and refund paths do their *reads* outside the transaction (`webhookService.ts:30-49`, `refundService.ts:25-34`) and their writes inside, which is the root cause of the refund race and of the webhook path comparing against a possibly stale `payment.status`.
- **Rollback trap.** Writing an error record through `tx` and then re-throwing (`webhookService.ts:123-127`) erases the error record. If you want a durable failure log, write it outside the failed transaction.
- **Reconciliation is split.** The `ReconciliationRun` row is created outside the transaction (`reconciliationService.ts:24`) so a crash still leaves a `RUNNING` or `FAILED` run row (`:139-143`) — a deliberate and useful choice.

### State machine

- **Mechanism.** A lookup table `allowedTransitions` (`src/lib/domain/paymentStateMachine.ts:10-15`) and a guard that treats same-state as a no-op (`:21-23`).
- **Mapping.** `resolveLocalStatusFromProviderStatus()` (`:34-48`) collapses provider `RECEIVED`/`PROCESSING` to local `PENDING`. An unknown provider status returns `undefined` (scratch check C6); since the webhook payload is never validated, this is reachable from the public webhook route, where it ends in a Prisma enum error and a 500.
- **Coverage.** Called on the webhook path only. The refund path writes `REFUNDED` directly. The provider mirror has no state machine at all (`providerRepository.ts:40-55`).

### Ownership / data isolation

- **Mechanism.** `buildPaymentListScope()` returns `{}` or `{ ownerUserId }` (`src/services/paymentAccessPolicy.ts:35-42`), which `listPayments()` spreads into a Prisma `where` (`paymentRepository.ts:69-73`) — passing `ownerUserId: undefined` means "no filter" in Prisma, which is how the staff branch shows everything.
- **Reality check.** No current route lets a role without `PAYMENT_READ_ANY` reach this code (see the matrix in `docs/architecture/auth-and-permissions.md`). The isolation logic is correct but dormant.

### RBAC

- **Mechanism.** A static role→permission map (`src/lib/permissions.ts:20-37`), a pure gate (`src/lib/auth/authorization.ts:16-26`) and a Next.js wrapper (`src/lib/auth/guards.ts:20-36`).
- **Gap.** The wrapper throws instead of returning a response (Finding A1). `OPS` and `ADMIN` have identical permission lists (`permissions.ts:23-36`), so "admin" grants nothing extra in this codebase.

### Audit trail via `PaymentEvent`

- **Mechanism.** Every service appends through `createPaymentEvent()` (`src/repositories/paymentEventRepository.ts:11-24`). `actorUserId` is set for human actions and omitted for `provider-simulator` / `provider-webhook` (`providerSimulatorService.ts:119`, `webhookService.ts:80`).
- **Gap.** Because the webhook route is unauthenticated, `actorLabel: "provider-webhook"` asserts an identity that was never verified. Rejected webhooks leave no event (rollback).

### Async workflow / outbox-like delivery

- **Mechanism.** `WebhookDelivery` rows are written in the create transaction (`providerSimulatorService.ts:130-147`) — the same shape as a transactional outbox: the "message" commits atomically with the business row. `deliverPendingWebhooks()` (`:157-186`) is the relay, triggered manually from the UI.
- **Gaps.** No claim/lock, so concurrent relays double-process (Flow 8); `FAILED` rows are never retried despite `nextAttemptAt`; the relay calls `processProviderWebhook()` in-process, so it does not exercise the HTTP route, its (absent) authentication, or network failure.

### Reconciliation

- **Mechanism.** Loads all payments and all provider mirrors with two unscoped `findMany` calls in parallel (`reconciliationService.ts:29-32`), joins them in memory by `paymentId` (`:34`), and classifies.
- **Gaps.** Unbounded loads (every payment in the table, every run); not a consistent snapshot (the two queries are separate statements); never corrects state; never closes issues, so the same payment is re-flagged on every run; two of four issue types are unreachable through app code (see `docs/architecture/domain-model.md`).

### Validation boundary

- **Mechanism.** zod schemas parsed in routes (`src/app/api/payments/route.ts:11`, `.../refund/route.ts:11`). Refund reason must be 5–200 chars and not exactly `"test"` (case-insensitive, `paymentSchemas.ts:24-37`).
- **Gaps.** The webhook route has no schema (`src/app/api/webhooks/provider/route.ts:6`). Invalid JSON in any body throws a `SyntaxError` from `request.json()` that `jsonError()` maps to a 500, not a 400 (`route-helpers.ts:43-53`).

## Concept check ladder

1. **Goal:** explain why the create path is safe under concurrency. **Check:** name the schema line and the catch block that together make it safe, and the PostgreSQL behaviour they rely on.
2. **Goal:** distinguish "outbox" from "retry". **Check:** point to the line that makes delivery rows atomic with payments, and the line that prevents failed rows from being retried.
3. **Goal:** see the transaction-scope pattern. **Check:** for each of the four transactions listed above, list which reads happen before `$transaction` and say whether a concurrent writer could invalidate them.
