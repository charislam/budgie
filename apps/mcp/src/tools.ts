import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  publicError,
  CreateInput,
  ListInput,
  CreateResult,
  ListResult,
  type ValidationError,
  type StoreError,
} from "@budgie/domain";
import { EnvelopeRepository } from "@budgie/domain";

import { formatToolText, type ToolValue } from "./tool-text.ts";

export const createResourceUri = "ui://budgie/create-envelope.html";
export const resourceUri = "ui://budgie/envelopes.html";
function standard<S extends Schema.Constraint & Schema.ConstraintDecoder<unknown>>(schema: S) {
  const validation = Schema.toStandardSchemaV1(schema, {
    parseOptions: { onExcessProperty: "error" },
  });
  const json = Schema.toStandardJSONSchemaV1(schema);
  return { "~standard": { ...validation["~standard"], ...json["~standard"] } };
}
export function createMcpServer(
  store: typeof EnvelopeRepository.Service,
  html: string,
  createHtml: string = html,
) {
  const server = new McpServer({ name: "Budgie", version: "0.1.0" });
  const metadata = {
    ui: { resourceUri, visibility: ["model", "app"] as ("model" | "app")[] },
  };
  const run = async <A extends ToolValue, M extends { generation: number }>(
    operation: Effect.Effect<A, ValidationError | StoreError>,
    responseMetadata: M,
    signal?: AbortSignal,
  ) => {
    const result = await Effect.runPromise(Effect.result(operation), { signal });
    if (result._tag === "Failure") {
      const error = publicError(result.failure);
      const { message } = error;
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
        structuredContent: {
          ...responseMetadata,
          ok: false,
          error,
        },
      };
    }
    const value = result.success;
    const text = formatToolText(value);
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: {
        ok: true,
        ...value,
        ...responseMetadata,
      },
    };
  };
  registerAppTool(
    server,
    "create_envelope",
    {
      description: "Create a private budget envelope.",
      inputSchema: standard(CreateInput),
      outputSchema: standard(CreateResult),
      _meta: { ui: { ...metadata.ui, resourceUri: createResourceUri } },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input, extra) =>
      run(
        store.create(input).pipe(Effect.map((envelope) => ({ envelope }))),
        { generation: input.generation ?? 0 },
        extra.mcpReq.signal,
      ),
  );
  registerAppTool(
    server,
    "list_envelopes",
    {
      description: "List up to 50 envelopes. Pass next_cursor to continue.",
      inputSchema: standard(ListInput),
      outputSchema: standard(ListResult),
      _meta: metadata,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input, extra) =>
      run(
        store.list(input),
        {
          generation: input.generation ?? 0,
          sort: input.sort ?? "name_asc",
          cursor: input.cursor ?? null,
        },
        extra.mcpReq.signal,
      ),
  );
  registerAppResource(server, "Envelopes", resourceUri, {}, async () => ({
    contents: [
      {
        uri: resourceUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      },
    ],
  }));
  registerAppResource(server, "Create envelope", createResourceUri, {}, async () => ({
    contents: [
      {
        uri: createResourceUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: createHtml,
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      },
    ],
  }));
  return server;
}
