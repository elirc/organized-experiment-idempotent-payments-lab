import { jsonError, jsonOk, parseJson } from "../../../../lib/api/route-helpers";
import { setSessionCookie } from "../../../../lib/auth/session";
import { loginSchema } from "../../../../lib/validation/authSchemas";
import { login } from "../../../../services/authService";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, (payload) => loginSchema.parse(payload));
    const session = await login(input);
    const response = jsonOk({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    });

    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
