import assert from "node:assert/strict";
import test from "node:test";

import { buildPaymentListScope } from "../../src/services/paymentAccessPolicy.ts";

test("customer payment queries are scoped to their own user id", () => {
  // This matters because list endpoints are a common place for data leaks when detail endpoints are locked down but queries are not.
  // The bug this catches is removing the owner filter and exposing all payment rows to every customer.
  assert.deepEqual(
    buildPaymentListScope({
      sessionId: "sess_1",
      token: "token",
      userId: "user_customer",
      email: "customer@example.com",
      name: "Customer",
      role: "CUSTOMER",
    }),
    { ownerUserId: "user_customer" },
  );
});
