# Guided Reading Path

## Step 1 — src/lib/permissions.ts
**Why read this:** This is the smallest file that tells you who is allowed to do what.
**What to look for:** The `rolePermissions` map and how `Permission` values are named after actions, not pages.
**What to trace:** `src/lib/auth/authorization.ts` calls `roleHasPermission()`, and `src/lib/auth/guards.ts` uses that through `requirePermission()`.
**What a junior would likely miss:** The difference between "can reach the page" and "can perform the operation" starts here, not in React.

## Step 2 — src/lib/auth/authorization.ts
**Why read this:** This is the pure policy gate that every protected route depends on.
**What to look for:** `requirePermission()` and `canReadPayment()` as separate concepts.
**What to trace:** Called by `src/lib/auth/guards.ts` and `src/services/paymentAccessPolicy.ts`; throws `RouteError` from `src/lib/errors.ts`.
**What a junior would likely miss:** Authenticated does not mean authorized, and list/read ownership logic is different from coarse role gating.

## Step 3 — src/lib/auth/guards.ts
**Why read this:** It is the framework bridge between cookie sessions and the pure permission layer.
**What to look for:** `withRouteAuth()` and `requirePagePermission()`.
**What to trace:** Called by API routes like `src/app/api/payments/route.ts` and pages like `src/app/admin/reconciliation/page.tsx`; it calls `src/lib/auth/session.ts` and `src/lib/auth/authorization.ts`.
**What a junior would likely miss:** If this wrapper is bypassed by even one route, the architecture looks secure but is not. (It is bypassed by one: `src/app/api/webhooks/provider/route.ts` has no guard at all. And the wrapper itself throws its `RouteError` at line 32, outside every handler's `try`, so rejections are not JSON — see `docs/architecture/auth-and-permissions.md` Finding A1.)

## Step 4 — prisma/schema.prisma
**Why read this:** The schema shows the real shape of the system better than any diagram.
**What to look for:** `IdempotencyRecord`, `ProviderPayment`, `WebhookDelivery`, and `ReconciliationIssue`.
**What to trace:** The write paths in `src/services/paymentService.ts`, `src/services/providerSimulatorService.ts`, and `src/services/reconciliationService.ts`.
**What a junior would likely miss:** `Payment` is not enough by itself to explain financial correctness once retries and async updates enter the picture.

## Step 5 — src/services/paymentService.ts
**Why read this:** This is the main write path and the clearest example of service-layer orchestration.
**What to look for:** `createPaymentWithIdempotency()`, request hashing, replay behavior, and the transaction boundary.
**What to trace:** Called by `src/app/api/payments/route.ts`; it calls `src/lib/idempotency/requestFingerprint.ts`, `src/repositories/idempotencyRepository.ts`, `src/services/paymentAccessPolicy.ts`, `src/repositories/paymentRepository.ts`, and `src/services/providerSimulatorService.ts`.
**What a junior would likely miss:** The idempotency response snapshot is part of the API contract, not a debugging convenience.

## Step 6 — src/services/providerSimulatorService.ts
**Why read this:** This file models the external system instead of pretending local status is the only truth.
**What to look for:** `resolveProviderSimulation()` and `dispatchPaymentToProvider()`.
**What to trace:** Called by `src/services/paymentService.ts`; it calls provider, attempt, event, and webhook repositories, and later `deliverPendingWebhooks()` calls `src/services/webhookService.ts`.
**What a junior would likely miss:** A "partial failure" is often a missing side effect around the provider result, not just a thrown exception.

## Step 7 — src/services/webhookService.ts
**Why read this:** It shows how to process async updates idempotently.
**What to look for:** `processProviderWebhook()` checking `providerEventId` before mutating state.
**What to trace:** Called by `src/app/api/webhooks/provider/route.ts` and `src/services/providerSimulatorService.ts`; it calls `src/lib/domain/paymentStateMachine.ts` and multiple repositories.
**What a junior would likely miss:** The event row is persisted before the mutation is considered complete, which helps make retries safe. (Correction: the event row is inserted *inside the same transaction* as the mutation (`src/services/webhookService.ts:53-65`). If processing fails, the row and its `REJECTED` mark are rolled back together (`:123-127`). What actually makes retries safe is the `@unique` on `providerEventId` (`prisma/schema.prisma:216`) plus the `PROCESSED` short-circuit at `webhookService.ts:32-37`.)

## Step 8 — src/lib/domain/paymentStateMachine.ts
**Why read this:** It is the explicit state-transition guardrail.
**What to look for:** `assertAllowedPaymentTransition()` and `assertRefundAllowed()`.
**What to trace:** Called by `src/services/webhookService.ts` and `src/services/refundService.ts`.
**What a junior would likely miss:** State transitions deserve a dedicated module once multiple workflows can change status.

## Step 9 — src/services/refundService.ts
**Why read this:** Refunds are where "money-moving correctness" gets real.
**What to look for:** `sumSuccessfulRefundsForPayment()` plus the full-vs-partial refund branch.
**What to trace:** Called by `src/app/api/payments/[paymentId]/refund/route.ts`; it calls `src/repositories/refundRepository.ts`, `src/repositories/paymentRepository.ts`, and `src/repositories/paymentEventRepository.ts`.
**What a junior would likely miss:** Prior refunds matter just as much as current payment status.

## Step 10 — src/services/reconciliationService.ts
**Why read this:** This is where eventual consistency becomes operationally visible.
**What to look for:** `runReconciliation()` computing mismatches between local and provider states.
**What to trace:** Called by `src/app/api/admin/reconciliation/run/route.ts`; it calls payment, provider, reconciliation, and event repositories.
**What a junior would likely miss:** Reconciliation is not a report-only concern; it is part of the system’s correctness story.

## Step 11 — src/services/paymentAccessPolicy.ts
**Why read this:** It is the clean example of explicit ownership policy outside of UI files.
**What to look for:** `buildPaymentListScope()` and `assertCanReadPaymentRecord()`.
**What to trace:** Called by `src/services/paymentQueryService.ts` and `src/services/paymentService.ts`.
**What a junior would likely miss:** List scoping bugs are usually more dangerous than detail-view bugs because they leak many rows at once.

## Step 12 — src/components/admin/ReconciliationPanel.tsx
**Why read this:** This is the best UI file for seeing how the operations surface maps onto backend workflows.
**What to look for:** The buttons that call `useDeliverWebhooks()` and `useRunReconciliation()`.
**What to trace:** It calls `src/hooks/useReconciliation.ts`, which calls the admin API routes.
**What a junior would likely miss:** The UI intentionally exposes system-repair actions, not just data browsing.

## Step 13 — src/hooks/usePaymentActions.ts
**Why read this:** It shows how the client keeps server state coherent after mutations.
**What to look for:** Query invalidation after create and refund mutations.
**What to trace:** Called by `src/components/payments/PaymentCreateForm.tsx` and `src/components/payments/RefundForm.tsx`; it calls `src/hooks/apiClient.ts`.
**What a junior would likely miss:** Stale caches are a real correctness bug in operational UIs, not just a cosmetic issue.

## Step 14 — src/app/api/payments/route.ts
**Why read this:** It is the thinnest version of the HTTP edge in this codebase.
**What to look for:** How little logic lives here once the architecture is set up correctly.
**What to trace:** It calls `src/lib/auth/guards.ts`, `src/lib/validation/paymentSchemas.ts`, and `src/services/paymentService.ts`.
**What a junior would likely miss:** A thin route is often a sign of good structure, not missing work.

---

## Scope note (honesty cap)

This doc set was expanded in October 2026 under a request for roughly 5–7× more material. The codebase is small: about 3,800 lines of TypeScript, TSX and Prisma, of which the server-side logic that carries the teaching value is roughly 1,500 lines across eight services and ten repositories (including their header comments). Every addition here is tied to a line that was read, a check that was run, or a finding with evidence. Expanding further would have meant restating the same lines or writing generic payments material not grounded in this code, so the expansion stops at roughly 3× the original word count (about 5,000 → 15,000 words across the ten docs). That is a deliberate cap, not an omission.

## Exercise ladder (Goal + Check)

Work through these in order. Each rung builds on the files from the reading steps above. "Run" means the check was executed during the review and its result is recorded; "Read" means it is answered by reading the cited lines. No rung needs a database or `npm install`.

### Rung 1 — Permissions are data (Steps 1–2) — Run
**Goal:** know exactly which roles can do what.
**Check:** from `src/lib/permissions.ts:20-37`, fill in a 4×6 role/permission grid. Then confirm three cells with code: `roleHasPermission("SUPPORT", "reconciliation:run")` is `false`, `roleHasPermission("CUSTOMER", "payment:read:any")` is `false`, `roleHasPermission("OPS", "payment:refund")` is `true`.
**Result during review:** the first two were asserted in scratch checks (C12 via `requirePermission`, C14 directly) and passed; the repo test `support role cannot run reconciliation` also passes under `node --experimental-transform-types --test`.

### Rung 2 — The wrapper's blind spot (Step 3) — Run (modelled)
**Goal:** see why auth errors are not JSON.
**Check:** in `src/lib/auth/guards.ts`, find the line that can throw (32) and the line that calls the handler (34). In any route — e.g. `src/app/api/admin/reconciliation/run/route.ts:9-14` — find the `try`. Explain why the `try` cannot catch the throw.
**Result during review:** a scratch wrapper with the same structure rejected with the 403 `RouteError` and the handler's `catch` never ran (check C12, pass).

### Rung 3 — Schema guarantees (Step 4) — Read
**Goal:** map each correctness guarantee to the schema line that enforces it.
**Check:** without looking at `docs/architecture/domain-model.md`, list which of these has a database constraint: one create per key; one mirror per payment; one application per inbound event; refund total ≤ amount. Then compare with that doc's constraint table. (Answer: the first three do; the last does not.)

### Rung 4 — The fingerprint (Step 5) — Run
**Goal:** know what counts as "the same request".
**Check:** predict whether these pairs hash equal under `buildRequestFingerprint()`: (a) same fields, different key order; (b) `amountMinor` 100 vs 101; (c) the same body sent by two different users; (d) `{a:1, o:undefined}` vs `{a:1}`.
**Result during review:** (a) equal, (b) different, (c) equal — there is no user in the input, (d) different. Checks C1–C4, all pass.

### Rung 5 — The race that is handled (Step 5) — Read
**Goal:** explain why two concurrent creates with the same key produce one payment.
**Check:** walk Flow 7 in `docs/learning/flow-traces.md`, then answer: which line would a duplicate request be blocked on, and which line returns its response? (Answers: the insert at `src/services/paymentService.ts:88` waits on the unique index; `:183-184` returns the replay.)

### Rung 6 — Simulation modes (Step 6) — Read
**Goal:** predict what each mode writes.
**Check:** for each of the four modes in `resolveProviderSimulation()` (`src/services/providerSimulatorService.ts:24-52`), say whether a `WebhookDelivery` row is queued and what reconciliation will report before delivery. Compare with the table in `docs/architecture/domain-model.md`. Then find the only difference between `SUCCEED` and `NETWORK_UNKNOWN` (line 84).

### Rung 7 — The state machine, exhaustively (Step 8) — Run
**Goal:** know every legal and illegal transition.
**Check:** enumerate all 16 `(from, to)` pairs through `assertAllowedPaymentTransition()`. How many pass?
**Result during review:** 7 pass (four self-loops, plus `PENDING→SUCCEEDED`, `PENDING→FAILED`, `SUCCEEDED→REFUNDED`); every rejection is `RouteError` 409 (check C5). `resolveLocalStatusFromProviderStatus("BOGUS")` returns `undefined` (C6).

### Rung 8 — Webhook rollback (Step 7) — Read
**Goal:** understand why rejected webhooks leave no trace.
**Check:** in `src/services/webhookService.ts`, identify which writes at lines 53-127 use `tx`, and what happens to all of them when line 126 re-throws. Then propose where the rejection write must move to survive.

### Rung 9 — Refund race (Step 9) — Run (modelled)
**Goal:** see the over-refund for yourself.
**Check:** with the payment at 100, run two 60-unit refunds concurrently through a model that preserves `src/services/refundService.ts`'s ordering (read sum → await → assert → insert), using the real `assertRefundAllowed()`. Then run them sequentially.
**Result during review:** concurrent — both succeeded, 120 refunded, payment still `SUCCEEDED` (C9). Two concurrent 50s — 100 refunded, payment still `SUCCEEDED` (C10). Sequential — second 60 rejected with `REFUND_AMOUNT_EXCEEDS_CAPTURE` (C11). All pass.

### Rung 10 — Reconciliation's reach (Step 10) — Read
**Goal:** know what reconciliation can and cannot do.
**Check:** grep `src/services/reconciliationService.ts` for any call that changes `Payment.status`. (None.) Then explain why `MISSING_LOCAL_PAYMENT` cannot be produced by the app (`prisma/schema.prisma:191`, `onDelete: Cascade` on the mirror's FK).

### Rung 11 — Dormant ownership (Step 11) — Run
**Goal:** see a correct check that nothing currently reaches.
**Check:** run the repo's `tests/services/paymentAccessPolicy.test.ts`; then, using the route matrix in `docs/architecture/auth-and-permissions.md`, find a route through which a `CUSTOMER` reaches `buildPaymentListScope()`.
**Result during review:** the test passes; there is no such route.

### Rung 12 — Client idempotency (Step 13) — Read
**Goal:** connect the UI to the server contract.
**Check:** in `src/hooks/usePaymentActions.ts`, find where the `Idempotency-Key` is generated (line 32). Describe the minimal change so that a user who clicks "Submit" twice after a network timeout reuses the same key.

### Rung 13 — Capstone — Read
**Goal:** prioritise fixes like a reviewer.
**Check:** rank Findings A1, A2, L2, L3, L5 by (money at risk, ease of exploitation, size of fix). Compare with "What I would change first" in `docs/learning/build-journal.md` Stage 7 and defend any difference.
