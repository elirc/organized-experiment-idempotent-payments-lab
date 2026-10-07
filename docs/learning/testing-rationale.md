# Testing Rationale

## `support role cannot run reconciliation` in `tests/auth/authorization.test.ts`
This is worth a test because reconciliation is a privileged operational action that can expose system-wide financial state. If a support user can trigger it accidentally, your RBAC model is not trustworthy.

A more thorough production suite would also hit `src/app/api/admin/reconciliation/run/route.ts` through an HTTP test harness, verify the structured `403` body, and cover unauthenticated requests separately. (Such a test would currently fail: the pure `requirePermission()` throws the right 403, but `withRouteAuth()` at `src/lib/auth/guards.ts:32` does not convert it into a JSON response — see "Tests worth adding next", item 5.)

## `cannot move a failed payment back to succeeded` in `tests/services/paymentStateMachine.test.ts`
This is worth a test because terminal-state regressions are exactly the kind of subtle correctness bug that creates false revenue or refund eligibility.

A more thorough production suite would add webhook-driven transition cases through `src/services/webhookService.ts`, including duplicate-event handling and legal `PENDING -> FAILED` / `PENDING -> SUCCEEDED` transitions.

## `customer payment queries are scoped to their own user id` in `tests/services/paymentAccessPolicy.test.ts`
This is worth a test because list endpoints are one of the easiest places to leak multi-record data accidentally. The ownership filter in `buildPaymentListScope()` is small but high-risk.

A more thorough production suite would drive `src/services/paymentQueryService.ts` against a test database and prove that customer sessions never receive rows for other owners. Note that today no route lets a `CUSTOMER` reach `listVisiblePayments()` at all (every read route requires `PAYMENT_READ_ANY`), so this test protects a branch that only becomes live when a customer-facing read route is added.

## `createPaymentSchema rejects non-positive payment amounts` in `tests/validation/paymentSchemas.test.ts`
This is worth a test because amount validation belongs at the API boundary. Letting impossible money values into the service layer makes failures harder to reason about and easier to mishandle.

A more thorough production suite would add boundary cases for currency normalization, refund-reason refinement, and malformed payload shapes against the real `POST /api/payments` route.

Execution note: the validation test currently depends on `zod`, which is declared in `package.json` but not installed in this workspace by request. The test file is present and ready, but running it here fails with `ERR_MODULE_NOT_FOUND` for `zod`.

## What actually happens when you run the suite (re-run during the 2026-10 review)

Environment: Node v22.16.0, fresh clone, no `node_modules/` (nothing was installed).

1. **The `npm test` flags as written.** Running the four test files with `node --experimental-strip-types --test ...` (the flag set from `package.json`'s `test` script) gives **0 pass / 4 fail**. Three files fail before any test runs with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not supported in strip-only mode`, pointing at `export class RouteError` in `src/lib/errors.ts:7-15` — the `public readonly status` constructor parameters are TypeScript-only syntax that strip-only mode cannot erase. The fourth fails with `ERR_MODULE_NOT_FOUND` for `zod`, as the note above says. So the earlier note was incomplete: even with `zod` installed, the `npm test` script would not pass on this Node version.
2. **With type transformation.** `node --experimental-transform-types --test tests/auth/authorization.test.ts tests/services/paymentStateMachine.test.ts tests/services/paymentAccessPolicy.test.ts` gives **3 pass / 0 fail**: `support role cannot run reconciliation`, `customer payment queries are scoped to their own user id`, `cannot move a failed payment back to succeeded`.
3. `tests/validation/paymentSchemas.test.ts` could not be run (needs `zod`).

The cheapest repair for (1) is to rewrite `RouteError` with ordinary field declarations and assignments in the constructor, so the file is strip-only compatible; changing the flag also works but depends on a still-experimental Node option.

## Scratch checks run for this review

To verify claims in the docs without installing anything, a scratch file (kept outside the repo) imported the pure source modules directly and ran under `node --experimental-transform-types --test`. Result: **14 pass / 0 fail**. Where a check models service code rather than importing it, that is stated; models copy the *ordering* of the real code, not its database semantics.

| ID | What it checks | Imports real code? | Result |
|---|---|---|---|
| C1 | `buildRequestFingerprint()` gives the same hash for `{a, b:{c, d}}` and `{b:{d, c}, a}` | yes (`requestFingerprint.ts`) | pass — key order is normalized |
| C2 | changing `amountMinor` by 1 changes the hash | yes | pass |
| C3 | identical bodies hash identically regardless of who sends them (the hash input has no user) | yes | pass — confirms Finding A4's premise |
| C4 | `{a:1, o:undefined}` and `{a:1}` hash differently | yes | pass — harmless here because zod omits absent optionals, but a trap if a non-zod caller builds the body |
| C5 | all 16 `(from, to)` status pairs through `assertAllowedPaymentTransition()` | yes | pass — exactly 7 allowed (4 self-loops + 3 edges); every rejection is a `RouteError` 409 |
| C6 | `resolveLocalStatusFromProviderStatus("BOGUS")` | yes | pass — returns `undefined`; feeding that to the transition guard throws `INVALID_PAYMENT_TRANSITION` |
| C7 | `REFUNDED → SUCCEEDED` (a late success webhook) | yes | pass — rejected 409 |
| C8 | `assertRefundAllowed()` boundaries: equal to remaining OK, +1 rejected, non-`SUCCEEDED` rejected | yes | pass |
| C9 | two concurrent 60-unit refunds against a 100-unit payment, modelling `refundService.ts:31-76` ordering | guard is real, flow is modelled | pass — **both succeed, 120 refunded** |
| C10 | two concurrent 50-unit refunds | modelled | pass — **100 refunded, payment still `SUCCEEDED`** (each saw `refunded = 0`, so `fullyRefunded` was false) |
| C11 | the same refunds run sequentially | modelled | pass — second 60 rejected, 40 completes and flips to `REFUNDED` |
| C12 | a `RouteError` thrown by `requirePermission()` inside a `withRouteAuth`-shaped wrapper is *not* seen by the handler's `try/catch` | `requirePermission` real, wrapper modelled on `guards.ts:28-35` | pass — the promise rejects with the 403 `RouteError`; handler catch never runs |
| C13 | `resolvePaymentOwnerForCreate()` lets `SUPPORT` override the owner; `CUSTOMER` gets `FORBIDDEN_OWNER_OVERRIDE` | yes | pass — confirms Finding A3's premise |
| C14 | `CUSTOMER` lacks `PAYMENT_READ_ANY` | yes | pass — confirms the ownership branch is unreachable via current routes |

What these checks do **not** prove: anything about PostgreSQL locking, Prisma transaction rollback, or Next.js error rendering. Findings that depend on those (the `P2002` replay path, the rolled-back `REJECTED` write, the 500 on auth failure) are code-reading conclusions and are labelled as such in the architecture docs.

## Tests worth adding next, in priority order

Each item names the bug it would catch and the smallest harness that can catch it.

1. **Concurrent refunds** (catches Finding L2). Needs a real database: create a 100-unit `SUCCEEDED` payment, fire two `createRefundForPayment({ amountMinor: 60 })` calls with `Promise.all`, assert exactly one succeeds. Today it would fail.
2. **Same idempotency key, concurrent** (protects the one guarantee that *is* correct). Two `createPaymentWithIdempotency()` calls with the same key and body in `Promise.all`; assert one `payment` row and that both responses carry the same `paymentId`, one with `replayed: true`.
3. **Same key, different body** — assert `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` and that no second payment exists. Pure-ish: can be done with an in-memory fake of `findIdempotencyRecord`.
4. **Webhook rejection is recorded** (catches Finding L3). Post a webhook whose status would be an illegal transition; assert a `WebhookEvent` row exists with `processingStatus = REJECTED`. Today it would fail — the row is rolled back.
5. **Auth wrapper returns JSON** (catches Finding A1). Call the exported `POST` from `src/app/api/admin/reconciliation/run/route.ts` with a request carrying a SUPPORT session; assert the response status is 403 and the body has `error.code === "FORBIDDEN"`. Today the call rejects instead of resolving.
6. **Fingerprint stability** — C1/C2 above are cheap enough to commit as a real test file next to the existing ones; they need no database.
7. **Full transition matrix** — C5 above, as a table-driven test, so a future edit to `allowedTransitions` must update an explicit expectation.
