// Reading the syntax tree for the Luau lints: node helpers, the lookup of
// the token at a position, and the keyword scan that finds the constructs the
// lints start from.
//
// The tree is the TextMate-derived one the editor highlights with, not a Luau
// AST: operators and operands are flat siblings, and some one-line forms nest
// differently from their multi-line spelling.

import { type SyntaxNode, type Tree } from "@lezer/common";

export interface Source {
  read: (from: number, to: number) => string;
  /** 1-based line and column of an offset. */
  position: (pos: number) => { line: number; column: number };
}

/** A `Source` over `text`, the whole of a script that `read` reads. */
export function createSource(
  text: string,
  read: (from: number, to: number) => string,
): Source {
  // Built on first use: most scripts have nothing to report.
  let lineStarts: number[] | undefined;
  const position = (pos: number) => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
        lineStarts.push(i + 1);
      }
    }
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: pos - lineStarts[lo]! + 1 };
  };
  return { read, position };
}

export function* childrenOf(node: SyntaxNode | null | undefined) {
  for (let c = node?.firstChild; c; c = c.nextSibling) {
    yield c;
  }
}

export function childNamed(node: SyntaxNode | null | undefined, name: string) {
  for (const c of childrenOf(node)) {
    if (c.name === name) return c;
  }
  return null;
}

export function contentOf(node: SyntaxNode | null | undefined) {
  return node ? childNamed(node, `${node.name}_content`) : null;
}

/** The outermost function definition `node` is in, or `node` itself when it
 *  is an outermost function definition. */
export function outermostFunction(node: SyntaxNode): SyntaxNode | null {
  let top = node.name === "LuauFunctionDefinition" ? node : null;
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === "LuauFunctionDefinition") top = p;
  }
  return top;
}

/** The range of `node` without its leading and trailing whitespace. */
export function trimmedRange(node: SyntaxNode, src: Source) {
  const text = src.read(node.from, node.to);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  return { from: node.from + lead, to: node.to - trail };
}

export function isTrivia(node: SyntaxNode) {
  return (
    node.from === node.to ||
    node.name === "Newline" ||
    node.name.endsWith("Whitespace") ||
    node.name.includes("Comment") ||
    node.name.endsWith("_begin") ||
    node.name.endsWith("_end")
  );
}

/** The `LuauVariableName` of an access path that is one bare name. */
export function soleVariableName(path: SyntaxNode): SyntaxNode | null {
  const parts = [...childrenOf(contentOf(path))].filter((c) => !isTrivia(c));
  if (parts.length !== 1 || parts[0]!.name !== "LuauAccessPart") return null;
  const inPart = [...childrenOf(parts[0])].filter((c) => !isTrivia(c));
  if (inPart.length !== 1 || inPart[0]!.name !== "LuauVariable") return null;
  const token = inPart[0]!.firstChild?.firstChild;
  return token?.name === "LuauVariableName" ? token : null;
}

// The `elseif` and `else` arms, which the grammar places inside the `if`
// block's content after the `then` arm's statements.
export const IF_ARMS = new Set(["LuauElseifBlock", "LuauElseBlock"]);

// Blocks the grammar closes with their own `end`. A `while` or `for` loop's
// `end` belongs to its `do` block.
export const END_BLOCKS = new Set([
  "LuauFunctionDefinition",
  "LuauDoBlock",
  "LuauIfBlock",
]);

/** Whether an `end`-closed block found its `end`. An unfinished function
 *  (one being typed, or one the parser gave up on partway) ends early, and
 *  the statements after the break are parsed as top-level code, so its blocks
 *  do not show what the author wrote. */
export function hasEnd(block: SyntaxNode): boolean {
  const end = childNamed(block, `${block.name}_end`);
  let found = false;
  end?.cursor().iterate((ref) => {
    if (ref.name === "LuauEndKeyword") found = true;
    return !found;
  });
  return found;
}

/** Finds the innermost node that covers the character at a position. */
export type TokenAt = (pos: number) => SyntaxNode;

// A node with more children than this is searched by halving.
const MANY_CHILDREN = 16;
// Below the root, a node shorter than this is searched by Lezer directly:
// listing its children costs more than it saves.
const LONG_NODE = 2048;

/** A `TokenAt` for `tree`. A long script's root has thousands of children,
 *  and so does the body of a long function, and Lezer searches them one by
 *  one on every lookup, so the children of each such node are indexed the
 *  first time a lookup passes through it and searched by halving after that.
 *  From the first node that is short or has few children, resolving at the
 *  middle of the character with side 0 enters only nodes that strictly
 *  contain that point; resolving at the position itself can stop at a
 *  zero-width `_begin` node that starts there. */
export function tokenFinder(tree: Tree): TokenAt {
  // The children of each node a lookup has passed through, or null for a
  // node with few, by the node's depth, name and start. Node objects are not
  // kept by the tree, so a later lookup gets a fresh object for the same node.
  const indexed = new Map<string, SyntaxNode[] | null>();
  const childrenIndexed = (node: SyntaxNode, depth: number) => {
    const key = `${depth}:${node.name}:${node.from}`;
    let children = indexed.get(key);
    if (children === undefined) {
      const all: SyntaxNode[] = [];
      for (let c = node.firstChild; c; c = c.nextSibling) all.push(c);
      children = all.length > MANY_CHILDREN ? all : null;
      indexed.set(key, children);
    }
    return children;
  };
  return (pos) => {
    let node = tree.topNode;
    for (let depth = 0; ; depth++) {
      const children =
        depth > 0 && node.to - node.from < LONG_NODE
          ? null
          : childrenIndexed(node, depth);
      if (!children) return node.resolveInner(pos + 0.5, 0);
      let lo = 0;
      let hi = children.length - 1;
      let inside: SyntaxNode | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const child = children[mid]!;
        if (child.to <= pos) lo = mid + 1;
        else if (child.from > pos) hi = mid - 1;
        else {
          inside = child;
          break;
        }
      }
      if (!inside) return node;
      node = inside;
    }
  };
}

/** Operation wrappers whose content is `<binary operator> <operand>...`,
 *  which read as part of the enclosing list. Unary `#t` stays one token. */
export function isBinaryOperation(node: SyntaxNode) {
  return (
    node.name.endsWith("Operation") &&
    node.name !== "LuauLengthOperation" &&
    contentOf(node) !== null
  );
}

// ---------------------------------------------------------------------------
// Finding the constructs

export interface Found {
  /** Every function definition, in source order. */
  functions: SyntaxNode[];
  forLoops: SyntaxNode[];
  /** `if` statements and `if` expressions. */
  ifChains: SyntaxNode[];
  /** Nodes whose children hold an `and` or `or` operator, outermost first. */
  logicalLists: SyntaxNode[];
  /** `store` and `const` declarations, which declare globals. */
  globalDeclarations: SyntaxNode[];
}

// Each construct the lints start from is spelled with one of these words.
const KEYWORDS = /\b(function|for|if|and|or|store|const)\b/g;

/** The nearest node named `name` at or above `node`, within a few levels. */
function ancestorNamed(node: SyntaxNode, names: Set<string>, levels: number) {
  for (let n: SyntaxNode | null = node; n && levels >= 0; n = n.parent) {
    if (names.has(n.name)) return n;
    levels--;
  }
  return null;
}

const FUNCTION = new Set(["LuauFunctionDefinition"]);
const FOR_LOOP = new Set(["LuauForLoop"]);
const IF_CHAIN = new Set(["LuauIfBlock", "LuauTernaryExpression"]);
const LOGICAL_OPERATOR = new Set(["LuauLogicalOperator"]);
const VARIABLE_DEFINITION = new Set(["LuauVariableDefinition"]);

/** Finds the constructs the lints check from their keywords in the text,
 *  which costs a small fraction of walking a script's whole tree: a long
 *  script is mostly narrative, and its tree has several nodes per word. A
 *  keyword that is not a Luau keyword there (prose, a string, a comment)
 *  resolves to some other node and is dropped. */
export function findConstructs(tokenAt: TokenAt, text: string): Found {
  const found: Found = {
    functions: [],
    forLoops: [],
    ifChains: [],
    logicalLists: [],
    globalDeclarations: [],
  };
  const seen = new Set<string>();
  const add = (list: SyntaxNode[], node: SyntaxNode | null) => {
    if (!node) return;
    const key = `${node.name}:${node.from}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(node);
  };
  for (const match of text.matchAll(KEYWORDS)) {
    const token = tokenAt(match.index!);
    switch (match[1]) {
      case "function":
        if (token.name === "LuauFunctionKeyword") {
          add(found.functions, ancestorNamed(token, FUNCTION, 4));
        }
        break;
      case "for":
        if (token.name === "LuauForKeyword") {
          add(found.forLoops, ancestorNamed(token, FOR_LOOP, 4));
        }
        break;
      case "if":
        if (token.name === "LuauIfKeyword") {
          add(found.ifChains, ancestorNamed(token, IF_CHAIN, 4));
        }
        break;
      case "store":
      case "const":
        if (token.name === "LuauScopeModifier") {
          add(
            found.globalDeclarations,
            ancestorNamed(token, VARIABLE_DEFINITION, 3),
          );
        }
        break;
      default: {
        const operator = ancestorNamed(token, LOGICAL_OPERATOR, 3);
        if (!operator) break;
        // The list is the first node above the operator that is not one of
        // the operation wrappers the expression readers look through.
        let list = operator.parent;
        while (
          list &&
          (isBinaryOperation(list) || list.name.endsWith("Operation_content"))
        ) {
          list = list.parent;
        }
        add(found.logicalLists, list);
      }
    }
  }
  found.logicalLists.sort((a, b) => a.from - b.from || b.to - a.to);
  return found;
}
