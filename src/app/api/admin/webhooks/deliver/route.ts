import { Permission } from "../../../../../lib/permissions";
import { jsonError, jsonOk } from "../../../../../lib/api/route-helpers";
import { withRouteAuth } from "../../../../../lib/auth/guards";
import { webhookDeliverySchema } from "../../../../../lib/validation/reconciliationSchemas";
import { deliverPendingWebhooks } from "../../../../../services/providerSimulatorService";

export const POST = withRouteAuth<{}>(
  { permission: Permission.WEBHOOK_DELIVER },
  async ({ request }) => {
    try {
      const rawBody = await request.text();
      const input = webhookDeliverySchema.parse(rawBody ? JSON.parse(rawBody) : {});
      const result = await deliverPendingWebhooks(input.limit);
      return jsonOk(result);
    } catch (error) {
      return jsonError(error);
    }
  },
);
