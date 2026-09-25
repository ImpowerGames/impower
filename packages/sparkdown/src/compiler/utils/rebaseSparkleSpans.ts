// Shifts every binding handle span in a chunk's Sparkle trees by `lines` and
// `offset`. The trees are walked in place: a handle is any object holding an
// `exprId` string and a `span`.
export function rebaseSparkleSpans(trees: unknown, lines: number, offset: number): void {
  if (lines === 0 && offset === 0) return;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const span = record["span"] as { line: number; from: number; to: number } | undefined;
    if (typeof record["exprId"] === "string" && span) {
      span.line += lines;
      span.from += offset;
      span.to += offset;
    }
    for (const key in record) {
      if (key !== "span") visit(record[key]);
    }
  };
  visit(trees);
}
