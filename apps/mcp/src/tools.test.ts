import { it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { createMcpServer, resourceUri, createResourceUri } from "./tools";
import type { envelopeStore } from "@budgie/supabase";
it("negotiates tools and the UI resource with the official SDK", async () => {
  const store = {
    create: () =>
      Effect.succeed({
        id: "test",
        name: "Food",
        description: null,
        created_at: "2026-10-29T00:00:00.000Z",
      }),
    list: () =>
      Effect.succeed({ envelopes: [], sort: "name_asc", has_more: false, next_cursor: null }),
  } as ReturnType<typeof envelopeStore>;
  const server = createMcpServer(store, "<!doctype html><title>Budgie</title>");
  const client = new Client({ name: "acceptance", version: "1" });
  const b = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (input, init) => {
      const instance = createMcpServer(store, "<!doctype html><title>Budgie</title>");
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await instance.connect(transport);
      try {
        const response = await transport.handleRequest(new Request(input, init));
        const body = await response.arrayBuffer();
        return new Response(body.byteLength ? body : null, {
          status: response.status,
          headers: response.headers,
        });
      } finally {
        await instance.close();
      }
    },
  });
  await client.connect(b);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["create_envelope", "list_envelopes"]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool._meta).toMatchObject({
        ui: { resourceUri: tool.name === "create_envelope" ? createResourceUri : resourceUri },
      });
    }
    const result = await client.callTool({
      name: "list_envelopes",
      arguments: { generation: 42, sort: "name_desc", cursor: "request-cursor" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      envelopes: [],
      generation: 42,
      cursor: "request-cursor",
    });
    const created = await client.callTool({
      name: "create_envelope",
      arguments: { name: "Food", generation: 43 },
    });
    expect(created.structuredContent).toMatchObject({ ok: true, generation: 43 });
    expect((await client.listResources()).resources.map((resource) => resource.uri)).toEqual([
      resourceUri,
      createResourceUri,
    ]);
    expect((await client.readResource({ uri: createResourceUri })).contents[0].mimeType).toBe(
      "text/html;profile=mcp-app",
    );
    expect((await client.readResource({ uri: resourceUri })).contents[0].mimeType).toBe(
      "text/html;profile=mcp-app",
    );
  } finally {
    await client.close();
    await server.close();
  }
});
