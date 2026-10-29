import { createServer } from "node:http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpServer from "effect/http/HttpServer";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { AppConfig, appConfigLayer } from "./config.ts";
import { app } from "./app.ts";
const program = Effect.gen(function* () {
  const config = yield* AppConfig;
  yield* Layer.launch(
    HttpServer.serve()(app).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: config.host })),
    ),
  );
}).pipe(Effect.provide(appConfigLayer));
NodeRuntime.runMain(program);
