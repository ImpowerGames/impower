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

/** The name, bare words and `.name` classes of a brace element's head, in
 *  source order. A component call (`card(1)`) has none of these in its key. */
export function sparkleElementKeyParts(element: SyntaxNode): {
  name: SyntaxNode | null;
  words: SyntaxNode[];
  call: boolean;
} {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
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
        case "LuauSparkleElementWord":
        case "LuauSparkleClassName":
          words.push(child);
          break;
        case "LuauSparkleCallArguments":
          call = true;
          break;
        case "LuauSparklePropAttribute":
        case "LuauSparkleEventAttribute":
        case "LuauElementContentStringPlain":
          break;
        default:
          walk(child);
      }
    }
  };
  if (begin) walk(begin);
  return { name, words, call };
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

/**
 * The text of the brace entry being written, given the line up to the
 * cursor: what follows the last `{`, `}` or `;` that stands outside a quoted
 * string and outside `[…]`. Null when the cursor is inside a quoted string,
 * where no key is being written. As the struct grammar reads values, `"` and
 * backtick strings are strings everywhere, while a `'` is a quote only inside
 * `[…]` (`[data-label='a;b']`), where `;` also stays part of the value;
 * elsewhere it is text (`'tis`, `don't`). Single-quoted element content
 * (`text 'a; b'`) is read from the tree: see `insideSingleQuotedContent`.
 */
export function braceEntryBefore(lineBefore: string): string | null {
  let start = 0;
  let quote = "";
  let brackets = 0;
  for (let i = 0; i < lineBefore.length; i += 1) {
    const ch = lineBefore[i]!;
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "`" || (ch === "'" && brackets > 0)) {
      quote = ch;
    } else if (ch === "[") {
      brackets += 1;
    } else if (ch === "]") {
      brackets = Math.max(0, brackets - 1);
    } else if (brackets === 0 && (ch === "{" || ch === "}" || ch === ";")) {
      start = i + 1;
    }
  }
  return quote ? null : lineBefore.slice(start);
}

/**
 * Whether `offset` lies inside an element's single-quoted content
 * (`text 'a; b'`, `text'a'`), as the grammar reads it, where no key is being
 * written.
 */
export function insideSingleQuotedContent(
  tree: Tree,
  offset: number,
  read: (from: number, to: number) => string,
): boolean {
  for (
    let node: SyntaxNode | null = tree.resolveInner(offset, -1);
    node;
    node = node.parent
  ) {
    if (node.name !== "LuauElementContentStringSingleQuoted") continue;
    const text = read(node.from, node.to);
    const closed = text.length > 1 && text.endsWith("'");
    return offset > node.from && (offset < node.to || !closed);
  }
  return false;
}

/** The brace entry being written at `offset`, or null when no key is being
 *  written there (inside a quoted string). */
export function braceEntryAt(
  tree: Tree,
  offset: number,
  lineBefore: string,
  read: (from: number, to: number) => string,
): string | null {
  return insideSingleQuotedContent(tree, offset, read)
    ? null
    : braceEntryBefore(lineBefore);
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

/** Whether a declaration's body holds a line written with brace blocks. */
export function bodyUsesBraceBlocks(declaration: SyntaxNode): boolean {
  for (let child = declaration.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith("_content")) {
      for (let line = child.firstChild; line; line = line.nextSibling) {
        if (
          line.name === "LuauStructBlockLine" ||
          line.name === "LuauSparkleBlockLine"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
