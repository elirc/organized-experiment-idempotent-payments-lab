import { Permission } from "../../../../../lib/permissions";
import { jsonError, jsonOk } from "../../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../../lib/auth/guards";
import { listReconciliationIssues } from "../../../../../services/reconciliationService";

export const GET = withRouteAuth<{}>(
  { permission: Permission.RECONCILIATION_RUN },
  async () => {
    try {
      const issues = await listReconciliationIssues();
      return jsonOk({ issues });
    } catch (error) {
      return jsonError(error);
    }
  },
);
