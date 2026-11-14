import type { SyntaxNode } from "@lezer/common";
import {
  collectDisplaySpans,
  writeStyledRange,
} from "../../../sparkdown/src/compiler/lower/utils/displaySpans";
import { SCAN_CLOSE, SCAN_OPEN } from "../../../sparkdown/src/runtime/displayStyle";

const SHOWN_AS_SOURCE = new Set(["LuauInterpolatedStringExpression", "Divert"]);

const UNPRINTED = new Set(["ImageCommand", "AudioCommand", "TextCommand"]);

const ESCAPE_MARKS = new Set(["Escape_c1", "Escape_c3", "Escape_c5"]);

export const readStyled = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
  skipped: (descendant: SyntaxNode) => boolean = () => false,
): string => {
  const ctx = { read };
  const hidden = (child: SyntaxNode) =>
    skipped(child) || UNPRINTED.has(child.name) || ESCAPE_MARKS.has(child.name);
  const spans = collectDisplaySpans(
    node,
    node.from,
    node.to,
    ctx,
    (child) => hidden(child) || SHOWN_AS_SOURCE.has(child.name),
  );
  const source: { from: number; to: number }[] = [];
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (hidden(child)) {
        if (child.from < child.to) {
          spans.marks.push({ from: child.from, to: child.to });
        }
      } else if (SHOWN_AS_SOURCE.has(child.name)) {
        source.push({ from: child.from, to: child.to });
      } else {
        visit(child);
      }
    }
  };
  visit(node);
  spans.marks.sort((a, b) => a.from - b.from);
  const cursor = { code: 0, mark: 0 };
  let out = "";
  let pos = node.from;
  for (const range of source) {
    out += writeStyledRange(spans, pos, range.from, ctx, cursor);
    out += SCAN_OPEN + writeStyledRange(spans, range.from, range.to, ctx, cursor) + SCAN_CLOSE;
    pos = range.to;
  }
  return out + writeStyledRange(spans, pos, node.to, ctx, cursor);
};
