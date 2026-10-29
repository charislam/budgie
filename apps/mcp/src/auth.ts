import { AuthenticationUnavailable } from "@budgie/domain";
import * as Effect from "effect/Effect";
import { SupabaseClient } from "@budgie/supabase";
export interface AuthConfig {
  supabaseUrl: string;
  publishableKey: string;
  resource: string;
  clientIds: readonly string[];
}
export const verifyRequest = (request: Request, config: AuthConfig) =>
  Effect.gen(function* () {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    const client = yield* SupabaseClient;
    const { data, error } = yield* Effect.tryPromise({
      try: () => client.auth.getClaims(token),
      catch: (cause) => new AuthenticationUnavailable({ cause }),
    });
    if (error || !data) return null;
    const claims = data.claims;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== `${config.supabaseUrl}/auth/v1` ||
      !audiences.includes(config.resource) ||
      !claims.exp ||
      claims.exp <= Date.now() / 1000 ||
      !claims.sub ||
      claims.role !== "authenticated" ||
      !config.clientIds.includes(String(claims.client_id))
    )
      return null;
    return token;
  });
export const challenge = (config: AuthConfig) =>
  Effect.sync(
    () =>
      new Response("Connect your account to use Budgie.", {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource", config.resource)}"`,
        },
      }),
  );
