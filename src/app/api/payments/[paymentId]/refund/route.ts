import { Permission } from "../../../../../lib/permissions";
import { jsonError, jsonOk, parseJson } from "../../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../../lib/auth/guards";
import { refundPaymentSchema } from "../../../../../lib/validation/paymentSchemas";
import { createRefundForPayment } from "../../../../../services/refundService";

export const POST = withRouteAuth<{ paymentId: string }>(
  { permission: Permission.PAYMENT_REFUND },
  async ({ request, params, session }) => {
    try {
      const body = await parseJson(request, (payload) => refundPaymentSchema.parse(payload));
      const result = await createRefundForPayment({
        paymentId: params.paymentId,
        amountMinor: body.amountMinor,
        reason: body.reason,
        session,
      });

      return jsonOk(result, 202);
    } catch (error) {
      return jsonError(error);
    }
  },
);
