import { expect, it } from "vitest";
import type { Envelope } from "@budgie/domain";
import { appendPage } from "./pagination";

it("appends the next page and replaces revisited pages without duplicate rows", () => {
  const row = (id: string): Envelope => ({
    id,
    name: id,
    description: null,
    created_at: "2026-10-29",
  });
  const first = [row("first")];
  const second = [row("second")];
  const pages = appendPage([first], 2, second);
  expect(pages.flat()).toEqual([...first, ...second]);
  expect(appendPage(pages, 2, second)).toEqual(pages);
  expect(appendPage(pages, 1, first)).toEqual([first]);
  expect(appendPage(pages, 1, [])).toEqual([[]]);
});
