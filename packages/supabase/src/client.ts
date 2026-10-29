import { createClient, type SupabaseClient as Client } from "@supabase/supabase-js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  token?: string;
}
export class SupabaseClient extends Context.Service<SupabaseClient, Client>()(
  "@budgie/SupabaseClient",
) {}

/** One client per request scope. Closing the scope aborts outstanding network work;
 * it never signs the user out or revokes the host's credentials. */
export const supabaseClientLayer = (config: SupabaseConfig) =>
  Layer.effect(SupabaseClient)(
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController();
        const client = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: {
            headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([controller.signal, init.signal])
                  : controller.signal,
              }),
          },
        });
        return { client, controller };
      }),
      ({ client, controller }) =>
        Effect.gen(function* () {
          controller.abort();
          yield* Effect.promise(() => client.auth.stopAutoRefresh());
          yield* Effect.promise(() => client.removeAllChannels());
        }),
    ).pipe(Effect.map(({ client }) => client)),
  );
