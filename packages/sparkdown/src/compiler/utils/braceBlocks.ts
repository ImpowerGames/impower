import { type SyntaxNode, type Tree } from "@lezer/common";
import { findChildByName } from "./findChildByName";
import { nodeNameSet } from "./nodeNameSet";

export const BRACE_BODY_NAMES = nodeNameSet([
  "LuauStructBlockBody",
  "LuauStructListBlock",
  "LuauSparkleElementBlock",
]);

export const STRUCT_KEY_TOKEN_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "StylingDeclarationScalarPropertyName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "ComponentName",
  "PropertyName",
  "SelectorPropertyNamePart",
]);

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

export function braceBodyCloseFrom(body: SyntaxNode): number {
  const { end } = braceBodyParts(body);
  return end && end.to > end.from ? end.from : body.to;
}

export function braceBodyHolds(body: SyntaxNode, offset: number): boolean {
  const { begin } = braceBodyParts(body);
  const openTo = begin ? begin.to : body.from + 1;
  return offset >= openTo && offset <= braceBodyCloseFrom(body);
}

export function braceBodyOwner(body: SyntaxNode): SyntaxNode {
  if (body.name === "LuauStructListBlock") return body;
  const content = body.parent;
  const owner = content?.parent;
  return owner &&
    (owner.name === "LuauStructBlock" || owner.name === "LuauSparkleElement")
    ? owner
    : body;
}

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
  path: string[];
  body: SyntaxNode;
  outerFrom: number;
}

const ENTRY_SEPARATOR_NAMES = nodeNameSet([
  "LuauStructBlockOpen",
  "LuauStructBlockClose",
  "LuauStructBlockSeparator",
  "LuauStructBlockEntryComma",
  "LuauStructBlockTrailingComma",
]);

const UNCLOSED_QUOTE_TOKEN_NAMES = nodeNameSet([
  "LuauSparkleElementInvalid",
  "InlinePropLiteralValue",
]);

const QUOTES = ['"', "'", "`"];

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
      } else if (node.name === "LuauSparkleElement_begin" && node.from < offset) {
        separators.push(node.from);
      } else if (UNCLOSED_QUOTE_TOKEN_NAMES.has(node.name)) {
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

const ELEMENT_VALUE_NAMES = nodeNameSet([
  "LuauSparklePropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparkleEventClosureAttribute",
  "LuauSparkleHandlerClosure",
]);

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

export function entryInsideValue(entry: string): boolean {
  return entry.includes("=") || entryInsideQuote(entry);
}

export function entryInsideQuote(entry: string): boolean {
  return /["`]|(?:^|[^\p{L}\p{N}_])'/u.test(entry);
}

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
