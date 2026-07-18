# Domain Model

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ Payment : owns
  User ||--o{ Payment : creates
  User ||--o{ Refund : creates
  User ||--o{ ReconciliationRun : starts
  Payment ||--o{ PaymentAttempt : sends
  Payment ||--o{ PaymentEvent : records
  Payment ||--o{ Refund : has
  Payment ||--|| ProviderPayment : mirrors
  Payment ||--o{ WebhookDelivery : queues
  Payment ||--o{ WebhookEvent : processes
  Payment ||--o{ ReconciliationIssue : flagged_in
  ReconciliationRun ||--o{ ReconciliationIssue : finds
```

## User
- Schema/model file: `prisma/schema.prisma` model `User`
- Primary service owner: `src/services/authService.ts` via `login()` and `logout()`
- Notes: Users are also the ownership boundary for payments in `src/services/paymentAccessPolicy.ts`.

## Session
- Schema/model file: `prisma/schema.prisma` model `Session`
- Primary service owner: `src/services/authService.ts` via `login()`
- Notes: `src/lib/auth/session.ts` resolves cookie tokens back to session rows before any route is trusted.

## IdempotencyRecord
- Schema/model file: `prisma/schema.prisma` model `IdempotencyRecord`
- Primary service owner: `src/services/paymentService.ts` via `createPaymentWithIdempotency()`
- Notes: This is the durable replay contract. The payment row is not the idempotency mechanism.

## Payment
- Schema/model file: `prisma/schema.prisma` model `Payment`
- Primary service owner: `src/services/paymentService.ts` via `createPaymentWithIdempotency()`
- Notes: Local status is intentionally allowed to drift behind provider truth until `src/services/webhookService.ts` or `src/services/reconciliationService.ts` corrects it.

## PaymentAttempt
- Schema/model file: `prisma/schema.prisma` model `PaymentAttempt`
- Primary service owner: `src/services/providerSimulatorService.ts` via `dispatchPaymentToProvider()`
- Notes: Attempts preserve retry/debug history instead of collapsing all provider communication into the payment row.

## ProviderPayment
- Schema/model file: `prisma/schema.prisma` model `ProviderPayment`
- Primary service owner: `src/services/providerSimulatorService.ts` via `dispatchPaymentToProvider()`
- Notes: This is the simulated external source of truth that reconciliation compares against.

## WebhookDelivery
- Schema/model file: `prisma/schema.prisma` model `WebhookDelivery`
- Primary service owner: `src/services/providerSimulatorService.ts` via `dispatchPaymentToProvider()` and `deliverPendingWebhooks()`
- Notes: Outbound delivery tracking exists so "provider succeeded but our local system never heard about it" is a first-class state.

## WebhookEvent
- Schema/model file: `prisma/schema.prisma` model `WebhookEvent`
- Primary service owner: `src/services/webhookService.ts` via `processProviderWebhook()`
- Notes: Inbound processing is idempotent on `providerEventId`, not just on payment id.

## PaymentEvent
- Schema/model file: `prisma/schema.prisma` model `PaymentEvent`
- Primary service owner: multiple services append here, but `src/repositories/paymentEventRepository.ts` is the single write boundary
- Notes: This is the transaction history requested in the brief. Operators read this trail in `src/components/payments/PaymentDetailsCard.tsx`.

## Refund
- Schema/model file: `prisma/schema.prisma` model `Refund`
- Primary service owner: `src/services/refundService.ts` via `createRefundForPayment()`
- Notes: Full refunds transition the payment to `REFUNDED`; partial refunds leave the payment in `SUCCEEDED`.

## ReconciliationRun
- Schema/model file: `prisma/schema.prisma` model `ReconciliationRun`
- Primary service owner: `src/services/reconciliationService.ts` via `runReconciliation()`
- Notes: Reconciliation runs are historical records, not a single mutable report.

## ReconciliationIssue
- Schema/model file: `prisma/schema.prisma` model `ReconciliationIssue`
- Primary service owner: `src/services/reconciliationService.ts` via `runReconciliation()`
- Notes: Missing provider rows, missing local rows, missing webhook deliveries, and status mismatches are stored explicitly so operators can reason about eventual consistency failures.
