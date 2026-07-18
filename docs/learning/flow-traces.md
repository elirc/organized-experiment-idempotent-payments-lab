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
6. `src/lib/api/route-helpers.ts` — `jsonError()` returns the structured `403`
7. Returns `{ error: { code: "FORBIDDEN" } }`

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
6. `src/lib/domain/paymentStateMachine.ts` — `assertRefundAllowed()` rejects over-refunds and non-succeeded payments
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
1. `src/hooks/usePaymentActions.ts` — `useCreatePayment()` sends `POST /api/payments` with an idempotency key
2. `src/app/api/payments/route.ts` — route delegates to `createPaymentWithIdempotency()`
3. `src/services/paymentService.ts` — `createPaymentWithIdempotency()` calls `findIdempotencyRecord()`
4. `src/repositories/idempotencyRepository.ts` — existing `COMPLETED` record is returned
5. `src/services/paymentService.ts` — `buildCompletedReplay()` reconstructs the original response body with `replayed: true`
6. Returns the original payment result instead of creating a second payment
