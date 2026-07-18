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
- What calls it: `src/services/webhookService.ts`, `src/services/refundService.ts`, `src/services/reconciliationService.ts`
- What it calls: `src/lib/errors.ts`
- What would break or become insecure if this file were wrong: Invalid state rewrites would quietly corrupt operational truth.
- What a junior engineer would likely miswrite here: They would let every service choose its own transition rules.
