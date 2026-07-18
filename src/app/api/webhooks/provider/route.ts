import { jsonError, jsonOk, parseJson } from "../../../../lib/api/route-helpers";
import { processProviderWebhook } from "../../../../services/webhookService";

export async function POST(request: Request) {
  try {
    const payload = await parseJson(request, (body) => body as Record<string, unknown>);

    // ⚠️ SENIOR NOTE: a real provider webhook route must verify a signature before trusting the payload; this demo keeps the focus on idempotent processing.
    const result = await processProviderWebhook(payload);
    return jsonOk(result, 202);
  } catch (error) {
    return jsonError(error);
  }
}
