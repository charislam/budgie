import type { Envelope, EnvelopePage } from "@budgie/domain";

export type ToolValue = { envelope: Envelope } | EnvelopePage;

export function formatToolText(value: ToolValue): string {
  if ("envelope" in value) {
    return `Saved ${value.envelope.name} (ID: ${value.envelope.id}).`;
  }
  const rows = value.envelopes.map(
    (row) =>
      `${row.name} — ${row.id} — ${row.created_at}${row.description ? ` — ${row.description}` : ""}`,
  );
  const continuation = value.has_more
    ? `More available. Continue with cursor: ${value.next_cursor}`
    : "End of results.";
  return `Envelopes, order ${value.sort}:\n${rows.join("\n") || "No envelopes."}\n${continuation}`;
}
