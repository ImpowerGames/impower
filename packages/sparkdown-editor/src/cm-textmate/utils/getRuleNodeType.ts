import {
  continuedIndent,
  delimitedIndent,
  flatIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  TreeIndentContext,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { NodeProp, NodeType, SyntaxNode } from "@lezer/common";
import { styleTags, Tag, tags } from "@lezer/highlight";
/**
 * Node emitted when the parser reached a newline and had to manually advance.
 */
export const NODE_NEWLINE = NodeType.define({
  name: "newline",
  id: NodeID.NEWLINE,
});

/**
 * Node emitted when a character doesn't match anything in the grammar,
 * and the parser had to manually advance past it.
 */
export const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.ERROR_UNRECOGNIZED,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.ERROR_INCOMPLETE,
  error: true,
});

/** A `NodeProp` that points to the original grammar `Node` for the `NodeType`. */
export const nodeTypeProp = new NodeProp();

import { NodeID, RuleDefinition } from "../../../../grammar-parser/src";

/**
 * 1. Tag modifier text
 * 2. Tag function name
 * 3. Tag function argument
 * 4. Tag name, no function
 */
const PARSE_TAG_REGEX =
  /^(?:\((\S*?)\))?(?:\s+|^)(?:(?:(\S+?)\((\S+)\))|(\S+))$/;

/**
 * Parses a tag string, and converts it into an object that can be fed into
 * CodeMirror's `styleTags` function.
 *
 * Examples:
 *
 * ```text
 * tag
 * func(tag)
 * (!) tag
 * (!) func(tag)
 * (...) tag
 * (...) func(tag)
 * (parent/) tag
 * (parent/) func(tag)
 * (grandparent/parent) tag
 * (grandparent/parent) func(tag)
 * ```
 */
function parseTag(node: string, str: string) {
  const [, modifier, func, arg, last] = PARSE_TAG_REGEX.exec(str)!;

  if (last && !(last in tags)) {
    throw new Error(`Unknown tag: ${last}`);
  }
  if (func && !(func in tags)) {
    throw new Error(`Unknown tag function: ${func}`);
  }
  if (arg && !(arg in tags)) {
    throw new Error(`Unknown tag argument: ${arg}`);
  }

  let name = arg ? arg : last;
  let prefix = "";
  let suffix = "";

  // @ts-ignore TS doesn't realize I've checked for this
  let tag: Tag = tags[name];

  if (func) {
    // @ts-ignore ditto
    tag = tags[func](tag);
  }

  if (modifier) {
    if (modifier.endsWith("...")) {
      suffix = "/...";
    }
    if (modifier.endsWith("!")) {
      suffix = "!";
    }
    if (modifier.endsWith("/")) {
      prefix = modifier;
    }
    // check for parents
    else {
      const split = modifier.split("/");
      const last = split[split.length - 1];
      if (last === "..." || last === "!") {
        split.pop();
      }
      if (split.length) {
        prefix = `${split.join("/")}/`;
      }
    }
  }

  // e.g. foo/... or foo/bar/... etc.
  const style = `${prefix}${node}${suffix}`;

  return { [style]: tag };
}

/**
 * `offset(n n)`, `offset(-2 -5)`, `offset(+1 2)`, `offset(0 0)`, etc.
 *
 * 1. Left offset
 * 2. Right offset
 */
const PARSE_OFFSET_FOLD_REGEX = /^offset\(([+-]?\d+),\s+([+-]?\d+)\)$/;

/** Parses a `fold` string, returning a CodeMirror `foldNodeProp` compatible function. */
function parseFold(
  fold: true | string
): (
  node: SyntaxNode,
  state: EditorState
) => { from: number; to: number } | null {
  // prettier-ignore
  switch (fold) {
  // folds entire node
  case true: return node => ({ from: node.from, to: node.to })
  // folds between two delimiters, which are the first and last child
  case "inside": return foldInside
  // folds everything past the first-ish line
  case "past_first_line": return (node, state) => ({
    from: Math.min(node.from + 20, state.doc.lineAt(node.from).to),
    to: node.to - 1
  })
  // like the "true" case, except with an offset
  // (or the fold string is invalid)
  default: {
    if (fold.startsWith("offset")) {
      const match = PARSE_OFFSET_FOLD_REGEX.exec(fold)
      if (!match) { 
        throw new Error("Invalid fold offset");
      }
      const left = parseInt(match[1]!, 10)
      const right = parseInt(match[2]!, 10)
      return node => ({ from: node.from + left, to: node.to + right })
    } else {
      throw new Error(`Unknown fold option: ${fold}`)
    }
  }
}
}

/** 1. Closing */
const PARSE_DELIMITED_INDENT_REGEX = /^delimited\((.+?)\)$/;

/** 1. Except Regex */
const PARSE_CONTINUED_INDENT_REGEX = /^continued(?:\((.+?)\))?$/;

/** 1. Units */
const PARSE_ADD_INDENT_REGEX = /^add\(([+-]?\d+)\)$/;

/** 1. Units */
const PARSE_SET_INDENT_REGEX = /^set\(([+-]?\d+)\)$/;

/** Parses an indent string, returning a `indentNodeProp` compatible function. */
function parseIndent(indent: string): (context: TreeIndentContext) => number {
  if (indent === "flat") {
    return flatIndent;
  }
  if (indent === "continued") {
    return continuedIndent();
  }

  if (indent.startsWith("delimited")) {
    const match = PARSE_DELIMITED_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid delimited indent");
    }
    const [, closing] = match;
    return delimitedIndent({ closing: closing! });
  }

  if (indent.startsWith("continued")) {
    const match = PARSE_CONTINUED_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid continued indent");
    }
    const except = new RegExp(match[1]!);
    if (!except) {
      throw new Error("Invalid continued indent except regex");
    }
    return continuedIndent({ except });
  }

  if (indent.startsWith("add")) {
    const match = PARSE_ADD_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid add indent");
    }
    const units = parseInt(match[1]!, 10);
    return (cx) => cx.baseIndent + cx.unit * units;
  }

  if (indent.startsWith("set")) {
    const match = PARSE_SET_INDENT_REGEX.exec(indent);
    if (!match) {
      throw new Error("Invalid set indent");
    }
    const units = parseInt(match[1]!, 10);
    return () => units;
  }

  throw new Error(`Unknown indent option: ${indent}`);
}

const getRuleNodeType = (
  topNode: NodeType,
  typeIndex: number,
  typeId: string,
  def: RuleDefinition
): NodeType => {
  if (typeIndex === NodeID.NONE) {
    return NodeType.none;
  }
  if (typeIndex === NodeID.TOP) {
    return topNode;
  }
  if (typeIndex === NodeID.NEWLINE) {
    return NODE_NEWLINE;
  }
  if (typeIndex === NodeID.ERROR_UNRECOGNIZED) {
    return NODE_ERROR_UNRECOGNIZED;
  }
  if (typeIndex === NodeID.ERROR_INCOMPLETE) {
    return NODE_ERROR_INCOMPLETE;
  }
  const { tag, fold, indent, openedBy, closedBy, group } = def;
  const props = [];

  props.push(nodeTypeProp.add({ [typeId]: this }));

  if (tag) {
    props.push(styleTags(parseTag(typeId + "/...", tag)));
  }
  if (fold) {
    props.push(foldNodeProp.add({ [typeId]: parseFold(fold) }));
  }
  if (indent) {
    props.push(indentNodeProp.add({ [typeId]: parseIndent(indent) }));
  }
  if (openedBy) {
    props.push(NodeProp.openedBy.add({ [typeId]: [openedBy].flat() }));
  }
  if (closedBy) {
    props.push(NodeProp.closedBy.add({ [typeId]: [closedBy].flat() }));
  }
  if (group) {
    props.push(NodeProp.group.add({ [typeId]: [group].flat() }));
  }
  // In CodeMirror, `id` is the unique number identifier and `name` is the unique string identifier
  // This is different than the parser node that calls `typeIndex` the unique number identifier and `typeId` the unique string identifier
  return NodeType.define({ id: typeIndex, name: typeId, props });
};

export default getRuleNodeType;
