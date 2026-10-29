# 0001 — Initial envelope management

Status: ready for implementation, subject to the compatibility checks below.
Date: 2026-10-28.
Application: Budgie.

## Purpose and milestone

Build an authenticated MCP App that lets each user create private budget envelopes and view them in an embedded UI or as text. This is the foundation for envelope budgeting, not a money-management implementation yet.

Completion means a locally tested implementation. Production deployment, public distribution, and app review are outside this milestone. This document specifies future implementation; it does not claim that compatibility checks or tests have already passed.

## Agreed scope

- Multiple users, each with one implicit private collection of envelopes. No shared households or separate budget entities.
- Open signup through Supabase Auth using passwordless email OTP.
- Creation through conversation and through the UI, both invoking the same MCP tool and domain logic.
- Compact table with optional descriptions, creation dates, sorting, pagination, and manual refresh.
- Sort choices: Name A–Z (default), Name Z–A, Oldest first, Newest first. Selection persists only within the current mounted UI.
- Pages contain at most 50 envelopes.
- Realtime updates are desirable but conditional on demonstrated host and authentication support. If infeasible, omit them; do not substitute periodic polling.
- Exactly two application tools: `create_envelope` and `list_envelopes`.
- No monetary fields: no currency, starting balance, target, allocation, or balance.
- No editing, deletion, archiving, funding, spending, transfers, recurring budgets, bank connections, or financial calculations.

## Technology and dependency policy

Use TypeScript, Lit web components, Effect v4, Supabase, and official MCP/MCP Apps SDKs. The MCP server runs on a Node.js HTTP service intended for Supabase Compute, using Effect's official Node platform adapter. Effect owns domain validation, service composition, typed errors, asynchronous workflows, and resource lifetimes. Lit owns rendering.

Approved direct dependency families:
- Lit.
- Effect v4 and necessary Effect-owned platform/integration packages.
- Official MCP and MCP Apps SDKs.
- Official Supabase SDK.
- Development tools: TypeScript, Vite, Vitest, oxlint, oxfmt.

Ask the user before adding another direct dependency, including a new validation, routing, UI, auth, browser-test, or build library. Required transitive dependencies of approved packages are allowed; do not import them directly to evade this rule. If an SDK requires an otherwise unapproved direct peer dependency, ask before adding it. Use Effect Schema for application schemas.

Keep pnpm 10.20.0, workspace:* internal references, the repository's seven-day minimum release age, exact compatible package versions, and committed lockfiles. Do not silently downgrade to Effect v3 or bypass the release-age policy.

Suggested boundaries:
- `apps/mcp`: Effect HTTP application, MCP transport, auth integration, resource delivery.
- `apps/ui`: Lit embedded UI and separate login/consent entry point, bundled with Vite.
- `packages/domain`: Effect schemas, envelope types, errors, service interfaces and use cases.
- `packages/supabase`: persistence adapter.
- `supabase/`: local configuration and versioned migrations.

The Node server entry point should be a thin composition root referencing the server application. Shared code must remain compatible with both the browser and Node.js where applicable.

## Compatibility checks before feature implementation

Record exact tested package versions and findings in implementation documentation.

1. Run an Effect v4 HTTP endpoint through the official Node adapter in a local Node.js server. Record the exact supported Node version and confirm request cancellation, responses, startup, graceful shutdown, and cleanup. Target Supabase Compute for eventual hosting. Verify available Compute runtime and service configuration against current official documentation; do not assume Edge Functions configuration applies. Hosted deployment is outside this local milestone and Compute alpha access is not required for local completion.
2. Connect the official MCP SDK's Web Request/Response-compatible Streamable HTTP transport to the Effect application. Verify the transport's integration with the Node server and avoid process-local durable sessions.
3. Verify local Supabase OAuth server configuration, PKCE account linking, authorization metadata discovery, and token verification. Test the exact resource/audience contract rather than accepting arbitrary valid Supabase tokens.
4. Load the Vite-built Lit resource through the official MCP Apps bridge and invoke both tools.
5. Investigate the optional Realtime route described below.

If a mandatory compatibility check fails, document the precise blocker and obtain a decision before substituting another runtime, platform adapter, auth model, or dependency. Optional Realtime failure does not block the milestone.

## Authentication and authorization

Supabase Auth is the identity provider and OAuth authorization server. MCP account linking uses authorization-code flow with PKCE and explicit user consent. Email OTP authenticates users on a separate first-party login/consent page, not inside tool arguments or chat.

Flow:
1. An unauthenticated protected MCP request receives the standards-required authentication challenge and protected-resource metadata.
2. The client discovers Supabase authorization-server metadata and uses a configured OAuth registration. Support registration appropriate to the local client; enable dynamic registration only when needed and configured.
3. The user opens the authorization page, enters an email address, and receives an OTP. Signup is allowed.
4. Verify the code through Supabase Auth. Configure the email template to send the code rather than a magic-link-only message.
5. Display the requesting client and requested access, with approve and deny actions.
6. Supabase completes the OAuth exchange; the MCP host holds its tokens and sends authenticated tool calls.

Treat authorization identifiers, redirects, state, and PKCE according to the provider and MCP requirements. Never accept arbitrary return URLs from form inputs. Include resend, expiry, incorrect-code, denied-consent, and provider-rate-limit states.

Validate access tokens using supported Supabase facilities and the required issuer, expiry, audience/resource and client checks. Derive ownership from verified identity. Never accept a tool-supplied user ID. Forward the authenticated user's credentials to a request-scoped Supabase client so database RLS applies. Never use service-role access for ordinary envelope operations.

Do not place credentials, OTPs, refresh tokens, or access tokens in tool results, model-visible content, URLs, or logs. The embedded UI does not receive the MCP host's token. Metadata and resource discovery must remain accessible as required by the selected auth protocol without exposing user data.

Local development must exercise real Auth and email-code verification using Supabase's local email capture facility, not an authentication bypass.

## Envelope model and database invariants

Each envelope contains:

| Field | Storage | Rule |
| --- | --- | --- |
| id | UUID | Server/database generated, immutable |
| user_id | UUID referencing auth.users | Verified owner, never public tool input |
| name | text | Trimmed, required, 1–100 Unicode code points |
| description | nullable text | Trimmed, at most 500 Unicode code points; blank becomes null |
| created_at | timestamptz | Database generated, immutable |

Public representations expose id, name, description, and created_at only. Timestamps use UTC ISO 8601; the UI may format them in the user's locale.

Use one shared normalization and validation definition for tool and form inputs. Reject unknown input properties and wrong types. UI validation is advisory; server and database invariants remain authoritative.

Names are unique per user after trimming and case-insensitive comparison. Database uniqueness must enforce this atomically, including concurrent creates. Use a database-derived normalized key or equivalent expression index based on the stored name, with a documented deterministic database collation. Preserve display capitalization. Unicode normalization beyond trimming and case handling is not promised; document and test the chosen comparison semantics. Do not implement competing JavaScript and database duplicate algorithms.

Enable RLS. Authenticated users may SELECT only their own rows and INSERT only with their own user_id. Grant only necessary table privileges; no anonymous envelope access and no client UPDATE or DELETE access. Index ownership and sort keys where appropriate. Enforce required lengths and uniqueness in the database as well as application validation.

Use explicit, versioned schema migrations and a clean local database reset to verify reproducibility. No production database changes are part of this task.

## MCP interface

Use standard MCP Streamable HTTP on the Node server endpoint. Tool definitions declare input and output schemas. Use official SDK facilities for protocol serialization, capability negotiation, and UI registration.

Both tools declare the standard MCP Apps UI resource reference:
`_meta.ui.resourceUri = "ui://budgie/envelopes.html"`.

Register the resource with MIME type `text/html;profile=mcp-app`. Allow model and embedded-app invocation through standard tool visibility metadata. Results always contain usable text content alongside structuredContent. Clients without UI capability must still create envelopes and read paginated lists.

### create_envelope

Input:
```json
{ "name": "Groceries", "description": "Food and household basics" }
```

name is required; description is optional. No owner, ID, timestamp, currency, or amount inputs.

Successful structuredContent:
```json
{
  "ok": true,
  "envelope": {
    "id": "<uuid>",
    "name": "Groceries",
    "description": "Food and household basics",
    "created_at": "<UTC ISO 8601>"
  }
}
```

Text confirms the saved name and ID. Creation is atomic. A repeated create with the same normalized name returns a duplicate error, never silently returns the existing envelope. Do not automatically retry a create after an ambiguous network failure; prompt the user to refresh before trying again.

Annotations: readOnlyHint false, destructiveHint false, idempotentHint false, openWorldHint false. These are descriptive hints, not authorization.

### list_envelopes

Input:
```json
{ "sort": "name_asc", "cursor": null }
```

Both fields are optional. sort is one of name_asc, name_desc, created_asc, created_desc; default name_asc. cursor is null or an opaque continuation token. Page size is fixed at 50.

Successful structuredContent:
```json
{
  "ok": true,
  "envelopes": [],
  "sort": "name_asc",
  "next_cursor": null,
  "has_more": false
}
```

Apply ordering to the complete authorized collection before pagination. Name order uses the database's normalized name ordering, then ID; creation order uses created_at, then ID. Apply a deterministic matching direction to tie breakers.

Use keyset pagination. Validate cursor structure and its sort association; cursors never authorize access. Changing sort starts at the first page. Concurrent insertion does not imply snapshot consistency; refreshing restarts the listing. Empty collections return a successful empty array. Text describes the current page, selected order, and whether more results are available, including the continuation token when needed for a text-only client.

Annotations: readOnlyHint true, destructiveHint false, idempotentHint true, openWorldHint false.

### Errors

Tool execution failures return isError true and a schema-defined structured error:
```json
{
  "ok": false,
  "error": {
    "code": "DUPLICATE_ENVELOPE",
    "message": "An envelope with this name already exists.",
    "field": "name"
  }
}
```

Codes: VALIDATION_ERROR, DUPLICATE_ENVELOPE, INVALID_CURSOR, RATE_LIMITED, TEMPORARILY_UNAVAILABLE, INTERNAL_ERROR. field is optional. Map the database uniqueness violation to DUPLICATE_ENVELOPE. Hide SQL, stack traces and internal identifiers.

Authentication failures use the applicable MCP/HTTP authentication challenge so clients can link or renew credentials; do not disguise them as empty lists. Protocol-level malformed requests use MCP protocol errors. A transient read may be retried with a bounded Effect policy; a failed mutation is not blindly retried.

## Embedded UI

Use semantic Lit components, native controls, and CSS without another UI library.

The screen includes:
- Heading and compact table: Name, Description, Created.
- Sort selector, Refresh button, and next/previous page controls. Retain cursor history within the UI to support Previous.
- Create-envelope form with name and optional description, inline validation, and submission status.
- Loading, empty, failure-with-retry, authentication-required, and disconnected states.

Connect through the standard MCP Apps initialization and tool-call bridge. Render host-delivered tool results and use the same tools for user interactions. No separate browser CRUD API.

On successful creation, show confirmation of the saved envelope, clear the form, and refresh the first page with the current sort. The saved row may fall on another page; confirmation must still be visible. On failure retain entered values. Disable duplicate submissions while pending.

Use Effect-managed async state and cancellation to prevent stale list responses overwriting newer sorts or refreshes. Abort or ignore superseded work. Dispose subscriptions and resources when the UI unmounts.

Sort is instance-local, with no database or cross-session persistence. Refresh restarts at page one. Table text is escaped by Lit; never interpret user content as HTML. Support keyboard navigation, labels, focus on invalid fields, announced status changes, responsive overflow, and host-supported light/dark theming.

Bundle scripts and styles with Vite using approved tooling; do not add an unapproved single-file plugin. Deliver assets in a form the MCP resource sandbox can load, with explicit standard CSP metadata for any required origins. Prefer a self-contained resource where practical.

## Standards-first portability

MCP Apps is the default UI contract. Use its resource metadata, initialization, tool calls, result notifications, theming and lifecycle facilities wherever supported. The core envelope flow must not depend on window.openai.

Only add a ChatGPT extension for a concrete requirement not covered by MCP Apps. Isolate it behind capability detection, document the missing standard capability and fallback, and ensure non-ChatGPT operation remains usable. No ChatGPT extension is required by the product scope as currently defined.

ChatGPT is the target host. Locally test standard bridge behavior with an approved SDK-based harness and verify text-only operation. An actual ChatGPT connection can be an additional manual smoke test when a reachable endpoint is available; public deployment or a tunnel dependency is not required for local completion.

## Conditional Realtime

Investigate a Supabase Realtime subscription scoped to the authenticated user and a supported host notification path that causes open UIs to refetch list_envelopes. Prefer notifications as invalidations over independently maintaining client-side sorted pages.

Do not assume the sandbox has the host's OAuth credentials, that standard tool-result notifications are a general database event channel, or that a Node service can keep a subscription alive across shutdowns, restarts, or scaling.

Enable Realtime only after demonstrating:
- Authorized events cannot cross users.
- The target host can deliver updates to an already-open UI through a supported path.
- Node service lifecycle, scaling and reconnect behavior are viable.
- No credentials are exposed to the model or copied out of the host to make it work.
- The implementation uses only approved dependencies.

If those conditions cannot be met, omit live synchronization and record the reason. Retain refresh after local creation and manual refresh. No polling fallback is required. If enabled, coalesce invalidations, refresh the first page under the selected sort, and clean up subscriptions on disconnect; stale data remains visibly recoverable through manual refresh.

## Local acceptance criteria

1. A clean checkout can install approved dependencies, build both UI entry points, start local Supabase and the Node server, and apply migrations using documented commands.
2. TypeScript checks, Vitest tests, oxlint and oxfmt checks pass. Node HTTP server integration is exercised separately from unit tests, including cancellation and shutdown.
3. A new user signs up with an emailed code, approves account linking, and calls both tools. Incorrect/expired OTP, consent denial, expired credentials and missing credentials have usable outcomes.
4. A user creates an envelope by tool call and by UI. Both share validation and persistence behavior; saved data survives server restart.
5. Name/description bounds, whitespace-only names, blank descriptions, invalid properties and Unicode code-point lengths are tested.
6. Sequential and concurrent case-insensitive duplicate creates produce exactly one row and a duplicate error for subsequent attempts.
7. Two authenticated users can use the same envelope name. Neither can list or insert rows as the other user, including direct Data API access. Anonymous access fails.
8. All four sort orders work across more than 50 rows. Tie cases, cursor validation, last/empty pages and sort changes are tested.
9. Clients without UI support receive complete usable create results and page descriptions, with a way to request subsequent pages.
10. The UI handles success, errors, empty data, stale request races, pagination, refresh and authentication expiry; keyboard and responsive behavior receive a documented browser smoke test.
11. MCP resource metadata, tool schemas/annotations, standard bridge calls and text fallbacks are checked using the approved SDKs. No unapproved test dependency is introduced.
12. Realtime is either demonstrated with cross-user isolation and teardown tests, or explicitly omitted with the compatibility finding recorded.
13. No mandatory compatibility blocker is hidden behind a mock, skipped test or unapproved architectural substitution.

Automate domain, tool, persistence and auth boundary checks with Vitest and supported local facilities. Browser behavior may be manually verified unless an approved tool already covers it. Do not add Playwright or a DOM emulation library without asking.

## Reference baseline

Verify against these primary sources when implementing; package versions and unstable APIs must be pinned and tested.

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [Official MCP Apps repository and specification](https://github.com/modelcontextprotocol/ext-apps)
- [OpenAI MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [OpenAI authentication guidance](https://developers.openai.com/plugins/build/auth)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth server](https://supabase.com/docs/guides/auth/oauth-server)
- [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Effect v4 NodeHttpServer](https://effect.website/docs/v4/api/platform-node/NodeHttpServer)
- [Supabase Compute](https://supabase.com/compute)
- [Supabase Compute private alpha announcement](https://supabase.com/blog/supabase-compute-private-alpha)

The Supabase changelog markdown endpoint could not be fetched by the research tool during specification drafting; review current relevant changes before implementation. This specification records required behavior, not a claim of end-to-end runtime compatibility.
