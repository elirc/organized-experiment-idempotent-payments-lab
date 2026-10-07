# Flow Traces

## Flow: Create payment from the admin console
1. `src/components/payments/PaymentCreateForm.tsx` — submit button calls `createPayment.mutateAsync()`
2. `src/hooks/usePaymentActions.ts` — `useCreatePayment()` sends `POST /api/payments` with an `Idempotency-Key`
3. `src/app/api/payments/route.ts` — route handler parses `createPaymentSchema`
4. `src/lib/auth/guards.ts` — `withRouteAuth()` checks `Permission.PAYMENT_CREATE`
5. `src/services/paymentService.ts` — `createPaymentWithIdempotency()` hashes the request and opens/replays the idempotency record
6. `src/services/paymentAccessPolicy.ts` — `resolvePaymentOwnerForCreate()` enforces owner selection rules
7. `src/repositories/paymentRepository.ts` — `createPayment()` inserts the local payment
8. `src/services/providerSimulatorService.ts` — `dispatchPaymentToProvider()` creates the provider mirror and optional webhook delivery
9. `src/repositories/idempotencyRepository.ts` — `markIdempotencyCompleted()` stores the replay response
10. Returns `202` and `src/hooks/usePaymentActions.ts` invalidates `paymentListQueryKey`

## Flow: Support user is rejected from reconciliation
1. `src/components/admin/ReconciliationPanel.tsx` — UI could try to trigger reconciliation
2. `src/hooks/useReconciliation.ts` — `useRunReconciliation()` calls `POST /api/admin/reconciliation/run`
3. `src/app/api/admin/reconciliation/run/route.ts` — route handler begins
4. `src/lib/auth/guards.ts` — `withRouteAuth()` calls `requirePermission()`
5. `src/lib/auth/authorization.ts` — `requirePermission()` rejects because `SUPPORT` lacks `Permission.RECONCILIATION_RUN`
6. ~~`src/lib/api/route-helpers.ts` — `jsonError()` returns the structured `403`~~ **Correction:** `requirePermission()` runs at `src/lib/auth/guards.ts:32`, outside the handler's `try/catch` (`src/app/api/admin/reconciliation/run/route.ts:9-14`), so `jsonError()` is never called for this error.
7. ~~Returns `{ error: { code: "FORBIDDEN" } }`~~ **Correction:** the `RouteError` escapes the route handler and Next.js answers with an unstructured server error. `fetchJson()` (`src/hooks/apiClient.ts:16-26`) then fails to find `error.message` in the body and throws the generic `"Request failed."`. In practice SUPPORT never gets here through the UI, because `src/app/admin/reconciliation/page.tsx:6` gates the page — but any direct API call does.

## Flow: Deliver a queued webhook and transition payment status
1. `src/components/admin/ReconciliationPanel.tsx` — operator clicks the webhook delivery button
2. `src/hooks/useReconciliation.ts` — `useDeliverWebhooks()` calls `POST /api/admin/webhooks/deliver`
3. `src/app/api/admin/webhooks/deliver/route.ts` — route handler parses the delivery limit
4. `src/lib/auth/guards.ts` — `withRouteAuth()` checks `Permission.WEBHOOK_DELIVER`
5. `src/services/providerSimulatorService.ts` — `deliverPendingWebhooks()` loads pending deliveries
6. `src/services/webhookService.ts` — `processProviderWebhook()` deduplicates on `providerEventId`
7. `src/lib/domain/paymentStateMachine.ts` — `resolveLocalStatusFromProviderStatus()` and `assertAllowedPaymentTransition()` choose and validate the next local status
8. `src/repositories/paymentRepository.ts` — `transitionPaymentStatus()` updates the payment row
9. `src/repositories/webhookRepository.ts` — `markWebhookEventProcessed()` and `markWebhookDeliveryDelivered()` finalize the async path
10. Returns delivery counts and invalidates payment + reconciliation queries

## Flow: Refund a succeeded payment
1. `src/components/payments/RefundForm.tsx` — submit calls `refundMutation.mutateAsync()`
2. `src/hooks/usePaymentActions.ts` — `useRefundPayment()` sends `POST /api/payments/[paymentId]/refund`
3. `src/app/api/payments/[paymentId]/refund/route.ts` — route handler parses `refundPaymentSchema`
4. `src/lib/auth/guards.ts` — `withRouteAuth()` checks `Permission.PAYMENT_REFUND`
5. `src/services/refundService.ts` — `createRefundForPayment()` loads the payment and prior successful refund total
6. `src/lib/domain/paymentStateMachine.ts` — `assertRefundAllowed()` rejects over-refunds and non-succeeded payments (sequentially; see Flow 9 below for the concurrent case)
7. `src/repositories/refundRepository.ts` — `createRefund()` and `transitionRefundStatus()` persist the refund
8. `src/repositories/paymentRepository.ts` — `transitionPaymentStatus()` flips the payment to `REFUNDED` only on full refund
9. Returns refund metadata and invalidates list/detail queries

## Flow: Reconcile a partial failure where provider succeeded but no webhook was queued
1. `src/components/admin/ReconciliationPanel.tsx` — operator clicks "Run Reconciliation"
2. `src/hooks/useReconciliation.ts` — `useRunReconciliation()` sends `POST /api/admin/reconciliation/run`
3. `src/app/api/admin/reconciliation/run/route.ts` — protected route enters `runReconciliation()`
4. `src/services/reconciliationService.ts` — `runReconciliation()` creates the run row
5. `src/repositories/paymentRepository.ts` — `listPaymentsForReconciliation()` loads local payments with webhook deliveries
6. `src/repositories/providerRepository.ts` — `listProviderPayments()` loads provider truth
7. `src/lib/domain/paymentStateMachine.ts` — `resolveLocalStatusFromProviderStatus()` computes the expected local status
8. `src/services/reconciliationService.ts` — `runReconciliation()` emits `MISSING_WEBHOOK_DELIVERY` when provider is terminal and `payment.webhookDeliveries.length === 0`
9. `src/repositories/reconciliationRepository.ts` — `createReconciliationIssues()` persists the issue
10. `src/repositories/paymentEventRepository.ts` — `createPaymentEvent()` appends `RECONCILIATION_FLAGGED`

## Flow: Idempotent replay of a duplicate payment request
Correction: the browser UI cannot trigger this flow. `useCreatePayment()` generates a new key with `crypto.randomUUID()` *inside* `mutationFn` (`src/hooks/usePaymentActions.ts:32`), so every submit — including a user's retry after a timeout — is a brand-new key. Replay only happens for API clients that deliberately resend the same `Idempotency-Key`. The steps below describe that API-client case.
1. `src/hooks/usePaymentActions.ts` — `useCreatePayment()` sends `POST /api/payments` with an idempotency key (a fresh one per call; see correction above)
2. `src/app/api/payments/route.ts` — route delegates to `createPaymentWithIdempotency()`
3. `src/services/paymentService.ts` — `createPaymentWithIdempotency()` calls `findIdempotencyRecord()`
4. `src/repositories/idempotencyRepository.ts` — existing `COMPLETED` record is returned
5. `src/services/paymentService.ts` — `buildCompletedReplay()` reconstructs the original response body with `replayed: true`
6. Returns the original payment result instead of creating a second payment

---

## Line-numbered versions and additional flows

The flows above are kept as the quick map. The versions below add line numbers (verified against the source), note where the quick map simplifies, and add three flows the quick map omits: the concurrent duplicate create, a webhook processed twice at once, and the over-refund race.

### Flow 1 (line-numbered): create payment from the admin console

1. `src/components/payments/PaymentCreateForm.tsx:43-51` — `onSubmit` → `createPayment.mutateAsync(...)`. The button is disabled while pending (`:112`), the only client-side double-submit protection.
2. `src/hooks/usePaymentActions.ts:18-35` — `fetchJson("/api/payments", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } })`. `apiClient.ts:8-14` merges `Content-Type: application/json`.
3. `src/lib/auth/guards.ts:32` — session + `PAYMENT_CREATE` (CUSTOMER, OPS, ADMIN).
4. `src/app/api/payments/route.ts:11` — `createPaymentSchema` (`paymentSchemas.ts:16-22`): integer `amountMinor` 1..1,000,000; currency trimmed, exactly 3 chars, upper-cased; optional cuid `ownerUserId`; description 3–120 chars; `simulationMode` defaults to `SUCCEED`.
5. `src/services/paymentService.ts:62-84` — key required, fingerprint, optimistic lookup.
6. `src/services/paymentService.ts:87-166` — single transaction: idempotency row (`:88-95`), owner (`:97-102`), payment (`:104-117`), `PAYMENT_CREATED` (`:119-132`), provider dispatch (`:134-140`), complete record (`:152-161`).
7. Response `202` with `replayed: false` (`:142-150`). Note `status` is always `"PENDING"` here: the payment row was just created with `PENDING` (`paymentRepository.ts:49`) and dispatch does not change it.
8. `src/hooks/usePaymentActions.ts:36-38` — invalidates `["payments"]`. Because `paymentDetailQueryKey` is `["payments", id]` (`usePaymentDetail.ts:13`), this prefix invalidation also refreshes any open detail queries.

### Flow 7 (new): two identical create requests race

Scenario: an API client times out and retries with the same key while the first request is still inside its transaction.

1. Request 1 passes `paymentService.ts:68` (no record) and inserts the idempotency row at `:88` inside its transaction.
2. Request 2 also passes `:68` — request 1 has not committed, so the row is invisible.
3. Request 2's insert at `:88` collides with request 1's uncommitted row on `@@unique([route, key])` (`prisma/schema.prisma:135`) and waits.
4. Request 1 finishes `:152-161` and commits. Request 2's insert now fails with `P2002`; Prisma aborts request 2's transaction.
5. Request 2 enters the catch at `:168-172`, re-reads the now-committed record at `:173`, hashes match (`:175`), status is `COMPLETED` (`:183`) → `buildCompletedReplay()` returns the original body with `replayed: true` and status `202`.
6. Net effect: one payment, one provider mirror, one webhook delivery. This is the flow that justifies the repo's name, and it is correct.

Variant: if request 1 rolls back (e.g. `404 OWNER_NOT_FOUND` at `:100-102`), request 2's insert proceeds and request 2 executes the create itself — the same deterministic outcome a client would expect from a retry.

### Flow 8 (new): the same webhook delivered twice concurrently

Scenario: two operators click "Deliver" on the reconciliation page at nearly the same time (the button is only disabled per browser tab, `ReconciliationPanel.tsx:44`).

1. Both requests run `listPendingWebhookDeliveries(10)` (`providerSimulatorService.ts:158`, `webhookRepository.ts:29-37`) and get the same `PENDING` rows — there is no claim/lock column.
2. Both call `processProviderWebhook(delivery.payload)` (`providerSimulatorService.ts:163`). Both see no existing `WebhookEvent` at `webhookService.ts:30`.
3. Both open a transaction and insert a `WebhookEvent` with the same `providerEventId` (`webhookService.ts:56-65`). One wins; the other blocks then fails with `P2002` on `schema.prisma:216`.
4. The insert at `webhookService.ts:54-65` sits *before* the inner `try` (which starts at `:67`), so the loser's `P2002` is not even seen by the rejection handler at `:123-127`; it propagates straight out of `prisma.$transaction`.
5. Back in `deliverPendingWebhooks()`, the loser's catch (`providerSimulatorService.ts:170-178`) calls `markWebhookDeliveryFailed()` — on the same delivery row the winner marks `DELIVERED` at `:164`.
6. Outcome: the payment was transitioned exactly once (good — the unique constraint did its job), but the `WebhookDelivery` row ends in whichever status was written last. If `FAILED` wins, the detail page shows a failed delivery with a Prisma error message for a payment that is correctly `SUCCEEDED`, and the row is never retried (`FAILED` is not re-listed).

### Flow 9 (new): over-refund under concurrency

Scenario: an OPS user double-submits via two tabs, or a script retries a refund call.

1. Both requests pass `withRouteAuth` with `PAYMENT_REFUND` (`src/app/api/payments/[paymentId]/refund/route.ts:7-8`). There is no idempotency key on this route.
2. Both run `findPaymentById()` (`refundService.ts:25`) and `sumSuccessfulRefundsForPayment()` (`:31`) before either has inserted anything → both see `refunded = 0`.
3. Both pass `assertRefundAllowed()` at `:34` with `remaining = amountMinor`.
4. Both transactions insert a refund and mark it `SUCCEEDED` (`:37-63`). Nothing in the schema bounds the sum (`schema.prisma:244-258`).
5. Each computes `fullyRefunded` from its own stale `refundedAmount` (`:65`). For 60 + 60 on 100: both false, payment stays `SUCCEEDED`, 120 refunded. For 50 + 50 on 100: both false, payment stays `SUCCEEDED` with the full amount refunded — and is still offered as refundable by `RefundForm.tsx:26`.
6. The sequential case is correctly bounded. Both the concurrent and the sequential case were reproduced in a scratch model (checks C9–C11, `docs/learning/testing-rationale.md`).

### Flow 10 (new): an unauthenticated caller forges a webhook

1. `POST /api/webhooks/provider` with body `{"providerEventId":"forged-1","providerPaymentId":"<a real prov_pay_ id>","status":"REFUNDED","eventType":"payment.updated"}`. No session, no signature (`src/app/api/webhooks/provider/route.ts:4-10`).
2. `webhookService.ts:39-49` finds the provider mirror and payment.
3. If the payment is `SUCCEEDED`, `assertAllowedPaymentTransition("SUCCEEDED", "REFUNDED")` passes (`paymentStateMachine.ts:12`).
4. The payment becomes `REFUNDED`, the provider mirror becomes `REFUNDED`, and the events read `WEBHOOK_RECEIVED` and `STATUS_CHANGED` with actor `provider-webhook` — indistinguishable in the audit trail from a real provider event. No `Refund` row exists.
5. The provider ids are not secret inside the app: they are returned by `POST /api/payments` (`paymentService.ts:146`) and shown in the admin UI.

## Debugging scenarios grounded in these flows

**"The payment is stuck in PENDING."** Check the simulation mode in `Payment.metadata` (written at `paymentService.ts:111-114`). If it is `PARTIAL_SUCCESS`, no `WebhookDelivery` row exists (`providerSimulatorService.ts:32-37`, `:130`); reconciliation will flag `MISSING_WEBHOOK_DELIVERY` but nothing in the app will ever move the payment. If a delivery exists with status `FAILED`, read `lastError` — it will not be retried (Flow 8 step 6, `webhookRepository.ts:29-37`). If the delivery is `PENDING`, nobody has clicked "Deliver" yet.

**"Delivery says FAILED but the payment looks correct."** Flow 8. Confirm by checking for a `WebhookEvent` with the delivery's `providerEventId` and `processingStatus = PROCESSED`; if it exists, the failure was the losing side of a concurrent delivery.

**"A webhook was rejected but there is no record of it."** Expected given `webhookService.ts:123-127` (Finding L3). The only trace is the `console.error` from `jsonError()` (`route-helpers.ts:43`) for non-`RouteError` failures, or the `lastError` on the outbound `WebhookDelivery` for simulator deliveries. Direct `POST /api/webhooks/provider` calls that fail leave nothing in the database.

**"Refunded more than captured."** Sum `Refund.amountMinor` where `status = SUCCEEDED` for the payment and compare with `Payment.amountMinor`. Then look at `createdAt` of the refunds: two within milliseconds of each other point to Flow 9.

**"API returns 500 for a user who should just be forbidden."** Flow "Support user is rejected" correction above: auth errors are thrown outside the handler's `try`. Look in the server log for the uncaught `RouteError` with code `FORBIDDEN` or `UNAUTHENTICATED`.

**"Same idempotency key gave a different user someone else's payment."** Finding A4 in `docs/architecture/auth-and-permissions.md`: the record is keyed on `(route, key)` and the fingerprint ignores the caller.
