import { Permission } from "../../../../../lib/permissions";
import { jsonError, jsonOk } from "../../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../../lib/auth/guards";
import { runReconciliation } from "../../../../../services/reconciliationService";

export const POST = withRouteAuth<{}>(
  { permission: Permission.RECONCILIATION_RUN },
  async ({ session }) => {
    try {
      const result = await runReconciliation(session);
      return jsonOk(result, 202);
    } catch (error) {
      return jsonError(error);
    }
  },
);
