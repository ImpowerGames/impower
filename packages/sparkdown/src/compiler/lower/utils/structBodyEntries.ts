import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { braceBodyParts } from "../../utils/braceBlocks";
import { findChildByName } from "../../utils/findChildByName";
import type { LowerContext } from "../context";
import { sparkleBlockContent, sparkleBlockEntries, sparkleControlBranches, sparkleElementParts, sparklePartNodes } from "./sparkleBlockEntries";
import { joinSparkleContinuations, type SparkleJoins } from "./sparkleContinuations";

export type StructEntryKind = "item" | "header" | "property" | "other";

export interface StructEntrySpan { from: number; to: number; }

/** An entry and its explicitly nested block, independent of source columns. */
export interface StructEntry {
  kind: StructEntryKind;
  shape: SyntaxNode;
  line: StructEntrySpan;
  key?: SyntaxNode;
  children: StructEntry[] | null;
  element?: boolean;
  continuations?: SyntaxNode[];
}

const BRACED_ENTRY_NAMES: ReadonlySet<string> = new Set([
  "LuauStructBlock", "LuauStructListBlock", "LuauStructBlockProperty", "LuauStructListValue",
]);

/** Read top-level entry lines; each block owns its children. */
export function readStructBodyEntries(contentNode: SyntaxNode | null, _ctx: LowerContext): StructEntry[] {
  if (!contentNode) return [];
  const joins = joinSparkleContinuations(contentNode);
  const entries: StructEntry[] = [];
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauStructBlockLine") entries.push(...bracedEntries(child));
      else if (child.name === "LuauSparkleBlockLine") entries.push(...elementEntries(sparkleBlockEntries(child), joins));
      else walk(child);
    }
  };
  walk(contentNode);
  return entries;
}

function elementEntries(nodes: SyntaxNode[], joins: SparkleJoins): StructEntry[] {
  const entries: StructEntry[] = [];
  for (const node of nodes) {
    if (node.name === "LuauSparkleElementContinuation" || joins.joined.has(node.from)) continue;
    if (node.name === "LuauSparkleElement") {
      const parts = sparkleElementParts(node);
      const block = parts.block ?? joins.blocks.get(node.from);
      const content = block ? sparkleBlockContent(block) : null;
      const children = block ? (content ? elementEntries(sparkleBlockEntries(content), joins) : []) : null;
      if (!parts.args) entries.push({
        kind: block ? "header" : "other", shape: node, line: node, element: true,
        children, continuations: joins.continuations.get(node.from)?.flatMap(sparklePartNodes),
      });
      else if (children) entries.push(...children);
    } else if (node.name === "LuauStructBlockProperty") {
      entries.push({ kind: "property", shape: node, line: node, children: null });
    } else {
      for (const branch of sparkleControlBranches(node)) {
        entries.push(...elementEntries(sparkleBlockEntries(branch.content), joins));
      }
    }
  }
  return entries;
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
    };
  }
  if (node.name === "LuauStructListBlock") {
    const open = blockOpenBrace(node);
    return {
      kind: "item",
      shape: node,
      line: open ?? node,
      children: bracedEntries(bodyContent(node)),
    };
  }
  return {
    kind: node.name === "LuauStructBlockProperty" ? "property" : "item",
    shape: node,
    line: node,
    children: null,
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
