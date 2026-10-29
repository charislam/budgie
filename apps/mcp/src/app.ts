import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRequest from "effect/http/HttpServerRequest";
import * as HttpResponse from "effect/http/HttpServerResponse";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { envelopeRepositoryLayer, supabaseClientLayer } from "@budgie/supabase";
import { RequestError, EnvelopeRepository } from "@budgie/domain";
import { createMcpServer } from "./tools.ts";
import { challenge, verifyRequest } from "./auth.ts";
import { AppConfig } from "./config.ts";
import { readStaticFile } from "./static-file.ts";
const publicDirectory = fileURLToPath(new URL("../../ui/dist/", import.meta.url));
const attempt = <A>(operation: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new RequestError({ cause }),
  });
const handle = (request: Request) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const path = new URL(request.url).pathname;
    if (path === "/.well-known/oauth-protected-resource")
      return Response.json({
        resource: config.resource,
        authorization_servers: [`${config.supabaseUrl}/auth/v1`],
        bearer_methods_supported: ["header"],
      });
    if (path === "/health") return new Response("ok");
    if (path === "/login.html" || /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(path)) {
      const body = yield* readStaticFile(publicDirectory, path.slice(1));
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": path.endsWith(".js")
            ? "application/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : "text/html",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (path !== "/mcp") return new Response("Not found", { status: 404 });
    const token = yield* verifyRequest(request, config).pipe(
      Effect.provide(
        supabaseClientLayer({ url: config.supabaseUrl, publishableKey: config.publishableKey }),
      ),
    );
    if (!token) return yield* challenge(config);
    return yield* Effect.gen(function* () {
      const store = yield* EnvelopeRepository;
      const html = new TextDecoder().decode(
        yield* readStaticFile(publicDirectory, "envelopes.html"),
      );
      const createHtml = new TextDecoder().decode(
        yield* readStaticFile(publicDirectory, "create-envelope.html"),
      );
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => createMcpServer(store, html, createHtml)),
        (server) => Effect.promise(() => server.close()),
      );
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      yield* attempt(() => server.connect(transport));
      const response = yield* attempt(() => transport.handleRequest(request));
      const body = yield* attempt(() => response.arrayBuffer());
      return new Response(body.byteLength ? body : null, {
        status: response.status,
        headers: response.headers,
      });
    }).pipe(
      Effect.provide(
        envelopeRepositoryLayer.pipe(
          Layer.provide(
            supabaseClientLayer({
              url: config.supabaseUrl,
              publishableKey: config.publishableKey,
              token,
            }),
          ),
        ),
      ),
    );
  }).pipe(
    Effect.scoped,
    Effect.catch(() => Effect.succeed(new Response("Unable to complete request", { status: 503 }))),
  );
export const app = Effect.gen(function* () {
  const request = yield* HttpRequest.HttpServerRequest;
  const web = yield* HttpRequest.toWeb(request);
  return yield* handle(web).pipe(Effect.map(HttpResponse.fromWeb));
});
