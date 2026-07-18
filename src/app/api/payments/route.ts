import { Permission } from "../../../lib/permissions";
import { jsonError, jsonOk, parseJson } from "../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../lib/auth/guards";
import { createPaymentSchema } from "../../../lib/validation/paymentSchemas";
import { createPaymentWithIdempotency } from "../../../services/paymentService";

export const POST = withRouteAuth<{}>(
  { permission: Permission.PAYMENT_CREATE },
  async ({ request, session }) => {
    try {
      const body = await parseJson(request, (payload) => createPaymentSchema.parse(payload));
      const result = await createPaymentWithIdempotency({
        body,
        idempotencyKey: request.headers.get("Idempotency-Key"),
        session,
      });

      return jsonOk(result.body, result.statusCode);
    } catch (error) {
      return jsonError(error);
    }
  },
);
