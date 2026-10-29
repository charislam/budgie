import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

export const serverConfig = Config.all({
  supabaseUrl: Config.URL("SUPABASE_URL").pipe(Config.map((url) => url.href.replace(/\/$/, ""))),
  publishableKey: Config.NonEmptyString("SUPABASE_PUBLISHABLE_KEY"),
  resource: Config.URL("MCP_RESOURCE_URL").pipe(Config.map((url) => url.href)),
  clientIds: Config.Array(Schema.NonEmptyString, "MCP_CLIENT_IDS"),
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  host: Config.NonEmptyString("HOST").pipe(Config.withDefault("127.0.0.1")),
});
export type ServerConfig = Config.Success<typeof serverConfig>;

export class AppConfig extends Context.Service<AppConfig, ServerConfig>()("@budgie/AppConfig") {}
export const appConfigLayer = Layer.effect(AppConfig)(serverConfig);
