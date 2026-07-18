# Request Lifecycle

Request: Create a payment request with idempotency
1. `src/app/api/payments/route.ts` — `POST` receives the request, extracts the `Idempotency-Key` header, and parses the body with `createPaymentSchema.parse()`.
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
6. `src/repositories/webhookRepository.ts` — `createWebhookEvent()` persists the inbound event before mutation, then `markWebhookEventProcessed()` finalizes it.
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
4. `src/lib/api/route-helpers.ts` — `jsonError()` converts the thrown `RouteError` into an API response.
5. Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`
