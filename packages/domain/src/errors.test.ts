import { expect, it } from "vitest";
import { publicError, StoreError, ValidationError } from "./errors";

it("never exposes store diagnostics for any error classification", () => {
  for (const code of [
    "INTERNAL_ERROR",
    "TEMPORARILY_UNAVAILABLE",
    "DUPLICATE_ENVELOPE",
    "INVALID_CURSOR",
    "RATE_LIMITED",
  ] as const) {
    const result = publicError(
      new StoreError({ code, message: "private database diagnostics", field: "private_column" }),
    );
    expect(result.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("private");
  }
  expect(publicError(new ValidationError("Invalid name.", "name"))).toEqual({
    code: "VALIDATION_ERROR",
    message: "Invalid name.",
    field: "name",
  });
});
