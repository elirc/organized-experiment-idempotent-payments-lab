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

(Precision on the `src/lib/**` bullet above: `paymentStateMachine.ts` enforces valid transitions only where it is called. The webhook path calls it (`src/services/webhookService.ts:88`); the refund path's `REFUNDED` write at `src/services/refundService.ts:68-75` does not; reconciliation never writes payment status at all.)

---

## Claimed vs. implemented — a one-page summary

This repo exists to teach payment correctness, so it is worth being exact about which protections the code actually has. Each row was checked by reading the cited lines; "scratch check" means a pure-function test was run with `node --test` (details in `docs/learning/testing-rationale.md`).

| Protection | Status | Evidence |
|---|---|---|
| Idempotency key required on create | Implemented | `src/services/paymentService.ts:62-64` |
| Same key + different body rejected | Implemented | `paymentService.ts:71-77` and again on the race path `:175-181`; fingerprint is key-order independent (scratch check C1) |
| Duplicate create under concurrency produces one payment | Implemented via DB constraint | `prisma/schema.prisma:135` + the `P2002` handler at `paymentService.ts:168-188` |
| Replay returns the original response | Implemented | `buildCompletedReplay()` at `paymentService.ts:42-53` |
| Idempotency scoped per user | **Not implemented** | key is `(route, key)` only; hash ignores the caller (scratch check C3) |
| UI benefits from idempotency on retry | **Not implemented** | `src/hooks/usePaymentActions.ts:32` generates a fresh `crypto.randomUUID()` on every mutation call, so a user retry is a new key |
| Refund cannot exceed captured amount (sequential) | Implemented | `refundService.ts:31-34`, `paymentStateMachine.ts:60-62` (scratch check C11) |
| Refund cannot exceed captured amount (concurrent) | **Not implemented** | check-then-insert outside a lock (scratch checks C9, C10) |
| Refund idempotency | **Not implemented** | refund route reads no key (`src/app/api/payments/[paymentId]/refund/route.ts:11-17`) |
| Webhook signature verification | **Not implemented** (acknowledged in code) | `src/app/api/webhooks/provider/route.ts:8` |
| Webhook payload validation | **Not implemented** | cast at `webhookService.ts:29` |
| Webhook dedupe on `providerEventId` | Implemented for sequential duplicates; concurrent duplicates rely on `@unique` and surface as errors | `webhookService.ts:30-37`, `schema.prisma:216` |
| Rejected webhooks recorded for debugging | **Not implemented in effect** — written then rolled back | `webhookService.ts:123-127` |
| Failed outbound deliveries retried | **Not implemented** | `webhookRepository.ts:29-37` lists `PENDING` only |
| State machine on every payment-status write | **Partial** — webhook path only | `webhookService.ts:88` vs `refundService.ts:68-75` |
| Reconciliation repairs drift | **Not implemented** — detect and record only | `reconciliationService.ts` has no status write |
| RBAC on API routes | Implemented, but rejections are 500s, not JSON 401/403 | `src/lib/auth/guards.ts:32` |
| RBAC on admin pages with graceful redirect | **Likely broken** (static finding) | `guards.ts:10` imports a symbol `route-helpers.ts` does not export |

## What you can run without installing anything

`node_modules/` is not committed, so nothing that imports `@prisma/client`, `next`, `zod` or React can run in a fresh clone. Pure modules can: `src/lib/domain/paymentStateMachine.ts`, `src/lib/idempotency/requestFingerprint.ts`, `src/lib/permissions.ts`, `src/lib/auth/authorization.ts`, `src/services/paymentAccessPolicy.ts` and `src/lib/errors.ts` import only each other and `node:crypto`. On Node 22.16 three of the four repo tests pass with `node --experimental-transform-types --test` (the `npm test` script's `--experimental-strip-types` cannot parse the constructor parameter properties in `src/lib/errors.ts:8-13`). Full results are recorded in `docs/learning/testing-rationale.md`.

## Where to go next

- `docs/architecture/request-lifecycle.md` — line-level traces and findings L1–L5.
- `docs/architecture/auth-and-permissions.md` — route/permission matrix and findings A1–A5.
- `docs/architecture/domain-model.md` — which schema line enforces which guarantee, and the dead fields.
- `docs/learning/guided-reading-path.md` — the reading order plus a Goal/Check exercise ladder.
