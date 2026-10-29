import { ValidationError, StoreError } from "./errors.ts";
export * from "./errors.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const Generation = Schema.optionalKey(Schema.Number);
export const CreateInput = Schema.Struct({
  generation: Generation,
  budget_id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
});
export const Sort = Schema.Literals(["name_asc", "name_desc", "created_asc", "created_desc"]);
export const ListInput = Schema.Struct({
  generation: Generation,
  sort: Schema.optionalKey(Sort),
  cursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export const Envelope = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  created_at: Schema.String,
});
export type Envelope = typeof Envelope.Type;
export type Sort = typeof Sort.Type;
export const normalizeCreate = (input: unknown) =>
  Effect.gen(function* () {
    const value = yield* Schema.decodeUnknownEffect(CreateInput, { onExcessProperty: "error" })(
      input,
    ).pipe(Effect.mapError(() => new ValidationError("Invalid envelope input.")));
    const name = value.name.trim();
    const description = value.description?.trim() || null;
    if ([...name].length < 1 || [...name].length > 100)
      return yield* Effect.fail(new ValidationError("Name must contain 1–100 characters.", "name"));
    if (description !== null && [...description].length > 500)
      return yield* Effect.fail(
        new ValidationError("Description must contain at most 500 characters.", "description"),
      );
    return { name, description, ...(value.budget_id ? { budget_id: value.budget_id } : {}) };
  });
export const parseList = (input: unknown) =>
  Schema.decodeUnknownEffect(ListInput, { onExcessProperty: "error" })(input).pipe(
    Effect.map((value) => ({
      sort: value.sort ?? ("name_asc" as Sort),
      cursor: value.cursor ?? null,
    })),
    Effect.mapError(() => new ValidationError("Invalid list input.")),
  );
export type EnvelopePage = {
  envelopes: Envelope[];
  sort: Sort;
  has_more: boolean;
  next_cursor: string | null;
};
export class EnvelopeRepository extends Context.Service<
  EnvelopeRepository,
  {
    create: (input: unknown) => Effect.Effect<Envelope, ValidationError | StoreError>;
    list: (input: unknown) => Effect.Effect<EnvelopePage, ValidationError | StoreError>;
  }
>()("@budgie/EnvelopeRepository") {}

export const ErrorResult = Schema.Struct({
  generation: Schema.Number,
  sort: Schema.optionalKey(Sort),
  cursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ok: Schema.Literal(false),
  error: Schema.Struct({
    code: Schema.Literals([
      "VALIDATION_ERROR",
      "DUPLICATE_ENVELOPE",
      "INVALID_CURSOR",
      "RATE_LIMITED",
      "TEMPORARILY_UNAVAILABLE",
      "INTERNAL_ERROR",
    ]),
    message: Schema.String,
    field: Schema.optionalKey(Schema.String),
  }),
});
export const CreateResult = Schema.Union([
  Schema.Struct({ generation: Schema.Number, ok: Schema.Literal(true), envelope: Envelope }),
  ErrorResult,
]);
export const ListResult = Schema.Union([
  Schema.Struct({
    generation: Schema.Number,
    cursor: Schema.NullOr(Schema.String),
    ok: Schema.Literal(true),
    envelopes: Schema.Array(Envelope),
    sort: Sort,
    next_cursor: Schema.NullOr(Schema.String),
    has_more: Schema.Boolean,
  }),
  ErrorResult,
]);
