import { Permission } from "../../../../../lib/permissions";
import { jsonError, jsonOk } from "../../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../../lib/auth/guards";
import { getVisiblePaymentDetail } from "../../../../../services/paymentQueryService";

export const GET = withRouteAuth<{ paymentId: string }>(
  { permission: Permission.PAYMENT_READ_ANY },
  async ({ params, session }) => {
    try {
      const payment = await getVisiblePaymentDetail(params.paymentId, session);
      return jsonOk({ payment });
    } catch (error) {
      return jsonError(error);
    }
  },
);
