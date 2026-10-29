import { expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { SupabaseClient, supabaseClientLayer } from "./client";
it("provides an isolated credential scope and aborts its network lifetime on release", async () => {
  const requests: { signal: AbortSignal; authorization: string | null }[] = [];
  const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    requests.push({
      signal: init!.signal!,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  });
  try {
    for (const token of ["user-one", "user-two"]) {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* SupabaseClient;
          yield* Effect.promise(async () => {
            await client.from("envelopes").select("id");
          });
          expect(requests.at(-1)!.signal.aborted).toBe(false);
        }).pipe(
          Effect.provide(
            supabaseClientLayer({ url: "http://localhost:54321", publishableKey: "test", token }),
          ),
        ),
      );
      expect(requests.at(-1)!.signal.aborted).toBe(true);
    }
    expect(requests.map((request) => request.authorization)).toEqual([
      "Bearer user-one",
      "Bearer user-two",
    ]);
    expect(requests[0].signal).not.toBe(requests[1].signal);
  } finally {
    mock.mockRestore();
  }
});
