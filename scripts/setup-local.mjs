import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const redirect = process.argv[2];
if (!redirect || !/^https?:\/\//.test(redirect))
  throw new Error("Usage: pnpm setup:local <MCP-client-callback-URL>");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await admin.auth.admin.oauth.createClient({
  client_name: "Budgie local client",
  redirect_uris: [redirect],
  token_endpoint_auth_method: "none",
});
if (error) throw new Error(error.message);
if (!/^[a-zA-Z0-9-]+$/.test(data.client_id)) throw new Error("Unexpected client ID");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_budgie",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: `insert into private.oauth_client_audiences(client_id,audience) values ('${data.client_id}','http://127.0.0.1:3000/mcp');`,
    stdio: ["pipe", "ignore", "pipe"],
  },
);
await writeFile(
  ".env.local",
  `SUPABASE_URL=${status.API_URL}\nSUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nMCP_RESOURCE_URL=http://127.0.0.1:3000/mcp\nMCP_CLIENT_IDS=${data.client_id}\n`,
  { mode: 0o600 },
);
await writeFile(
  "apps/ui/.env.local",
  `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\n`,
  { mode: 0o600 },
);
console.log(
  `Registered OAuth client ${data.client_id}. Local configuration written. Run pnpm build, then pnpm start.`,
);
