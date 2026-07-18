import assert from "node:assert/strict";
import test from "node:test";

import { assertAllowedPaymentTransition } from "../../src/lib/domain/paymentStateMachine.ts";
import { RouteError } from "../../src/lib/errors.ts";

test("cannot move a failed payment back to succeeded", () => {
  // This matters because status regressions in payment systems create false revenue and incorrect refund eligibility.
  // The bug this catches is a webhook or admin path silently overwriting terminal failure state with success later.
  assert.throws(
    () => assertAllowedPaymentTransition("FAILED", "SUCCEEDED"),
    (error) => {
      assert.ok(error instanceof RouteError);
      assert.equal(error.status, 409);
      return true;
    },
  );
});
