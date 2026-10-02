import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { braceBodyParts } from "../../utils/braceBlocks";
import { findChildByName } from "../../utils/findChildByName";
import { structArrayItemInlineEntry } from "../../utils/structArrayItemInlineEntry";
import type { LowerContext } from "../context";
import {
  sparkleBlockContent,
  sparkleBlockEntries,
  sparkleControlBranches,
  sparkleElementParts,
  sparklePartNodes,
} from "./sparkleBlockEntries";
import {
  joinSparkleContinuations,
  type SparkleJoins,
} from "./sparkleContinuations";

// The entries of a struct body (`style`, `animation`, `theme`, `morph`, and
// the static struct of `layout`, `screen` and `component`), as a tree both
// struct readers evaluate. A body is written in one of two forms, often both:
//
//   indented (`LuauStructBodyLine`)      braced (`LuauStructBlockLine`)
//
//   timing:                              timing {
//     duration = 0.4                       duration = 0.4
//   clips:                               }
//     -                                  clips {
//       between:                           { between { eyelash-left } }
//         - eyelash-left                 }
//
// An indented line is classified by the grammar into one shape per line, and
// the lines nest by their indentation column. A braced entry nests inside the
// block that holds it, whatever its indentation. The two forms produce the
// same entries, so a reader turns either into the same struct: a `key:`
// header and a `key { … }` block are both a header, a `-` item and a bare
// `{ … }` or value entry are both a list item.
//
// A line of braced entries sits in the indentation of the body around it at
// the column its first entry starts in, so an indented `keyframes:` header
// can hold `from { … }` lines. Its entries never take the deeper-indented
// lines after them as their own: a braced entry's contents are its braces.

export type StructEntryKind = "item" | "header" | "property" | "other";

/** A source range, as absolute document offsets. */
export interface StructEntrySpan {
  from: number;
  to: number;
}

export interface StructEntry {
  kind: StructEntryKind;
  /**
   * The node the entry's key and value tokens are read from: the indented
   * line's shape node, or the braced entry itself.
   */
  shape: SyntaxNode;
  /**
   * Where the entry was written: the indented line's content, or for a braced
   * entry its first line (a block's header and `{`, a list entry's `{`).
   */
  line: StructEntrySpan;
  /** A braced header's key (`LuauStructBlockKey`). */
  key?: SyntaxNode;
  /**
   * A header's or list item's entries. `null` for an indented header or item
   * with nothing indented beneath it, and for every other kind.
   */
  children: StructEntry[] | null;
  /** True when the entry was written in the braced form. */
  braced: boolean;
  /**
   * True for an element in a layout or component brace block
   * (`LuauSparkleElement`, the entry's shape), whose key is read from its
   * name, classes and content rather than from a line's text.
   */
  element?: boolean;
  /**
   * For an element in a layout or component body, the nodes that hold the
   * parts of the continuation lines it takes (`sparklePartNodes`), in source
   * order, whose text its key reads after its own (#1225).
   */
  continuations?: SyntaxNode[];
}

/**
 * How a reader classifies an indented line's content. `null` skips the line
 * (a comment); the reader decides which lines count, so each keeps the lines
 * it has always read.
 */
export type ClassifyIndentedLine = (
  content: SyntaxNode,
) => { kind: StructEntryKind; shape: SyntaxNode } | null;

interface PositionedEntry {
  indent: number;
  entry: StructEntry;
  /** A braced entry, whose contents are already its children. */
  closed: boolean;
  /**
   * For an entry of a layout or component block line, the line it came from:
   * such an entry takes as children only the entries of its own line.
   */
  group?: number;
}

// The indentation one level of a layout or component block adds. A block
// line's entries are placed as the indented form of the same body would
// place them, one level deeper per block and per control block, but in steps
// smaller than a column, so the lines around the block line keep their place
// beside it (see `pushSparkleBlockLine`).
const SPARKLE_BLOCK_LEVEL = 1 / 4096;

const BRACED_ENTRY_NAMES: ReadonlySet<string> = new Set([
  "LuauStructBlock",
  "LuauStructListBlock",
  "LuauStructBlockProperty",
  "LuauStructListValue",
]);

/** The entries of a struct body's content node. */
export function readStructBodyEntries(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
  classify: ClassifyIndentedLine,
): StructEntry[] {
  if (!contentNode) return [];
  const positioned: PositionedEntry[] = [];
  // In a layout or component body, the continuation lines and own-line
  // blocks each element takes (#1225).
  const joins = joinSparkleContinuations(contentNode);
  const walk = (node: SyntaxNode) => {
    let child = node.firstChild;
    while (child) {
      if (child.name === "LuauStructBodyContent") {
        pushIndentedLine(positioned, child, ctx, classify, joins);
      } else if (child.name === "LuauStructBlockLine") {
        pushBlockLine(positioned, child, ctx);
      } else if (child.name === "LuauSparkleBlockLine") {
        pushSparkleBlockLine(positioned, child, ctx, joins);
      } else {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(contentNode);
  return nest(positioned, 0, positioned[0]?.indent ?? 0).entries;
}

function pushIndentedLine(
  positioned: PositionedEntry[],
  content: SyntaxNode,
  ctx: LowerContext,
  classify: ClassifyIndentedLine,
  joins: SparkleJoins,
): void {
  const classified = classify(content);
  const indent = ctx.characterNumber(content.from);
  // An element's block on a later line holds its children, as a `:` header's
  // indented lines do; its entries go one level below the element. Like a
  // brace element, it then takes children only from its block (`group`), so
  // the indented lines after the block are not its children.
  const later = joins.blocks.get(content.from);
  if (classified) {
    const continuations = continuationParts(content.from, joins);
    positioned.push({
      indent,
      entry: {
        ...classified,
        ...(later ? { kind: "header" as const } : {}),
        ...(continuations ? { continuations } : {}),
        line: content,
        children: null,
        braced: false,
      },
      closed: false,
      ...(later ? { group: later.from } : {}),
    });
  }
  if (later) {
    const blockContent = sparkleBlockContent(later);
    if (blockContent) {
      placeSparkleEntries(
        positioned,
        sparkleBlockEntries(blockContent),
        indent,
        1,
        later.from,
        joins,
      );
    }
  }
  if (!classified) return;
  // A collapsed list item (`- eyes:` / `- offset = 0.4`) carries its first
  // entry on the dash line. Follow the item with that entry as a line of its
  // own, at the column the entry starts in: the shape the expanded form
  // already has, so the two spellings cannot drift apart.
  if (classified.kind !== "item") return;
  const inline = structArrayItemInlineEntry(classified.shape);
  if (!inline) return;
  const entry = classify(inline);
  if (!entry) return;
  positioned.push({
    indent: ctx.characterNumber(inline.from),
    entry: { ...entry, line: inline, children: null, braced: false },
    closed: false,
  });
}

function pushBlockLine(
  positioned: PositionedEntry[],
  line: SyntaxNode,
  ctx: LowerContext,
): void {
  const entries = bracedEntries(line);
  const first = entries[0];
  if (!first) return;
  const indent = ctx.characterNumber(first.shape.from);
  for (const entry of entries) {
    positioned.push({ indent, entry, closed: true });
  }
}

/**
 * A line of a layout or component body that holds brace blocks. Its entries
 * are placed where the indented form of the same body places its lines: an
 * element with a block is a header, the block's entries one level deeper, and
 * the lines of an `if` or `for` branch one level deeper than the control
 * block, which itself is no entry, and those of a `match` arm two levels
 * deeper, below its `case` line. So a brace body lowers to the struct its
 * indented form lowers to, including where the indented form flattens a
 * control block's lines into the header before it. A component call is no
 * entry either, as its indented line is not; its block's entries stay in
 * place. The line sits in the indentation of the body around it at the
 * column its first entry starts in.
 */
function pushSparkleBlockLine(
  positioned: PositionedEntry[],
  line: SyntaxNode,
  ctx: LowerContext,
  joins: SparkleJoins,
): void {
  const entries = sparkleBlockEntries(line);
  // The line sits at the column of its first entry of its own: continuation
  // lines, and a block the element before it takes, are no entries.
  const first = entries.find((entry) => !isJoinedEntry(entry, joins));
  if (!first) return;
  const base = ctx.characterNumber(first.from);
  placeSparkleEntries(positioned, entries, base, 0, line.from, joins);
}

/** A continuation line, or a block on a line of its own that the element
 *  before it takes. Neither is an entry of its own. */
function isJoinedEntry(entry: SyntaxNode, joins: SparkleJoins): boolean {
  return (
    entry.name === "LuauSparkleElementContinuation" ||
    joins.joined.has(entry.from)
  );
}

/** The part nodes of the continuation lines the element keyed `key` takes,
 *  or `undefined` when it takes none. */
function continuationParts(
  key: number,
  joins: SparkleJoins,
): SyntaxNode[] | undefined {
  const lines = joins.continuations.get(key);
  return lines ? lines.flatMap((line) => sparklePartNodes(line)) : undefined;
}

/**
 * Place the entries of a layout or component block line, or of a block, at
 * `depth` levels below `base`, as `pushSparkleBlockLine` describes. Every
 * entry placed takes children only from its own `group`.
 */
function placeSparkleEntries(
  positioned: PositionedEntry[],
  nodes: SyntaxNode[],
  base: number,
  depth: number,
  group: number,
  joins: SparkleJoins,
): void {
  const place = (nodes: SyntaxNode[], depth: number) => {
    const indent = base + depth * SPARKLE_BLOCK_LEVEL;
    for (const node of nodes) {
      if (isJoinedEntry(node, joins)) continue;
      if (node.name === "LuauSparkleElement") {
        const parts = sparkleElementParts(node);
        // A block on a later line is the element's block when it has none.
        const block = parts.block ?? joins.blocks.get(node.from) ?? null;
        if (!parts.args) {
          const continuations = continuationParts(node.from, joins);
          positioned.push({
            indent,
            closed: false,
            group,
            entry: {
              kind: block ? "header" : "other",
              shape: node,
              line: node,
              children: null,
              braced: true,
              element: true,
              ...(continuations ? { continuations } : {}),
            },
          });
        }
        const content = block ? sparkleBlockContent(block) : null;
        if (content) place(sparkleBlockEntries(content), depth + 1);
      } else if (node.name === "LuauStructBlockProperty") {
        positioned.push({
          indent,
          closed: false,
          group,
          entry: {
            kind: "property",
            shape: node,
            line: node,
            children: null,
            braced: true,
          },
        });
      } else if (node.name !== "LuauSparkleElementBlock") {
        for (const branch of sparkleControlBranches(node)) {
          place(sparkleBlockEntries(branch.content), depth + branch.depth);
        }
      }
    }
  };
  place(nodes, depth);
}

/**
 * Nest positioned entries by indentation: an indented header or item takes
 * the deeper-indented entries after it as its children, and an entry indented
 * deeper than its level with no header above it is skipped.
 */
function nest(
  positioned: PositionedEntry[],
  start: number,
  indent: number,
): { entries: StructEntry[]; next: number } {
  const entries: StructEntry[] = [];
  let i = start;
  while (i < positioned.length && positioned[i]!.indent >= indent) {
    const current = positioned[i]!;
    if (current.indent > indent) {
      i += 1;
      continue;
    }
    const opens =
      !current.closed &&
      (current.entry.kind === "item" || current.entry.kind === "header");
    const next = positioned[i + 1];
    if (
      opens &&
      next &&
      next.indent > indent &&
      (current.group === undefined || next.group === current.group)
    ) {
      const sub = nest(positioned, i + 1, next.indent);
      entries.push({ ...current.entry, children: sub.entries });
      i = sub.next;
      continue;
    }
    entries.push(current.entry);
    i += 1;
  }
  return { entries, next: i };
}

/** The braced entries directly inside `node`, in source order. */
function bracedEntries(node: SyntaxNode): StructEntry[] {
  const entries: StructEntry[] = [];
  const walk = (parent: SyntaxNode) => {
    let child = parent.firstChild;
    while (child) {
      if (BRACED_ENTRY_NAMES.has(child.name)) {
        entries.push(bracedEntry(child));
      } else {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(node);
  return entries;
}

function bracedEntry(node: SyntaxNode): StructEntry {
  if (node.name === "LuauStructBlock") {
    const body = blockBody(node);
    const open = body ? blockOpenBrace(body) : null;
    return {
      kind: "header",
      shape: node,
      line: { from: node.from, to: open?.to ?? node.to },
      key: getDescendent("LuauStructBlockKey", node),
      children: body ? bracedEntries(bodyContent(body)) : [],
      braced: true,
    };
  }
  if (node.name === "LuauStructListBlock") {
    const open = blockOpenBrace(node);
    return {
      kind: "item",
      shape: node,
      line: open ?? node,
      children: bracedEntries(bodyContent(node)),
      braced: true,
    };
  }
  return {
    kind: node.name === "LuauStructBlockProperty" ? "property" : "item",
    shape: node,
    line: node,
    children: null,
    braced: true,
  };
}

/** A `LuauStructBlock`'s `{ … }`. */
function blockBody(block: SyntaxNode): SyntaxNode | null {
  const content = findChildByName(block, "LuauStructBlock_content");
  return content ? findChildByName(content, "LuauStructBlockBody") : null;
}

// The parts of a block's braces (a `LuauStructBlockBody`, a
// `LuauStructListBlock`, or a layout or component `LuauSparkleElementBlock`),
// shared with the editor's completion and folding.
const braceParts = braceBodyParts;

/** The entries part of a block's braces: everything between them. */
function bodyContent(body: SyntaxNode): SyntaxNode {
  return braceParts(body).content ?? body;
}

/** The `{` that opens a block's braces. */
export function blockOpenBrace(body: SyntaxNode): SyntaxNode | null {
  const { begin } = braceParts(body);
  return begin ? (getDescendent("LuauStructBlockOpen", begin) ?? null) : null;
}

/** Whether a block's braces end at their `}`, rather than at a bail-out. */
export function blockIsClosed(body: SyntaxNode): boolean {
  const { end } = braceParts(body);
  // A bail-out's end is empty; only a `}` gives the end any width.
  return (
    !!end && end.to > end.from && !!getDescendent("LuauStructBlockClose", end)
  );
}
