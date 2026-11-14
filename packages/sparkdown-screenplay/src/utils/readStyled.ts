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
  replaced?: (descendant: SyntaxNode) => string | undefined,
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
  const cuts: { from: number; to: number; text?: string }[] = [];
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (hidden(child)) {
        if (child.from < child.to) {
          spans.marks.push({ from: child.from, to: child.to });
        }
        const text = replaced?.(child);
        if (text !== undefined) {
          cuts.push({ from: child.from, to: child.to, text });
        }
      } else if (SHOWN_AS_SOURCE.has(child.name)) {
        cuts.push({ from: child.from, to: child.to });
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
  for (const cut of cuts) {
    out += writeStyledRange(spans, pos, cut.from, ctx, cursor);
    out +=
      cut.text ?? SCAN_OPEN + writeStyledRange(spans, cut.from, cut.to, ctx, cursor) + SCAN_CLOSE;
    pos = cut.to;
  }
  return out + writeStyledRange(spans, pos, node.to, ctx, cursor);
};
