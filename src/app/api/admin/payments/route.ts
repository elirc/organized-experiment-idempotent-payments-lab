import { Permission } from "../../../../lib/permissions";
import { jsonError, jsonOk } from "../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../lib/auth/guards";
import { listVisiblePayments } from "../../../../services/paymentQueryService";

export const GET = withRouteAuth<{}>(
  { permission: Permission.PAYMENT_READ_ANY },
  async ({ session }) => {
    try {
      const payments = await listVisiblePayments(session);
      return jsonOk({ payments });
    } catch (error) {
      return jsonError(error);
    }
  },
);
