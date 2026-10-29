# Budgie

A pnpm monorepo with applications in `apps/` and shared packages in `packages/`.
Each workspace belongs in its own subdirectory with a `package.json`.

Use pnpm 10.20.0, pinned in the root `package.json`:

```sh
corepack pnpm install
```

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days). This applies to
direct and transitive dependencies, with no age-policy exclusions configured.
Reference sibling workspace packages using the `workspace:*` protocol.

Node is pinned to 24.22.1 in `mise.toml` and `.node-version`. Run commands with
`mise exec node@24.22.1 -- pnpm ...` when your shell has a different Node version.
External dependency versions are pinned once in the `pnpm-workspace.yaml` default
catalog. Package manifests use `catalog:`; internal dependencies use `workspace:*`.

## Run locally

Use Node 24.22.1 and pnpm 10.20.0. Docker must be running. All Supabase commands
use the project-local CLI.

```sh
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase db reset --local --no-seed
pnpm setup:local http://127.0.0.1:3001/callback
pnpm build
pnpm start
```

Replace the callback URL with your MCP client's registered callback. Setup creates
a dedicated OAuth client and private audience mapping, and writes ignored local
configuration files. It prints the public client ID for your MCP client. Re-running
setup creates another registration; run it once per client. Never use a production
project with the local setup or integration scripts.

Connect your MCP client to `http://127.0.0.1:3000/mcp`, using the client ID from setup.
Sign in on the separate consent page with an emailed code. Local email is captured
at `http://127.0.0.1:54324`. Approve access to create/list your envelopes.
The embedded UI uses only the MCP bridge; it receives no OAuth credentials.

```sh
pnpm check
pnpm test
pnpm test:integration
pnpm format:check
docker exec -i supabase_db_budgie psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/envelopes.sql
```

`test:integration` exercises real local OTP, consent, PKCE, token refresh, audience
rejection, persistence, concurrent duplicates, four paginated sorts and HTTP MCP.
It provisions and cleans up its own user, client and audience mapping.

For the SDK browser harness, build first, then run
`pnpm --filter @budgie/ui exec vite --host 127.0.0.1` and open
`http://127.0.0.1:5173/smoke.html`. The harness uses fixture tool responses through
the official Apps bridge; the separate integration script tests real persistence.

See [authentication](docs/authentication.md) and [verification status](docs/verification.md).
