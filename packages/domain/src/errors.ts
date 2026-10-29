import * as Data from "effect/Data";

export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string;
  field?: string;
}> {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string, field?: string) {
    super({ message, ...(field ? { field } : {}) });
  }
}
export class StoreError extends Data.TaggedError("StoreError")<{
  code:
    | "DUPLICATE_ENVELOPE"
    | "INVALID_CURSOR"
    | "RATE_LIMITED"
    | "TEMPORARILY_UNAVAILABLE"
    | "INTERNAL_ERROR";
  message: string;
  field?: string;
}> {}

export class RequestError extends Data.TaggedError("RequestError")<{ cause?: unknown }> {}
export class AuthenticationUnavailable extends Data.TaggedError("AuthenticationUnavailable")<{
  cause?: unknown;
}> {}
export class StaticFileError extends Data.TaggedError("StaticFileError")<{ cause?: unknown }> {}

// Only validation messages are authored for direct display. Store messages stay private.
export const publicError = (error: ValidationError | StoreError) => {
  switch (error._tag) {
    case "ValidationError":
      return {
        code: error.code,
        message: error.message,
        ...(error.field ? { field: error.field } : {}),
      };
    case "StoreError":
      switch (error.code) {
        case "DUPLICATE_ENVELOPE":
          return {
            code: error.code,
            message: "An envelope with this name already exists.",
            field: "name",
          };
        case "INVALID_CURSOR":
          return {
            code: error.code,
            message: "This page token is invalid. Refresh to start again.",
          };
        case "RATE_LIMITED":
          return { code: error.code, message: "Too many requests. Try again shortly." };
        case "TEMPORARILY_UNAVAILABLE":
          return {
            code: error.code,
            message: "Unable to reach your envelopes. Refresh before trying again.",
          };
        case "INTERNAL_ERROR":
          return { code: error.code, message: "Unable to complete this request." };
      }
  }
};
