# Testing Rationale

## `support role cannot run reconciliation` in `tests/auth/authorization.test.ts`
This is worth a test because reconciliation is a privileged operational action that can expose system-wide financial state. If a support user can trigger it accidentally, your RBAC model is not trustworthy.

A more thorough production suite would also hit `src/app/api/admin/reconciliation/run/route.ts` through an HTTP test harness, verify the structured `403` body, and cover unauthenticated requests separately.

## `cannot move a failed payment back to succeeded` in `tests/services/paymentStateMachine.test.ts`
This is worth a test because terminal-state regressions are exactly the kind of subtle correctness bug that creates false revenue or refund eligibility.

A more thorough production suite would add webhook-driven transition cases through `src/services/webhookService.ts`, including duplicate-event handling and legal `PENDING -> FAILED` / `PENDING -> SUCCEEDED` transitions.

## `customer payment queries are scoped to their own user id` in `tests/services/paymentAccessPolicy.test.ts`
This is worth a test because list endpoints are one of the easiest places to leak multi-record data accidentally. The ownership filter in `buildPaymentListScope()` is small but high-risk.

A more thorough production suite would drive `src/services/paymentQueryService.ts` against a test database and prove that customer sessions never receive rows for other owners.

## `createPaymentSchema rejects non-positive payment amounts` in `tests/validation/paymentSchemas.test.ts`
This is worth a test because amount validation belongs at the API boundary. Letting impossible money values into the service layer makes failures harder to reason about and easier to mishandle.

A more thorough production suite would add boundary cases for currency normalization, refund-reason refinement, and malformed payload shapes against the real `POST /api/payments` route.

Execution note: the validation test currently depends on `zod`, which is declared in `package.json` but not installed in this workspace by request. The test file is present and ready, but running it here fails with `ERR_MODULE_NOT_FOUND` for `zod`.
