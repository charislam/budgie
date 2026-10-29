import type { Envelope } from "@budgie/domain";

export function appendPage(
  pages: ReadonlyArray<ReadonlyArray<Envelope>>,
  depth: number,
  rows: ReadonlyArray<Envelope>,
): ReadonlyArray<ReadonlyArray<Envelope>> {
  return [...pages.slice(0, depth - 1), rows];
}
