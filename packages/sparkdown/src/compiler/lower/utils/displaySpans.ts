import { type SyntaxNode } from "@lezer/common";
import {
  SPAN_CLOSE,
  SPAN_END,
  spanOpen,
  tagCode,
} from "../../../runtime/displayStyle";
import { findChildByName } from "../../utils/findChildByName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";

type SourceReader = Pick<LowerContext, "read">;

const SPAN_NAMES = [
  "Bold",
  "Italic",
  "Underline",
  "Centered",
  "EmphasisTilde",
  "EmphasisColon",
  "Raw",
] as const;

const SPAN_NODES: ReadonlySet<string> = nodeNameSet(
  SPAN_NAMES.flatMap((span) => [
    span,
    `ChoiceStart${span}`,
    `ChoiceOnly${span}`,
    `ChoiceInner${span}`,
  ]) as SparkdownNodeName[],
);

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

const spanMark = (span: SyntaxNode, name: string): SyntaxNode | null => {
  for (let capture = span.firstChild; capture; capture = capture.nextSibling) {
    const mark = capture.name === name ? capture : findChildByName(capture, name);
    if (mark) return mark;
  }
  return null;
};

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
    if (node.name === "TextCommand" && node.from >= from && node.to <= to) {
      hide(node.from, node.to);
      codes.push({
        at: node.from,
        code: tagCode(ctx.read(node.from + 1, node.to - 1)),
        closes: false,
        depth,
      });
      return;
    }
    let childDepth = depth;
    if (SPAN_NODES.has(node.name)) {
      const begin = spanMark(node, "SpanOpenMark");
      const end = spanMark(node, "SpanCloseMark");
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

export interface StyledCursor {
  code: number;
  mark: number;
}

export function writeStyledRange(
  { codes, marks }: DisplaySpans,
  from: number,
  to: number,
  ctx: SourceReader,
  cursor: StyledCursor = { code: 0, mark: 0 },
): string {
  let out = "";
  let pos = from;
  while (pos < to) {
    while (cursor.code < codes.length && codes[cursor.code]!.at <= pos) {
      out += codes[cursor.code++]!.code;
    }
    while (cursor.mark < marks.length && marks[cursor.mark]!.to <= pos) {
      cursor.mark++;
    }
    const hidden = marks[cursor.mark];
    if (hidden && hidden.from <= pos) {
      pos = hidden.to;
      continue;
    }
    const next = Math.min(
      to,
      codes[cursor.code]?.at ?? to,
      hidden?.from ?? to,
    );
    out += ctx.read(pos, next);
    pos = next;
  }
  while (cursor.code < codes.length && codes[cursor.code]!.at <= to) {
    out += codes[cursor.code++]!.code;
  }
  return out;
}

export function readStyledSource(
  root: SyntaxNode,
  from: number,
  to: number,
  ctx: SourceReader,
): string {
  return writeStyledRange(collectDisplaySpans(root, from, to, ctx), from, to, ctx);
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
