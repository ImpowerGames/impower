import { type SyntaxNode } from "@lezer/common";
import {
  SPAN_CLOSE,
  SPAN_END,
  spanOpen,
} from "../../../runtime/displayStyle";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext } from "../context";

type SourceReader = Pick<LowerContext, "read">;

const SPAN_NODES: ReadonlySet<string> = nodeNameSet([
  "Bold",
  "BoldItalic",
  "Italic",
  "Underline",
  "Centered",
  "EmphasisTilde",
  "EmphasisColon",
  "Raw",
]);

export interface SpanCode {
  at: number;
  code: string;
  closes: boolean;
  depth: number;
}

export interface DisplaySpans {
  codes: SpanCode[];
  marks: { from: number; to: number }[];
}

export function collectDisplaySpans(
  root: SyntaxNode,
  from: number,
  to: number,
  ctx: SourceReader,
  isOpaque: (node: SyntaxNode) => boolean = () => false,
): DisplaySpans {
  const codes: SpanCode[] = [];
  const marks: { from: number; to: number }[] = [];
  const hide = (start: number, end: number) => {
    const clipped = { from: Math.max(start, from), to: Math.min(end, to) };
    if (clipped.from < clipped.to) marks.push(clipped);
  };
  const visit = (node: SyntaxNode, depth: number): void => {
    if (node.to <= from || node.from >= to) return;
    if (node !== root && isOpaque(node)) return;
    let childDepth = depth;
    if (SPAN_NODES.has(node.name)) {
      const begin = childNamed(node, `${node.name}_begin`);
      const end = childNamed(node, `${node.name}_end`);
      if (begin && end) {
        hide(node.from, begin.to);
        hide(end.from, node.to);
        const contentFrom = Math.max(begin.to, from);
        const contentTo = Math.min(end.from, to);
        const closing =
          end.to > end.from && end.from <= to ? SPAN_CLOSE : SPAN_END;
        if (contentFrom === contentTo && begin.to >= from && end.from <= to) {
          codes.push({
            at: contentFrom,
            code: spanOpen(ctx.read(begin.from, begin.to)) + closing,
            closes: false,
            depth,
          });
        } else if (contentFrom < contentTo) {
          codes.push({
            at: contentFrom,
            code: spanOpen(ctx.read(begin.from, begin.to)),
            closes: false,
            depth,
          });
          codes.push({
            at: contentTo,
            code: closing,
            closes: true,
            depth,
          });
          childDepth = depth + 1;
        }
      }
    }
    let child = node.firstChild;
    while (child) {
      visit(child, childDepth);
      child = child.nextSibling;
    }
  };
  visit(root, 0);
  codes.sort((a, b) =>
    a.at !== b.at
      ? a.at - b.at
      : a.closes !== b.closes
        ? a.closes
          ? -1
          : 1
        : a.closes
          ? b.depth - a.depth
          : a.depth - b.depth,
  );
  marks.sort((a, b) => a.from - b.from);
  return { codes, marks };
}

export function readStyledSource(
  root: SyntaxNode,
  from: number,
  to: number,
  ctx: SourceReader,
): string {
  const { codes, marks } = collectDisplaySpans(root, from, to, ctx);
  let out = "";
  let code = 0;
  let mark = 0;
  let pos = from;
  while (pos < to) {
    while (code < codes.length && codes[code]!.at <= pos) {
      out += codes[code++]!.code;
    }
    while (mark < marks.length && marks[mark]!.to <= pos) mark++;
    const hidden = marks[mark];
    if (hidden && hidden.from <= pos) {
      pos = hidden.to;
      continue;
    }
    const next = Math.min(
      to,
      codes[code]?.at ?? to,
      hidden?.from ?? to,
    );
    out += ctx.read(pos, next);
    pos = next;
  }
  while (code < codes.length) out += codes[code++]!.code;
  return out;
}

export function trimEndBeforeSpanEnds(raw: string): string {
  let end = raw.length;
  let ends = "";
  while (end > 0) {
    const c = raw[end - 1]!;
    if (c === SPAN_END) {
      ends = c + ends;
    // value-level: the text being trimmed, already read from its nodes
    } else if (!/\s/.test(c)) {
      break;
    }
    end--;
  }
  return raw.slice(0, end) + ends;
}

export function insideChoice(node: SyntaxNode): boolean {
  for (let n: SyntaxNode | null = node.parent; n; n = n.parent) {
    if (n.name === "Choice") return true;
  }
  return false;
}

function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  let child = node.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}
