# Auth And Permissions

Session creation happens in `src/app/api/auth/login/route.ts`, which parses input with `loginSchema.parse()` from `src/lib/validation/authSchemas.ts` and then calls `login()` in `src/services/authService.ts`.

Session verification happens in `src/lib/auth/session.ts`. `getSessionForRequest()` reads the cookie name from `src/lib/auth/cookies.ts`, loads the session row through `findSessionByToken()` in `src/repositories/sessionRepository.ts`, and rejects expired sessions before routes see user data.

Route-level authorization is centralized in `src/lib/auth/guards.ts`. `withRouteAuth()` calls `requirePermission()` from `src/lib/auth/authorization.ts` before the handler body runs. That means `src/app/api/payments/route.ts`, `src/app/api/admin/webhooks/deliver/route.ts`, and `src/app/api/admin/reconciliation/run/route.ts` all share the same authentication and RBAC path.

The RBAC policy itself is defined in `src/lib/permissions.ts`. The mapping is explicit:
- `CUSTOMER` can create payments and read only their own payments. (Correction: the *policy* grants `PAYMENT_READ_OWN`, but no route or page accepts it. Every payment read route and every admin page requires `PAYMENT_READ_ANY` — see the route matrix below — so in practice a customer can only `POST /api/payments` and cannot read anything, not even their own payments.)
- `SUPPORT` can read any payment but cannot create, refund, deliver webhooks, or run reconciliation.
- `OPS` can create payments, read any payment, refund, deliver webhooks, and run reconciliation.
- `ADMIN` has the same operational permissions as `OPS` in this codebase.

Per-record access checks are separate from route-level permission checks. `src/services/paymentQueryService.ts` calls `assertCanReadPaymentRecord()` from `src/services/paymentAccessPolicy.ts` after loading the payment, which in turn uses `canReadPayment()` from `src/lib/auth/authorization.ts`. This is the second line of defense if a broader read route ever exists later.

Ownership scoping for list queries is centralized in `src/services/paymentAccessPolicy.ts`. `buildPaymentListScope()` returns `{ ownerUserId: session.userId }` for `CUSTOMER` and `{}` for staff roles. That function is the code path a stronger reviewer should protect most aggressively because removing it would leak customer data from list views.

Page-level authorization is also centralized. `src/app/admin/layout.tsx` calls `requireStaffPaymentsPage()` from `src/lib/auth/guards.ts`, and `src/app/admin/reconciliation/page.tsx` calls `requirePagePermission(Permission.RECONCILIATION_RUN)` so support users can inspect payments but cannot access reconciliation operations. (Caveat: the "redirect to `/` on 403" branch that makes this graceful depends on an import that does not resolve — see Finding A2 below.)

This project is not multi-tenant. To add multi-tenancy later without a rewrite:
- Add `tenantId` to tenant-owned models in `prisma/schema.prisma`, especially `Payment`, `ProviderPayment`, `WebhookDelivery`, `WebhookEvent`, `Refund`, and `ReconciliationIssue`.
- Extend `AuthenticatedSession` in `src/lib/auth/session.ts` to include `tenantId`.
- Change `buildPaymentListScope()` in `src/services/paymentAccessPolicy.ts` to return both `tenantId` and ownership filters.
- Update every repository function in `src/repositories/**` that reads tenant-owned data so the `where` clause scopes by `tenantId` before business filters are applied.
- Add a tenant-aware permission layer alongside `src/lib/permissions.ts` so platform admins and org-level operators are separated explicitly.
- Add the tenant (or at least the user) to the idempotency scope. Today `IdempotencyRecord` is unique on `(route, key)` only (`prisma/schema.prisma:135`); see Finding A4.

---

## Route and page permission matrix (read from the code)

| Entry point | Guard | Permission | Roles that pass (`src/lib/permissions.ts:20-37`) | Per-record check |
|---|---|---|---|---|
| `POST /api/auth/login` (`src/app/api/auth/login/route.ts:6`) | none | — | anyone | — |
| `POST /api/auth/logout` (`src/app/api/auth/logout/route.ts:7`) | none | — | anyone holding the cookie | — |
| `POST /api/payments` (`src/app/api/payments/route.ts:7-8`) | `withRouteAuth` | `PAYMENT_CREATE` | CUSTOMER, OPS, ADMIN | owner override via `resolvePaymentOwnerForCreate()` |
| `GET /api/admin/payments` (`src/app/api/admin/payments/route.ts:6-7`) | `withRouteAuth` | `PAYMENT_READ_ANY` | SUPPORT, OPS, ADMIN | `buildPaymentListScope()` (returns `{}` for every role that can reach it) |
| `GET /api/admin/payments/[paymentId]` (`.../[paymentId]/route.ts:6-7`) | `withRouteAuth` | `PAYMENT_READ_ANY` | SUPPORT, OPS, ADMIN | `assertCanReadPaymentRecord()` (always true for these roles) |
| `POST /api/payments/[paymentId]/refund` (`.../refund/route.ts:7-8`) | `withRouteAuth` | `PAYMENT_REFUND` | OPS, ADMIN | none |
| `POST /api/admin/webhooks/deliver` (`.../deliver/route.ts:7-8`) | `withRouteAuth` | `WEBHOOK_DELIVER` | OPS, ADMIN | none |
| `POST /api/admin/reconciliation/run` (`.../run/route.ts:6-7`) | `withRouteAuth` | `RECONCILIATION_RUN` | OPS, ADMIN | none |
| `GET /api/admin/reconciliation/issues` (`.../issues/route.ts:6-7`) | `withRouteAuth` | `RECONCILIATION_RUN` | OPS, ADMIN | none |
| `POST /api/webhooks/provider` (`src/app/api/webhooks/provider/route.ts:4`) | **none** | — | **anyone, unauthenticated** | none |
| `/admin/*` layout (`src/app/admin/layout.tsx:6`) | `requireStaffPaymentsPage` | `PAYMENT_READ_ANY` | SUPPORT, OPS, ADMIN | — |
| `/admin/reconciliation` (`src/app/admin/reconciliation/page.tsx:6`) | `requirePagePermission` | `RECONCILIATION_RUN` | OPS, ADMIN | — |

Two consequences fall straight out of this table:

1. **The ownership code is unreachable today.** The only role without `PAYMENT_READ_ANY` is `CUSTOMER`, and `CUSTOMER` cannot reach any route that calls `buildPaymentListScope()` or `assertCanReadPaymentRecord()`. The `{ ownerUserId }` branch at `src/services/paymentAccessPolicy.ts:40-41` and the `PAYMENT_READ_OWN` branch at `src/lib/auth/authorization.ts:33` are exercised only by `tests/services/paymentAccessPolicy.test.ts`. They are correct and worth keeping — they become live the moment someone adds a customer-facing read route — but the earlier claim that they currently protect customer data overstates their role.
2. **Support's "cannot mutate" rule is enforced at the API, the UI is cosmetic.** `src/app/admin/payments/page.tsx:17-25` and `src/app/admin/payments/[paymentId]/page.tsx:22-31` hide forms for `SUPPORT` by role name, but the real protection is that `SUPPORT` lacks `PAYMENT_CREATE`/`PAYMENT_REFUND` in `permissions.ts:22`.

## How a session becomes a permission decision (line by line)

1. **Login.** `src/app/api/auth/login/route.ts:8` validates `{ email, password }` (`authSchemas.ts:9-12`: valid email, password ≥ 8 chars). `login()` (`src/services/authService.ts:15-35`) looks the user up by email, verifies the password, and creates a session with `randomBytes(24).toString("hex")` — a 48-hex-character opaque token (line 28). Unknown email and wrong password both return the same `401 INVALID_CREDENTIALS` (lines 19 and 25), which avoids an obvious account-enumeration oracle in the response body. (Timing still differs: the unknown-email path skips the scrypt work.)
2. **Password hashing.** `src/lib/auth/password.ts:11-15` uses `scryptSync(password, salt, 64)` with a 16-byte random salt and stores `salt:hash`. The constant is named `SCRYPT_COST` (line 9) but it is passed as the *key length* argument; the scrypt cost parameters are Node's defaults. `verifyPassword()` compares with `timingSafeEqual` (line 25).
3. **Cookie.** `setSessionCookie()` (`src/lib/auth/session.ts:70-78`) sets `httpOnly`, `sameSite: "lax"`, `secure` only in production, path `/`, and an expiry of `SESSION_DURATION_HOURS` (default 12, `src/lib/env.ts:7`).
4. **Resolution.** `getSessionForRequest()` (`session.ts:23-44`) and `getSessionForPage()` (`session.ts:46-68`) are two copies of the same logic, differing only in where they read the cookie. Both treat an expired row as "no session" (lines 32 and 56) but never delete it, so the `Session` table grows until logout.
5. **Role is read live.** The role comes from `session.user.role` (line 42) on every request, because `findSessionByToken()` includes the user (`sessionRepository.ts:25-32`). Changing a user's role in the database therefore takes effect on their next request without re-login — a property worth knowing when debugging "why can this user still do X".
6. **Decision.** `requirePermission()` (`authorization.ts:16-26`) throws `401` for no session and `403` for a role without the permission.
7. **Logout.** `src/app/api/auth/logout/route.ts:8-12` parses the raw `cookie` header by hand rather than using `request.cookies`, deletes matching session rows with `deleteMany` (`sessionRepository.ts:34-38`, so a bogus token is a silent no-op), clears the cookie and redirects to `/login`.

## Findings

**A1 — Auth failures escape the JSON error contract.** `withRouteAuth()` calls `requirePermission()` at `src/lib/auth/guards.ts:32`, outside the handler's `try/catch`. The `RouteError` it throws is never passed to `jsonError()`, so API clients get an unstructured 500 instead of the `401`/`403` JSON documented elsewhere. Checked with a scratch model of the wrapper (check C12 in `docs/learning/testing-rationale.md`); not observed against a running server.

**A2 — The page guard's 403 redirect depends on an import that does not exist.** `src/lib/auth/guards.ts:10` imports `RouteError` from `../api/route-helpers`, but `src/lib/api/route-helpers.ts` only exports `jsonOk`, `jsonError` and `parseJson` (lines 12, 16, 56); it imports `RouteError` from `../errors` without re-exporting it. `tsc` should reject this import, and if a bundler lets it through with the binding `undefined`, `error instanceof RouteError` at `guards.ts:48` throws a `TypeError` instead of redirecting. The concrete path: `src/components/auth/LoginForm.tsx:24` sends *every* user, including `CUSTOMER`, to `/admin/payments` after login, which hits `requireStaffPaymentsPage()` in `src/app/admin/layout.tsx:6` and lands in that broken branch. Static finding — the app was not built or run for this review. Fix: import `RouteError` from `../errors`.

**A3 — "Create on behalf of" is gated by a read permission.** `resolvePaymentOwnerForCreate()` (`src/services/paymentAccessPolicy.ts:24`) allows overriding the owner when the caller has `PAYMENT_READ_ANY`. Today that is harmless because the only role with `READ_ANY` but not `CREATE` is `SUPPORT`, which never reaches this function. It becomes a privilege-escalation seam if someone later grants `SUPPORT` `PAYMENT_CREATE` for a "create on customer's behalf" feature. A dedicated `PAYMENT_CREATE_ON_BEHALF` permission would make the intent explicit. (Check C13 confirms `SUPPORT` passes the owner-override check in isolation.)

**A4 — Idempotency keys are global, not per caller.** `IdempotencyRecord` is unique on `(route, key)` (`prisma/schema.prisma:135`) and the fingerprint hashes only the request body (`src/services/paymentService.ts:67`). If two different users send the same key with the same body (for example the UI defaults at `src/components/payments/PaymentCreateForm.tsx:38-41` and a client-generated key that collides or is reused by a buggy integration), the second user receives the first user's `paymentId` and `reference` as a "replay" (`paymentService.ts:79-80`) and no payment is created for them. Low probability with random UUIDs, but it is an authorization boundary that the idempotency layer quietly crosses. Fix: include `session.userId` in the unique key or in the fingerprint.

**A5 — The webhook route has no authentication of any kind.** See `docs/architecture/request-lifecycle.md` Finding L5.

## Exercises

1. **Goal:** confirm A1 for yourself. **Check:** in `src/lib/auth/guards.ts`, mentally (or on a branch) move line 32 into a `try/catch` that returns `jsonError(error)`. The SUPPORT → reconciliation call should then produce the JSON `403` body. Explain why the original handlers' `try` blocks could never catch it.
2. **Goal:** see the ownership branch become live. **Check:** sketch a `GET /api/payments` route guarded by `PAYMENT_READ_OWN` that calls `listVisiblePayments()`. Which existing function call makes it safe for customers, and what does `tests/services/paymentAccessPolicy.test.ts` already guarantee about it?
3. **Goal:** reason about A4. **Check:** write down the two requests (user, key, body) that cause user B to receive user A's payment id. Then name the one-line change in `paymentService.ts` that prevents it without a migration.
4. **Goal:** session hygiene. **Check:** list every place a `Session` row is deleted (answer: only `deleteSessionByToken()` via logout, plus the cascade at `schema.prisma:116` when a user is deleted). What would you add so expired sessions are cleaned up?
