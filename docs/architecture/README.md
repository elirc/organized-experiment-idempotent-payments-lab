# Architecture Overview

This project is a Next.js App Router application that teaches payment-system correctness through a realistic service and repository split.

- `src/app/**` holds pages and HTTP entrypoints. For example, `src/app/api/payments/route.ts` accepts payment requests and `src/app/admin/payments/page.tsx` composes the operator UI.
- `src/components/**` holds client-side UI modules that call React Query hooks instead of embedding business rules. `src/components/payments/PaymentCreateForm.tsx` submits payment requests, while `src/components/admin/ReconciliationPanel.tsx` drives webhook delivery and reconciliation.
- `src/hooks/**` is the browser data boundary. `src/hooks/usePaymentActions.ts` and `src/hooks/useReconciliation.ts` call REST endpoints and own cache invalidation.
- `src/services/**` is the business-logic layer. `src/services/paymentService.ts` owns idempotent payment creation, `src/services/webhookService.ts` owns async provider updates, and `src/services/reconciliationService.ts` compares local truth to provider truth.
- `src/repositories/**` is the database boundary. `src/repositories/paymentRepository.ts` owns payment reads/writes, `src/repositories/idempotencyRepository.ts` owns idempotency records, and `src/repositories/webhookRepository.ts` owns outbound and inbound webhook persistence.
- `src/lib/**` contains cross-cutting policies and domain rules. `src/lib/auth/guards.ts` centralizes route/page auth, `src/lib/permissions.ts` defines RBAC, and `src/lib/domain/paymentStateMachine.ts` enforces valid payment transitions.
- `prisma/schema.prisma` is the relational source of truth. It models local payments, provider mirrors, webhook delivery tracking, refunds, reconciliation runs, and user sessions.
- `tests/**` contains focused learning-oriented tests. `tests/auth/authorization.test.ts` and `tests/services/paymentStateMachine.test.ts` validate core policy logic without needing a running app server.

The intended reading direction is:
1. `prisma/schema.prisma`
2. `src/lib/permissions.ts`
3. `src/services/paymentService.ts`
4. `src/services/webhookService.ts`
5. `src/services/reconciliationService.ts`

That order mirrors how stronger backend engineers usually orient themselves: schema first, policy second, write path third, async correction paths fourth.
