import { expect, it } from "vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { serverConfig } from "./config";
const env = {
  SUPABASE_URL: "http://localhost:54321/",
  SUPABASE_PUBLISHABLE_KEY: "local-key",
  MCP_RESOURCE_URL: "http://localhost:3000/mcp",
  MCP_CLIENT_IDS: "one,two",
};
const load = (values: Record<string, string>) =>
  Effect.runPromise(serverConfig.parse(ConfigProvider.fromEnv({ env: values })));
it("loads typed config from an injected provider with defaults", async () => {
  expect(await load(env)).toEqual({
    supabaseUrl: "http://localhost:54321",
    publishableKey: "local-key",
    resource: "http://localhost:3000/mcp",
    clientIds: ["one", "two"],
    port: 3000,
    host: "127.0.0.1",
  });
});
it.each(["bad", "65536", "1.5"])(
  "rejects invalid port %s rather than falling back",
  async (port) => {
    await expect(load({ ...env, PORT: port })).rejects.toThrow();
  },
);
it("rejects missing keys and malformed URLs", async () => {
  await expect(load({})).rejects.toThrow();
  await expect(load({ ...env, MCP_RESOURCE_URL: "not-a-url" })).rejects.toThrow();
});
