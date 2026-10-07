# Request Lifecycle

This file has two layers. The four short "Request:" summaries give the call chain at file/function granularity. The "Line-level traces" section further down pins each step to line numbers and records the places where the summary is wrong or incomplete. Corrections are marked inline.

Request: Create a payment request with idempotency
1. `src/app/api/payments/route.ts` — `POST` receives the request, extracts the `Idempotency-Key` header, and parses the body with `createPaymentSchema.parse()`. (Execution order note: step 2's wrapper runs *before* this body — see Trace A.)
2. `src/lib/auth/guards.ts` — `withRouteAuth()` resolves the cookie session through `getSessionForRequest()` and enforces `Permission.PAYMENT_CREATE`.
3. `src/services/paymentService.ts` — `createPaymentWithIdempotency()` hashes the request with `buildRequestFingerprint()` and checks for an existing `IdempotencyRecord`.
4. `src/repositories/idempotencyRepository.ts` — `findIdempotencyRecord()` and `createIdempotencyRecord()` either replay, reject, or open a new in-progress record.
5. `src/services/paymentAccessPolicy.ts` — `resolvePaymentOwnerForCreate()` decides who owns the payment and rejects unauthorized owner overrides.
6. `src/repositories/paymentRepository.ts` — `createPayment()` inserts the local `PENDING` payment row.
7. `src/repositories/paymentEventRepository.ts` — `createPaymentEvent()` appends `PAYMENT_CREATED`.
8. `src/services/providerSimulatorService.ts` — `dispatchPaymentToProvider()` creates a provider mirror, payment attempt, and optional webhook delivery.
9. `src/repositories/idempotencyRepository.ts` — `markIdempotencyCompleted()` stores the replayable API response snapshot.
10. Returns `202` with `{ paymentId, reference, status, providerPaymentId, providerStatus, queuedWebhook, replayed }`

Request: Process a provider webhook and finalize payment status
1. `src/app/api/webhooks/provider/route.ts` — `POST` receives the provider payload and forwards it to `processProviderWebhook()`.
2. `src/services/webhookService.ts` — `processProviderWebhook()` first checks `findWebhookEventByProviderEventId()` for replay safety.
3. `src/repositories/providerRepository.ts` — `findProviderPaymentByExternalId()` resolves the provider mirror row.
4. `src/repositories/paymentRepository.ts` — `findPaymentById()` loads the local payment that will be updated.
5. `src/lib/domain/paymentStateMachine.ts` — `resolveLocalStatusFromProviderStatus()` maps provider truth into local state and `assertAllowedPaymentTransition()` blocks illegal jumps.
6. `src/repositories/webhookRepository.ts` — `createWebhookEvent()` writes the inbound event row inside the same transaction as the mutation, then `markWebhookEventProcessed()` finalizes it. (Correction: earlier wording said "persists the inbound event before mutation". It is written first *within* the transaction, so if processing fails the event row is rolled back with everything else — see Finding L3.)
7. `src/repositories/paymentRepository.ts` — `transitionPaymentStatus()` updates the local payment.
8. `src/repositories/paymentEventRepository.ts` — `createPaymentEvent()` appends `WEBHOOK_RECEIVED` and `STATUS_CHANGED`.
9. Returns `202` with `{ duplicate, paymentId, status }`

Request: Run reconciliation after a partial failure
1. `src/app/api/admin/reconciliation/run/route.ts` — `POST` is called from the admin UI.
2. `src/lib/auth/guards.ts` — `withRouteAuth()` enforces `Permission.RECONCILIATION_RUN`.
3. `src/services/reconciliationService.ts` — `runReconciliation()` creates a `ReconciliationRun`.
4. `src/repositories/paymentRepository.ts` — `listPaymentsForReconciliation()` loads local payments plus queued webhook deliveries.
5. `src/repositories/providerRepository.ts` — `listProviderPayments()` loads the provider mirror set.
6. `src/services/reconciliationService.ts` — `runReconciliation()` compares `payment.status` to `resolveLocalStatusFromProviderStatus(providerPayment.status)` and detects `MISSING_WEBHOOK_DELIVERY`, `STATUS_MISMATCH`, `MISSING_LOCAL_PAYMENT`, or `MISSING_PROVIDER_PAYMENT`.
7. `src/repositories/reconciliationRepository.ts` — `createReconciliationIssues()` stores the issues and `completeReconciliationRun()` closes the run.
8. `src/repositories/paymentEventRepository.ts` — `createPaymentEvent()` appends `RECONCILIATION_FLAGGED` for affected payments.
9. Returns `202` with `{ runId, issueCount }`

Request: Rejection path when Support tries to run reconciliation
1. `src/app/api/admin/reconciliation/run/route.ts` — `POST` enters the route.
2. `src/lib/auth/guards.ts` — `withRouteAuth()` calls `requirePermission()`.
3. `src/lib/auth/authorization.ts` — `requirePermission()` checks `src/lib/permissions.ts` and sees that `SUPPORT` lacks `Permission.RECONCILIATION_RUN`.
4. ~~`src/lib/api/route-helpers.ts` — `jsonError()` converts the thrown `RouteError` into an API response.~~ **Correction (code review, 2026-10):** this step does not happen. `requirePermission()` is called at `src/lib/auth/guards.ts:32`, inside the wrapper but *outside* the handler. The only `try { ... } catch { return jsonError(error) }` lives inside the handler body (`src/app/api/admin/reconciliation/run/route.ts:9-14`). The `RouteError` therefore propagates out of the wrapper un-serialized.
5. ~~Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`~~ **Correction:** the client receives whatever Next.js does with an uncaught exception thrown from a route handler (an unstructured 500 response), not the documented JSON `403`. See "Finding L1" below. The same applies to the `401 UNAUTHENTICATED` branch at `src/lib/auth/authorization.ts:17-19`.

---

## Line-level traces (verified against the source)

The four summaries above name files and functions. The sections below pin each step to line numbers and record what the code does at every step, including the places where the summary over-promises. Every line number was read from the file at the commit this doc ships with; if you edit a file, re-check the numbers it carries.

### Trace A — `POST /api/payments` (idempotent create)

Order of execution is wrapper first, route body second — the summary's steps 1 and 2 are listed the other way round.

| # | Location | What actually happens |
|---|----------|-----------------------|
| A1 | `src/lib/auth/guards.ts:28-31` | The exported `POST` is the closure returned by `withRouteAuth()`. |
| A2 | `src/lib/auth/guards.ts:32` | `getSessionForRequest(request)` then `requirePermission(..., PAYMENT_CREATE)`. Throws on no session or wrong role — un-caught (Finding L1). |
| A3 | `src/lib/auth/session.ts:24-34` | Cookie token → `findSessionByToken()` → `null` if missing or `expiresAt < now`. Expired rows are not deleted. |
| A4 | `src/app/api/payments/route.ts:11` | `parseJson()` (`src/lib/api/route-helpers.ts:56-59`) calls `request.json()` then `createPaymentSchema.parse()`. Invalid JSON throws a `SyntaxError`, which `jsonError()` maps to a generic 500 (`route-helpers.ts:43-53`), not a 400. |
| A5 | `src/app/api/payments/route.ts:14` | Reads the `Idempotency-Key` header; may be `null`. |
| A6 | `src/services/paymentService.ts:62-64` | Missing key → `400 MISSING_IDEMPOTENCY_KEY`. |
| A7 | `src/services/paymentService.ts:66-67` | `route = "POST:/api/payments"`; `requestHash = buildRequestFingerprint(input.body)`. The hash covers the parsed body only — not `session.userId`. |
| A8 | `src/services/paymentService.ts:68` | Optimistic pre-check: `findIdempotencyRecord(route, key)` *outside* any transaction. |
| A9 | `src/services/paymentService.ts:70-84` | Found → hash mismatch is `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` (line 71); `COMPLETED` with a body → replay (79-80); anything else → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` (83). |
| A10 | `src/services/paymentService.ts:87-95` | Opens `prisma.$transaction` and inserts the `IN_PROGRESS` record *inside* it (`idempotencyRepository.ts:30-38`). The `@@unique([route, key])` at `prisma/schema.prisma:135` is what makes this atomic. |
| A11 | `src/services/paymentService.ts:97-102` | Owner resolution (`paymentAccessPolicy.ts:12-33`) and existence check — inside the transaction, so a `404 OWNER_NOT_FOUND` rolls the idempotency row back too. |
| A12 | `src/services/paymentService.ts:104-132` | `createPayment()` (status forced to `PENDING` at `paymentRepository.ts:49`) and the `PAYMENT_CREATED` event. |
| A13 | `src/services/paymentService.ts:134-140` | `dispatchPaymentToProvider(..., tx)` — attempt, provider mirror, provider view on `Payment`, `PROVIDER_ACCEPTED` event and (unless `PARTIAL_SUCCESS`) a `WebhookDelivery`, all in the same transaction (`providerSimulatorService.ts:71-147`). |
| A14 | `src/services/paymentService.ts:152-161` | `markIdempotencyCompleted()` stores `responseStatusCode: 202` and the body. |
| A15 | `src/services/paymentService.ts:168-191` | On `P2002` (unique violation) the record is re-read *outside* the failed transaction and the same three-way decision as A9 is made. Any other error is re-thrown (190). |

**What makes the create path atomic.** In PostgreSQL an `INSERT` that collides with an *uncommitted* row on a unique index waits for the other transaction to finish. So for two concurrent requests with the same key: request 2's insert at A10 blocks until request 1 commits, then fails with `P2002`, and A15 finds a `COMPLETED` record and replays it. If request 1 rolls back (e.g. `OWNER_NOT_FOUND`), request 2's insert succeeds and it executes normally. The check-then-insert at A8 is therefore only an optimization; the database constraint is the real guard. This is a correct design — and the most important thing in the repo to understand.

**Consequence the docs do not mention.** Because the `IN_PROGRESS` row is written and flipped to `COMPLETED` inside the same transaction, no other session can ever *observe* `IN_PROGRESS`. The `IDEMPOTENCY_REQUEST_IN_PROGRESS` branches at lines 83 and 187 are effectively unreachable under PostgreSQL's default isolation, and `lockedAt` (`schema.prisma:131`) is written but never read anywhere in `src/`. The design trades "in-progress" visibility for simplicity: a long-running provider call would hold a row lock and make duplicates *wait* instead of fail fast.

### Trace B — `POST /api/webhooks/provider`

| # | Location | What actually happens |
|---|----------|-----------------------|
| B1 | `src/app/api/webhooks/provider/route.ts:4-6` | No `withRouteAuth`, no signature check (the SENIOR NOTE at line 8 admits this). `parseJson` is given an identity cast — no schema. |
| B2 | `src/services/webhookService.ts:29` | `payload as ProviderWebhookPayload` — a TypeScript cast, not validation. |
| B3 | `src/services/webhookService.ts:30-37` | Dedupe pre-check by `providerEventId`, outside a transaction. Only `PROCESSED` short-circuits. |
| B4 | `src/services/webhookService.ts:39-49` | Provider mirror and local payment loaded outside the transaction; missing → `404`, with no `WebhookEvent` row recorded. |
| B5 | `src/services/webhookService.ts:51` | `resolveLocalStatusFromProviderStatus()`; an unknown status string returns `undefined` (the `switch` at `paymentStateMachine.ts:37-47` has no default). |
| B6 | `src/services/webhookService.ts:53-65` | Transaction opens; a `RECEIVED` `WebhookEvent` row is created unless one was found at B3. |
| B7 | `src/services/webhookService.ts:68-75` | Provider mirror status overwritten with the payload status — no transition check on the provider side. |
| B8 | `src/services/webhookService.ts:87-114` | If local status differs: `assertAllowedPaymentTransition()` (88), `transitionPaymentStatus()` (90-99), `STATUS_CHANGED` event (101-113). Note the comparison uses `payment.status` read at B4, outside the transaction. |
| B9 | `src/services/webhookService.ts:116` | `markWebhookEventProcessed()`. |
| B10 | `src/services/webhookService.ts:123-127` | On error: `markWebhookEventRejected(..., tx)` then `throw`. Because the throw aborts the interactive transaction, the `REJECTED` update **and** the event row from B6 are rolled back (Finding L3). |

### Trace C — `POST /api/payments/[paymentId]/refund`

| # | Location | What actually happens |
|---|----------|-----------------------|
| C1 | `src/app/api/payments/[paymentId]/refund/route.ts:7-8` | `PAYMENT_REFUND` (OPS, ADMIN only per `permissions.ts:23-36`). No `Idempotency-Key` is read. |
| C2 | `src/services/refundService.ts:25-29` | `findPaymentById()` — no transaction, no row lock. |
| C3 | `src/services/refundService.ts:31-32` | `sumSuccessfulRefundsForPayment()` (`refundRepository.ts:28-40`) and `remaining = amount - refunded`. |
| C4 | `src/services/refundService.ts:34` | `assertRefundAllowed(status, amount, remaining)` against the values from C2/C3. |
| C5 | `src/services/refundService.ts:36-60` | Transaction: insert `PENDING` refund, `REFUND_REQUESTED` event. |
| C6 | `src/services/refundService.ts:62-63` | Refund flipped straight to `SUCCEEDED` with a fabricated `prov_ref_*` id — no provider round-trip, so `REFUND_FAILED` (`schema.prisma:52`) is never emitted. |
| C7 | `src/services/refundService.ts:65-76` | `fullyRefunded` computed from the *stale* sum from C3; on equality the payment is moved to `REFUNDED` **without** calling `assertAllowedPaymentTransition()`. |
| C8 | `src/services/refundService.ts:79-100` | `REFUND_SUCCEEDED` event and the response. Route returns `202` even though the refund is already `SUCCEEDED`. |

Because C2–C4 happen before the transaction and nothing locks the payment row, two concurrent refunds can both pass C4 (Finding L2).

### Trace D — `POST /api/admin/webhooks/deliver`

| # | Location | What actually happens |
|---|----------|-----------------------|
| D1 | `src/app/api/admin/webhooks/deliver/route.ts:11-12` | Reads raw text; empty body → `{}` → `limit` defaults to 10 (`reconciliationSchemas.ts:9-11`). |
| D2 | `src/services/providerSimulatorService.ts:158` | `listPendingWebhookDeliveries(limit)` — `status: PENDING` only (`webhookRepository.ts:29-37`). No claim/lock, so two concurrent clicks process the same rows. |
| D3 | `src/services/providerSimulatorService.ts:161-179` | Sequential loop: `processProviderWebhook(delivery.payload)` in-process (not over HTTP), then `markWebhookDeliveryDelivered` or `markWebhookDeliveryFailed`. |
| D4 | `src/repositories/webhookRepository.ts:53-65` | A failure sets `status: FAILED` and `nextAttemptAt = now + 60s`. Nothing ever queries `nextAttemptAt` or re-selects `FAILED` rows, so a failed delivery is never retried (Finding L4). |

---

## Findings from the line-level review

**L1 — Auth rejections are not serialized as JSON.** Evidence: `src/lib/auth/guards.ts:32` throws before `handler(...)` at line 34 runs; every handler's `try/catch` (for example `src/app/api/payments/route.ts:10-21`) is inside `handler`. Consequence: the `401`/`403` bodies documented in this file and in `docs/learning/flow-traces.md` are not what a client receives. Verified with a scratch model of the wrapper structure (see `docs/learning/testing-rationale.md`, check C12). Fix shape: wrap line 32 in `try { ... } catch (e) { return jsonError(e); }`.

**L2 — Refund amount check is not concurrency-safe.** Evidence: `src/services/refundService.ts:31-34` read and assert outside the transaction opened at line 36; `prisma/schema.prisma:244-258` has no constraint that bounds the sum. Two concurrent 60-unit refunds on a 100-unit payment both pass and both become `SUCCEEDED` (120 refunded); two concurrent 50-unit refunds total 100 but `fullyRefunded` is `false` in both, so the payment stays `SUCCEEDED`. Reproduced in a scratch model (checks C9, C10). Fix shape: `SELECT ... FOR UPDATE` on the payment inside the transaction (raw query in Prisma), or a serializable transaction with retry, and recompute the sum inside it.

**L3 — Webhook rejections are never persisted.** Evidence: `src/services/webhookService.ts:123-127` writes `REJECTED` through `tx` and then re-throws inside the same `prisma.$transaction` callback, so Prisma rolls the write back. The `processingError` field shown in the detail UI is therefore always empty in practice, and the `existingEvent` branch at line 55 can only ever see a `PROCESSED` row (which already returned at line 32). Fix shape: catch outside the transaction and record the rejection in a second, independent write.

**L4 — Failed outbound deliveries are dead letters.** Evidence: `webhookRepository.ts:62` schedules `nextAttemptAt`, but `listPendingWebhookDeliveries()` filters `status: PENDING` only (line 32) and no other code reads `nextAttemptAt`. The `@@index([status, nextAttemptAt])` at `schema.prisma:211` supports a query that does not exist.

**L5 — The webhook endpoint is an unauthenticated state-mutation API.** Evidence: `src/app/api/webhooks/provider/route.ts:4-10` (no guard, no signature, no schema). Anyone who knows a `prov_pay_*` id can post `{"providerEventId":"x","providerPaymentId":"prov_pay_...","status":"REFUNDED","eventType":"payment.updated"}` and move a `SUCCEEDED` payment to `REFUNDED` (allowed by `paymentStateMachine.ts:12`) with no `Refund` row, or a `PENDING` payment to `FAILED`. The repo's SENIOR NOTE acknowledges the missing signature; the docs elsewhere describe this route as "replay-safe", which is true only for honest senders.
