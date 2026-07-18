import assert from "node:assert/strict";
import test from "node:test";

import { requirePermission } from "../../src/lib/auth/authorization.ts";
import { Permission } from "../../src/lib/permissions.ts";
import { RouteError } from "../../src/lib/errors.ts";

test("support role cannot run reconciliation", () => {
  // This matters because staff UIs often show links to powerful endpoints; the route guard still has to reject the call.
  // The bug this catches is accidentally treating every authenticated back-office user as fully privileged.
  assert.throws(
    () =>
      requirePermission(
        {
          userId: "user_support",
          role: "SUPPORT",
        },
        Permission.RECONCILIATION_RUN,
      ),
    (error) => {
      assert.ok(error instanceof RouteError);
      assert.equal(error.status, 403);
      return true;
    },
  );
});
