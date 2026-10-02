import { type SyntaxNode, type Tree } from "@lezer/common";
import { findChildByName } from "./findChildByName";
import { nodeNameSet } from "./nodeNameSet";

// The brace blocks of a struct, layout or component body (#1222), read the
// way the editor's help needs them: which blocks hold an offset, and the key
// each one adds to a path. The annotator and the language server's
// completion and folding use these, so a key's path is read from the blocks
// around it, never from indentation.
//
//   keyframes {            LuauStructBlock > … > LuauStructBlockBody
//     from { opacity = 0 }   LuauStructBlock (key `from`)
//     { offset = 0.5 }       LuauStructListBlock (a list entry, key `-`)
//   }
//   column.panel {         LuauSparkleElement > … > LuauSparkleElementBlock
//     text "a"
//   }

/** The braces of a block: everything from its `{` to its `}`. */
export const BRACE_BODY_NAMES = nodeNameSet([
  "LuauStructBlockBody",
  "LuauStructListBlock",
  "LuauSparkleElementBlock",
]);

/** The tokens that name a struct key (`key:`, `key = …`, `key { … }`); the
 *  annotator reads indented keys with the same list. */
export const STRUCT_KEY_TOKEN_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "StylingDeclarationScalarPropertyName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "ComponentName",
  "PropertyName",
  "SelectorPropertyNamePart",
]);

/** A brace body's `{` part, entries and `}` part, each named literally so the
 *  grammar node-name check sees every name. */
export function braceBodyParts(body: SyntaxNode): {
  begin: SyntaxNode | null;
  content: SyntaxNode | null;
  end: SyntaxNode | null;
} {
  switch (body.name) {
    case "LuauSparkleElementBlock":
      return {
        begin: findChildByName(body, "LuauSparkleElementBlock_begin"),
        content: findChildByName(body, "LuauSparkleElementBlock_content"),
        end: findChildByName(body, "LuauSparkleElementBlock_end"),
      };
    case "LuauStructListBlock":
      return {
        begin: findChildByName(body, "LuauStructListBlock_begin"),
        content: findChildByName(body, "LuauStructListBlock_content"),
        end: findChildByName(body, "LuauStructListBlock_end"),
      };
    default:
      return {
        begin: findChildByName(body, "LuauStructBlockBody_begin"),
        content: findChildByName(body, "LuauStructBlockBody_content"),
        end: findChildByName(body, "LuauStructBlockBody_end"),
      };
  }
}

/** Where a brace body's `}` starts; the body's end when it has none (a block
 *  left open ends where its declaration does). */
export function braceBodyCloseFrom(body: SyntaxNode): number {
  const { end } = braceBodyParts(body);
  return end && end.to > end.from ? end.from : body.to;
}

/** Whether `offset` lies between a brace body's `{` and its `}`. */
export function braceBodyHolds(body: SyntaxNode, offset: number): boolean {
  const { begin } = braceBodyParts(body);
  const openTo = begin ? begin.to : body.from + 1;
  return offset >= openTo && offset <= braceBodyCloseFrom(body);
}

/** The node a brace body belongs to: the `LuauStructBlock` or
 *  `LuauSparkleElement` whose header it follows, or the list entry itself. */
export function braceBodyOwner(body: SyntaxNode): SyntaxNode {
  if (body.name === "LuauStructListBlock") return body;
  const content = body.parent;
  const owner = content?.parent;
  return owner &&
    (owner.name === "LuauStructBlock" || owner.name === "LuauSparkleElement")
    ? owner
    : body;
}

/** A struct block's header key node (`LuauStructBlockKey`). */
export function structBlockKeyNode(block: SyntaxNode): SyntaxNode | null {
  const begin = findChildByName(block, "LuauStructBlock_begin");
  if (!begin) return null;
  for (let capture = begin.firstChild; capture; capture = capture.nextSibling) {
    const key = findChildByName(capture, "LuauStructBlockKey");
    if (key) return key;
    if (capture.name === "LuauStructBlockKey") return capture;
  }
  return null;
}

/**
 * The token that names a struct key: its first key-name token, as the
 * indented form's header reads it, or the whole key when it has none (a
 * selector such as `&.wide`, a keyframe position such as `from`).
 */
export function structKeyToken(key: SyntaxNode): SyntaxNode {
  const walk = (node: SyntaxNode): SyntaxNode | null => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (STRUCT_KEY_TOKEN_NAMES.has(child.name)) return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(key) ?? key;
}

/** The name and dotted `.name` classes of a brace element's head, in
 *  source order: its name (and a call's arguments) in its begin, then the
 *  runs of parts (`LuauSparkleElementParts`) its content holds before its
 *  block, including those after an event closure's `}`. A component call
 *  (`card(1)`) has none of these in its key. */
export function sparkleElementKeyParts(element: SyntaxNode): {
  name: SyntaxNode | null;
  words: SyntaxNode[];
  call: boolean;
} {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
  const content = findChildByName(element, "LuauSparkleElement_content");
  const words: SyntaxNode[] = [];
  let name: SyntaxNode | null = null;
  let call = false;
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      switch (child.name) {
        case "LuauSparkleElementName":
        case "BuiltinComponentName":
          name ??= child;
          break;
        case "LuauSparkleCallArguments":
          call = true;
          break;
        default:
          walk(child);
      }
    }
  };
  if (begin) walk(begin);
  if (content) words.push(...sparklePartWords(content));
  return { name, words, call };
}

/**
 * The dotted `.name` classes in the runs of parts directly inside an
 * element's or a continuation line's content (`LuauSparkleElement_content`,
 * `LuauSparkleElementContinuation_content`), in source order, never inside
 * its block, an attribute or content.
 */
export function sparklePartWords(content: SyntaxNode): SyntaxNode[] {
  const words: SyntaxNode[] = [];
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      switch (child.name) {
        case "LuauSparkleClassName":
          words.push(child);
          break;
        case "LuauSparklePropAttribute":
        case "LuauSparkleEventAttribute":
        case "LuauSparkleEventClosureAttribute":
        case "LuauElementContentStringPlain":
        case "LuauSparkleElementBlock":
          break;
        default:
          walk(child);
      }
    }
  };
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauSparkleElementParts") {
      walk(child);
    } else if (child.name === "LuauSparkleEventClosureAttribute") {
      // The parts after the closure's `}` on its line.
      const inner = findChildByName(
        child,
        "LuauSparkleEventClosureAttribute_content",
      );
      for (let part = inner?.firstChild; part; part = part.nextSibling) {
        if (part.name === "LuauSparkleElementParts") walk(part);
      }
    }
  }
  return words;
}

/**
 * The key a brace body adds to a path: a struct block's header key as the
 * indented form reads it, `-` for a list entry, and an element's name, words
 * and classes joined by single spaces, as the static struct keys it
 * (`column.panel` is `column panel`). A component call adds nothing, as its
 * indented line adds nothing to the static struct.
 */
export function braceBodyKey(
  body: SyntaxNode,
  read: (from: number, to: number) => string,
): string | null {
  const owner = braceBodyOwner(body);
  if (owner.name === "LuauStructListBlock") return "-";
  if (owner.name === "LuauStructBlock") {
    const key = structBlockKeyNode(owner);
    if (!key) return "";
    const token = structKeyToken(key);
    return read(token.from, token.to).trim();
  }
  if (owner.name === "LuauSparkleElement") {
    const { name, words, call } = sparkleElementKeyParts(owner);
    if (call) return null;
    return [name, ...words]
      .filter((n): n is SyntaxNode => !!n)
      .map((n) => read(n.from, n.to).trim())
      .join(" ");
  }
  return null;
}

export interface BraceBlockPath {
  /** The keys of the blocks that hold the offset, outermost first. */
  path: string[];
  /** The innermost brace body that holds the offset. */
  body: SyntaxNode;
  /** Where the outermost block that holds the offset starts (its key, its
   *  element, or a list entry's `{`). Its line sits in the body's
   *  indentation, under the indented keys that start the path. */
  outerFrom: number;
}

/** The tokens that start a new brace entry: a block's `{` and `}`, and a
 *  `;` between entries. */
const ENTRY_SEPARATOR_NAMES = nodeNameSet([
  "LuauStructBlockOpen",
  "LuauStructBlockClose",
  "LuauStructBlockSeparator",
]);

/** Element-head tokens that begin with the quote an author has opened but not
 *  yet closed: a quote the head cannot read (`text 'a`), or an attribute
 *  value the grammar takes as unquoted text because its closing quote is
 *  missing (`#label='a`). */
const UNCLOSED_QUOTE_TOKEN_NAMES = nodeNameSet([
  "LuauSparkleElementInvalid",
  "InlinePropLiteralValue",
]);

const QUOTES = ['"', "'", "`"];

/**
 * The text of the brace entry being written at `offset` on the line starting
 * at `lineFrom`: what follows the last `{`, `}` or `;` the grammar reads as an
 * entry separator before the cursor. Whether a `;` or a brace is structure is
 * the parser's decision: one inside a string (`"a;b"`, element content
 * `'a; b'`), an attribute value (`#label='a; b'`) or a bracket run
 * (`[data-label='a;b']`) is part of that token, while a quote or bracket the
 * grammar reads as text (`'tis`, `ease[`) changes nothing. While an element's
 * quote is still open (`text 'a; te`), the grammar ends the element at the
 * `;`, so the entry instead starts before the open quote. Inside a string the
 * entry therefore holds its opening quote; see `entryInsideQuote`.
 */
export function braceEntryAt(
  tree: Tree,
  offset: number,
  lineFrom: number,
  read: (from: number, to: number) => string,
): string {
  const separators: number[] = [];
  let openQuote = -1;
  tree.iterate({
    from: lineFrom,
    to: offset,
    enter: (node) => {
      if (node.to > offset && node.from >= offset) return false;
      if (ENTRY_SEPARATOR_NAMES.has(node.name) && node.to <= offset) {
        separators.push(node.to);
      } else if (UNCLOSED_QUOTE_TOKEN_NAMES.has(node.name)) {
        // Still open when the quote occurs an odd number of times from the
        // opener to the cursor.
        const quote = read(node.from, node.from + 1);
        if (
          QUOTES.includes(quote) &&
          read(node.from, offset).split(quote).length % 2 === 0
        ) {
          openQuote = Math.max(openQuote, node.from);
        }
      }
      return undefined;
    },
  });
  const before = (limit: number) =>
    separators.reduce(
      (start, to) => (to <= limit ? Math.max(start, to) : start),
      lineFrom,
    );
  const start = openQuote >= 0 ? before(openQuote) : before(offset);
  return read(start, offset);
}

/** An element's attribute or handler value, whose text is Luau or a value,
 *  never an entry of the block around it. */
const ELEMENT_VALUE_NAMES = nodeNameSet([
  "LuauSparklePropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparkleEventClosureAttribute",
  "LuauSparkleHandlerClosure",
]);

/**
 * Whether `offset` lies inside an element's attribute or handler value, as
 * the parse tree reads it, on whatever line the value started (a handler
 * closure `@click={` runs over later lines).
 */
export function insideElementValue(tree: Tree, offset: number): boolean {
  for (
    let node: SyntaxNode | null = tree.resolveInner(offset, -1);
    node;
    node = node.parent
  ) {
    if (BRACE_BODY_NAMES.has(node.name)) return false;
    if (ELEMENT_VALUE_NAMES.has(node.name) && offset > node.from) return true;
  }
  return false;
}

/**
 * Whether the entry being written stands inside a value or a quoted string,
 * where neither a key nor an element name is being written: it holds an `=`
 * or a quote the author opened (`"`, a backtick, or a `'` that starts a token,
 * while `'` after a letter or digit is an apostrophe, as in `don't`).
 */
export function entryInsideValue(entry: string): boolean {
  return entry.includes("=") || entryInsideQuote(entry);
}

/** Whether the entry holds a quote the author opened (see
 *  `entryInsideValue`). */
export function entryInsideQuote(entry: string): boolean {
  return /["`]|(?:^|[^\p{L}\p{N}_])'/u.test(entry);
}

/** The brace blocks that hold `offset`, or null when no block does. */
export function braceBlockPathAt(
  tree: Tree,
  offset: number,
  read: (from: number, to: number) => string,
): BraceBlockPath | null {
  const path: string[] = [];
  let innermost: SyntaxNode | null = null;
  let outermost: SyntaxNode | null = null;
  for (
    let node: SyntaxNode | null = tree.resolveInner(offset, -1);
    node;
    node = node.parent
  ) {
    if (!BRACE_BODY_NAMES.has(node.name) || !braceBodyHolds(node, offset)) {
      continue;
    }
    innermost ??= node;
    outermost = node;
    const key = braceBodyKey(node, read);
    if (key != null) path.unshift(key);
  }
  return innermost && outermost
    ? { path, body: innermost, outerFrom: braceBodyOwner(outermost).from }
    : null;
}
