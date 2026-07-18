import assert from "node:assert/strict";
import test from "node:test";

import { createPaymentSchema } from "../../src/lib/validation/paymentSchemas.ts";

test("createPaymentSchema rejects non-positive payment amounts", () => {
  // This matters because invalid amounts at the API boundary can turn into provider-side rejects or, worse, malformed ledger data.
  // The bug this catches is letting impossible money values flow into the service layer where the error is harder to reason about.
  assert.throws(() =>
    createPaymentSchema.parse({
      amountMinor: 0,
      currency: "usd",
      description: "Broken payment",
      simulationMode: "SUCCEED",
    }),
  );
});
