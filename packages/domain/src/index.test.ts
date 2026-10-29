import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { normalizeCreate, parseList } from "./index";
const create = (input: unknown) => Effect.runPromise(normalizeCreate(input));
describe("envelope input", () => {
  it("trims display values and normalizes blank descriptions", async () => {
    expect(await create({ name: " Groceries ", description: " \n " })).toEqual({
      name: "Groceries",
      description: null,
    });
  });
  it("preserves an explicit budget selection", async () => {
    const budget_id = "00000000-0000-4000-8000-000000000001";
    expect(await create({ name: "Food", budget_id })).toEqual({
      name: "Food",
      description: null,
      budget_id,
    });
  });
  it("counts Unicode code points", async () => {
    expect((await create({ name: "😀".repeat(100) })).name).toHaveLength(200);
    await expect(create({ name: "😀".repeat(101) })).rejects.toThrow();
  });
  it.each([
    { name: "Food", budget_id: "invalid" },
    { name: "" },
    { name: " \t" },
    { name: 1 },
    { name: "Food", user_id: "other" },
    { name: "Food", description: null },
    { name: "Food", description: "x".repeat(501) },
  ])("rejects invalid input %j", async (input) => {
    await expect(create(input)).rejects.toThrow();
  });
  it("defaults list inputs and rejects unknown sorts", async () => {
    expect(await Effect.runPromise(parseList({}))).toEqual({ sort: "name_asc", cursor: null });
    await expect(Effect.runPromise(parseList({ sort: "balance" }))).rejects.toThrow();
  });
});
