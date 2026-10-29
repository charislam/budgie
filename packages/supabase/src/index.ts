import { SupabaseClient, supabaseClientLayer } from "./client.ts";
export { SupabaseClient, supabaseClientLayer } from "./client.ts";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  Envelope,
  normalizeCreate,
  parseList,
  Sort,
  StoreError,
  EnvelopeRepository,
} from "@budgie/domain";
const Cursor = Schema.Struct({
  v: Schema.Literal(1),
  sort: Sort,
  key: Schema.String,
  id: Schema.String,
});
const StoredRows = Schema.Array(Schema.Struct({ ...Envelope.fields, name_key: Schema.String }));
const unavailable = () =>
  new StoreError({
    code: "TEMPORARILY_UNAVAILABLE",
    message: "Unable to reach your envelopes. Refresh before trying again.",
  });
const invalidCursor = () =>
  new StoreError({
    code: "INVALID_CURSOR",
    message: "This page token is invalid. Refresh to start again.",
  });
const databaseError = (error: { code?: string }) =>
  error.code === "23505"
    ? new StoreError({
        code: "DUPLICATE_ENVELOPE",
        message: "An envelope with this name already exists.",
        field: "name",
      })
    : error.code === "23514"
      ? new StoreError({ code: "INTERNAL_ERROR", message: "The envelope could not be saved." })
      : unavailable();
const decodeCursor = (cursor: string | null, sort: Sort) =>
  Effect.gen(function* () {
    if (cursor === null) return null;
    if (!cursor || cursor.length > 4096) return yield* Effect.fail(invalidCursor());
    const raw = yield* Effect.try({
      try: () => JSON.parse(Buffer.from(cursor, "base64url").toString()),
      catch: invalidCursor,
    });
    const parsed = yield* Schema.decodeUnknownEffect(Cursor, { onExcessProperty: "error" })(
      raw,
    ).pipe(Effect.mapError(invalidCursor));
    if (
      parsed.sort !== sort ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id) ||
      (sort.startsWith("created") && !Number.isFinite(Date.parse(parsed.key)))
    )
      return yield* Effect.fail(invalidCursor());
    return parsed;
  });
export const makeEnvelopeStore = Effect.gen(function* () {
  const client = yield* SupabaseClient;
  return {
    create: (input: unknown) =>
      Effect.gen(function* () {
        const value = yield* normalizeCreate(input);
        const result = yield* Effect.tryPromise({
          try: (signal) =>
            Promise.resolve(
              client
                .from("envelopes")
                .insert(value)
                .select("id,name,description,created_at")
                .abortSignal(signal)
                .single(),
            ),
          catch: unavailable,
        });
        if (result.error) return yield* Effect.fail(databaseError(result.error));
        const envelope = yield* Schema.decodeUnknownEffect(Envelope)(result.data).pipe(
          Effect.mapError(
            () =>
              new StoreError({ code: "INTERNAL_ERROR", message: "Unexpected envelope response." }),
          ),
        );
        return { ...envelope, created_at: new Date(envelope.created_at).toISOString() };
      }),
    list: (input: unknown) =>
      Effect.gen(function* () {
        const { sort, cursor } = yield* parseList(input);
        const position = yield* decodeCursor(cursor, sort);
        const result = yield* Effect.tryPromise({
          try: (signal) =>
            Promise.resolve(
              client
                .rpc("list_envelopes_page", {
                  requested_sort: sort,
                  after_key: position?.key ?? null,
                  after_id: position?.id ?? null,
                })
                .abortSignal(signal),
            ),
          catch: unavailable,
        });
        if (result.error) return yield* Effect.fail(databaseError(result.error));
        const rows = yield* Schema.decodeUnknownEffect(StoredRows)(result.data).pipe(
          Effect.mapError(
            () =>
              new StoreError({ code: "INTERNAL_ERROR", message: "Unexpected envelope response." }),
          ),
        );
        const visible = rows.slice(0, 50);
        const last = visible.at(-1);
        const has_more = rows.length > 50;
        return {
          envelopes: visible.map(({ id, name, description, created_at }) => ({
            id,
            name,
            description,
            created_at: new Date(created_at).toISOString(),
          })),
          sort,
          has_more,
          next_cursor:
            has_more && last
              ? Buffer.from(
                  JSON.stringify({
                    v: 1,
                    sort,
                    key: sort.startsWith("name") ? last.name_key : last.created_at,
                    id: last.id,
                  }),
                ).toString("base64url")
              : null,
        };
      }),
  };
});
export const envelopeRepositoryLayer = Layer.effect(EnvelopeRepository)(makeEnvelopeStore);
/** Standalone caller adapter; the server provides the repository layer once per request. */
export function envelopeStore(url: string, key: string, token: string) {
  const layer = envelopeRepositoryLayer.pipe(
    Layer.provide(supabaseClientLayer({ url, publishableKey: key, token })),
  );
  return {
    create: (input: unknown) =>
      EnvelopeRepository.use((store) => store.create(input)).pipe(Effect.provide(layer)),
    list: (input: unknown) =>
      EnvelopeRepository.use((store) => store.list(input)).pipe(Effect.provide(layer)),
  };
}
