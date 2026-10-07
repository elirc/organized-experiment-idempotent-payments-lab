# Load-Bearing Files

## src/services/paymentService.ts
- What it does: Owns idempotent payment creation, request hashing, replay behavior, transaction orchestration, and provider dispatch.
- What calls it: `src/app/api/payments/route.ts`
- What it calls: `src/lib/idempotency/requestFingerprint.ts`, `src/repositories/idempotencyRepository.ts`, `src/services/paymentAccessPolicy.ts`, `src/repositories/paymentRepository.ts`, `src/repositories/paymentEventRepository.ts`, `src/services/providerSimulatorService.ts`
- What would break or become insecure if this file were wrong: Duplicate charges, unsafe retries, or owner-override bugs would appear at the main payment entrypoint.
- What a junior engineer would likely miswrite here: They would stop at a unique idempotency key and never store a replayable response body or request fingerprint.

## src/services/webhookService.ts
- What it does: Processes provider webhook events idempotently and applies legal state transitions.
- What calls it: `src/app/api/webhooks/provider/route.ts`, `src/services/providerSimulatorService.ts`
- What it calls: `src/repositories/webhookRepository.ts`, `src/repositories/providerRepository.ts`, `src/repositories/paymentRepository.ts`, `src/lib/domain/paymentStateMachine.ts`, `src/repositories/paymentEventRepository.ts`
- What would break or become insecure if this file were wrong: Duplicate webhooks could double-apply side effects or invalid transitions could rewrite terminal states.
- What a junior engineer would likely miswrite here: They would key idempotency on payment id instead of provider event id.

## src/services/reconciliationService.ts
- What it does: Compares local and provider truth and stores actionable issues.
- What calls it: `src/app/api/admin/reconciliation/run/route.ts`, `src/app/api/admin/reconciliation/issues/route.ts`
- What it calls: `src/repositories/paymentRepository.ts`, `src/repositories/providerRepository.ts`, `src/repositories/reconciliationRepository.ts`, `src/lib/domain/paymentStateMachine.ts`, `src/repositories/paymentEventRepository.ts`
- What would break or become insecure if this file were wrong: Partial failures would stay invisible and operators would have no systematic way to detect inconsistencies.
- What a junior engineer would likely miswrite here: They would compare only row existence and ignore semantic mismatches like `PENDING` locally vs `SUCCEEDED` at the provider.

## src/lib/auth/guards.ts
- What it does: Bridges Next.js routes/pages to shared auth and permission logic.
- What calls it: Most API routes under `src/app/api/**` and admin pages under `src/app/admin/**`
- What it calls: `src/lib/auth/session.ts`, `src/lib/auth/authorization.ts`
- What would break or become insecure if this file were wrong: Protected operations could be exposed even though the policy layer exists.
- What a junior engineer would likely miswrite here: They would secure the page and forget the underlying API route.

## src/services/paymentAccessPolicy.ts
- What it does: Centralizes ownership checks and list scoping for payment visibility.
- What calls it: `src/services/paymentService.ts`, `src/services/paymentQueryService.ts`
- What it calls: `src/lib/auth/authorization.ts`, `src/lib/permissions.ts`, `src/lib/errors.ts`
- What would break or become insecure if this file were wrong: Customer data isolation would fail first at list endpoints.
- What a junior engineer would likely miswrite here: They would check ownership in the detail route but not in the list query scope.

## prisma/schema.prisma
- What it does: Defines the relational shape of payments, provider mirrors, webhooks, refunds, reconciliation, and sessions.
- What calls it: Prisma Client generation and every repository in `src/repositories/**`
- What it calls: No runtime code, but it shapes every query and transaction in the app.
- What would break or become insecure if this file were wrong: Missing uniqueness, missing relations, or under-modeled entities would erase whole classes of correctness guarantees.
- What a junior engineer would likely miswrite here: They would collapse provider state and local state into one table and lose reconciliation capability.

## src/repositories/paymentRepository.ts
- What it does: Holds the authoritative payment queries used by both write and read services.
- What calls it: `src/services/paymentService.ts`, `src/services/webhookService.ts`, `src/services/refundService.ts`, `src/services/reconciliationService.ts`, `src/services/paymentQueryService.ts`
- What it calls: Prisma through `src/lib/db.ts`
- What would break or become insecure if this file were wrong: Services would make decisions on incomplete or stale payment shapes, especially around refunds and webhook history.
- What a junior engineer would likely miswrite here: They would under-fetch related rows and re-query ad hoc in the service layer.

## src/lib/domain/paymentStateMachine.ts
- What it does: Encodes legal payment/refund state transitions as pure rules.
- What calls it: `src/services/webhookService.ts`, `src/services/refundService.ts`, `src/services/reconciliationService.ts` (precision: the webhook service uses both the mapper and the transition guard; the refund service uses only `assertRefundAllowed()`; reconciliation uses only `resolveLocalStatusFromProviderStatus()` to compute an expected status and never writes one)
- What it calls: `src/lib/errors.ts`
- What would break or become insecure if this file were wrong: Invalid state rewrites would quietly corrupt operational truth.
- What a junior engineer would likely miswrite here: They would let every service choose its own transition rules.

---

## Files the list above leaves out, but that carry real weight

### src/lib/idempotency/requestFingerprint.ts
- What it does: `stableStringify()` (lines 9-25) recursively sorts object keys and serializes; `buildRequestFingerprint()` (27-29) SHA-256s the result.
- What calls it: `src/services/paymentService.ts:67`.
- What would break if wrong: hash drift on key order would turn every legitimate retry into `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`; a hash that ignored a field (say `amountMinor`) would replay a 10-unit response to a 1000-unit request.
- Verified: scratch checks C1–C4 (`docs/learning/testing-rationale.md`) — key-order independent, sensitive to value changes, and distinguishes an explicit `undefined` key from an absent one.

### src/repositories/idempotencyRepository.ts
- What it does: find by the compound unique `route_key` (lines 11-20), create as `IN_PROGRESS` (22-39), mark `COMPLETED` with the response (41-62). `markIdempotencyConflict()` (64-72) is never called.
- What would break if wrong: if `createIdempotencyRecord` were not passed the transaction client (it is, at `paymentService.ts:94`), the record would commit even when the payment rolled back, permanently "using up" the key with an `IN_PROGRESS` row that no code ever completes.

### src/services/refundService.ts
- What it does: the only money-out path. Reads payment and prior refunds (lines 25-32), asserts (34), then in one transaction inserts the refund, marks it `SUCCEEDED`, and flips the payment to `REFUNDED` on an exact full refund (36-101).
- What would break if wrong: this file is where over-refunds happen — and under concurrency they do (Flow 9 in `docs/learning/flow-traces.md`).
- What a junior engineer would likely miswrite here: reading the refund sum outside the transaction, which is what this file does. The senior note at line 78 warns about partial refunds flipping status; the more serious issue is that `fullyRefunded` (65) is computed from a sum that may already be stale.

### src/repositories/webhookRepository.ts
- What it does: outbound `WebhookDelivery` lifecycle (11-65) and inbound `WebhookEvent` lifecycle (67-111).
- What would break if wrong: the `PENDING`-only filter at line 32 is why a failed delivery never comes back; changing it to also select `FAILED` rows whose `nextAttemptAt <= now` is the smallest change that makes retries real.

### src/app/api/webhooks/provider/route.ts
- What it does: 14 lines; parses JSON with an identity cast and calls `processProviderWebhook()`.
- What would break or become insecure if wrong: it is already the least protected write path in the app — unauthenticated, unsigned, unvalidated (Finding L5 in `docs/architecture/request-lifecycle.md`).

### src/hooks/usePaymentActions.ts
- What it does: client mutations with cache invalidation.
- Why it is load-bearing for correctness, not just UX: line 32 decides whether retries are idempotent. Today it generates a fresh key per call.

## Corrections to the entries above

- `src/services/webhookService.ts` — "Processes provider webhook events idempotently" holds for sequential duplicates. Concurrent duplicates are stopped by the database constraint but surface as errors, and rejected events are not persisted (the rejection write is rolled back, `webhookService.ts:123-127`).
- `src/services/reconciliationService.ts` — "stores actionable issues" is accurate, but issues are never resolved by any code path, and each run re-inserts an issue for every still-mismatched payment.
- `src/lib/auth/guards.ts` — in addition to the risk listed, this file currently has two concrete defects: auth errors thrown at line 32 bypass `jsonError()`, and line 10 imports `RouteError` from a module that does not export it (Findings A1, A2 in `docs/architecture/auth-and-permissions.md`).
- `src/services/paymentAccessPolicy.ts` — "Customer data isolation would fail first at list endpoints." True of the design; today no list endpoint is reachable by a customer, so nothing would leak until one is added.

## Blast-radius exercise

**Goal:** rank files by how much damage a one-line mistake could do. **Check:** for each file below, write the single-line change that would cause the worst outcome, then compare with these answers.
- `prisma/schema.prisma:135` — drop the unique → concurrent duplicates create duplicate payments.
- `src/services/paymentService.ts:94` — pass `prisma` instead of `tx` → keys stuck `IN_PROGRESS` after rollbacks.
- `src/lib/permissions.ts:22` — add `PAYMENT_REFUND` to `SUPPORT` → support can move money.
- `src/services/paymentAccessPolicy.ts:41` — return `{}` → every customer sees every payment (once a customer read route exists).
- `src/lib/domain/paymentStateMachine.ts:13` — allow `FAILED → SUCCEEDED` → a forged or late webhook can resurrect a declined payment.
