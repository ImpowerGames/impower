import type { SyntaxNode, Tree } from "@lezer/common";

const STORY_STATEMENTS = new Set([
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownVariableDefinition",
  "LuauSparkdownReassignment",
]);

const STORY_CONDITIONS: Record<string, ReadonlySet<string>> = {
  LuauSparkdownExplicitIfCondition: new Set(["LuauSparkdownIfBlock", "LuauSparkdownElseifBlock"]),
  LuauSparkdownExplicitLoopCondition: new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]),
};

const STORY_LOOPS = new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]);
const LOOP_DO_BLOCKS = ["LuauSparkdownDoBlock", "LuauSparkdownExplicitDoBlock"];

function ruleOf(node: SyntaxNode): SyntaxNode | null {
  const parent = node.parent;
  return parent?.name.endsWith("_content") ? parent.parent : parent;
}

export function isStoryCondition(node: SyntaxNode): boolean {
  return STORY_CONDITIONS[node.name]?.has(ruleOf(node)?.name ?? "") ?? false;
}

export function lastLineEnd(text: string, to: number): number {
  let end = to;
  if (text[end - 1] === "\n") end--;
  if (text[end - 1] === "\r") end--;
  while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end++;
  return end;
}

export function storyIslandEnd(node: SyntaxNode, text: string): number | undefined {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "LuauFunctionBody") return enclosingUnclosedIslandEnd(n, text);
    if (n.name === "LuauSparkdownExplicitStatement") return n.to;
    if (STORY_STATEMENTS.has(n.name)) return unclosedIslandEnd(n, text) ?? lastLineEnd(text, n.to);
    if (isStoryCondition(n)) return lastLineEnd(text, n.to);
    if (n.name === "LuauSparkdownExplicitUntilCondition" && isStoryUntilCondition(n)) return lastLineEnd(text, n.to);
  }
  return undefined;
}

export function continuesPastLine(node: SyntaxNode, text: string): boolean {
  const end = lastLineEnd(text, node.to);
  for (let next = node.nextSibling; next && next.from < end; next = next.nextSibling) {
    if (lastLineEnd(text, next.to) > end) return true;
  }
  return false;
}

const BRACKET_OPENER = /^Punctuation(?:Paren|Brace|Bracket)Open$/;
const BRACKET_CLOSER = /^Punctuation(?:Paren|Brace|Bracket)Close$/;

function firstLeaf(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from === child.to) continue;
    return firstLeaf(child) ?? child;
  }
  return null;
}

function holds(node: SyntaxNode, pattern: RegExp): SyntaxNode | null {
  if (pattern.test(node.name)) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = holds(child, pattern);
    if (found) return found;
  }
  return null;
}

function unclosedOpener(island: SyntaxNode): SyntaxNode | null {
  let node = island;
  for (;;) {
    let next: SyntaxNode | null = null;
    for (let child = node.lastChild; child && child.to === island.to; child = child.prevSibling) {
      if (child.from < child.to) {
        next = child;
        break;
      }
    }
    if (!next) return null;
    if (next.name.startsWith("LuauInterpolatedString") || next.name.includes("String")) return null;
    const begin = next.getChild(`${next.name}_begin`);
    const opener = begin && firstLeaf(begin);
    if (opener && BRACKET_OPENER.test(opener.name)) {
      const end = next.getChild(`${next.name}_end`);
      return end && holds(end, BRACKET_CLOSER) ? null : opener;
    }
    node = next;
  }
}

export function unclosedIslandEnd(node: SyntaxNode, text: string): number | undefined {
  if (node.name !== "LuauSparkdownVariableDefinition" && node.name !== "LuauSparkdownReassignment") return undefined;
  if (!isStoryStatementIsland(node)) return undefined;
  const opener = unclosedOpener(node);
  return opener ? lastLineEnd(text, opener.to) : undefined;
}

export function enclosingUnclosedIslandEnd(node: SyntaxNode, text: string): number | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (enclosingEnds.text !== text) enclosingEnds = { text, byParent: new Map() };
  const key = `${parent.name}:${parent.from}:${parent.to}`;
  const known = enclosingEnds.byParent.get(key);
  if (known !== undefined) return known ?? undefined;
  let end: number | undefined;
  for (let n: SyntaxNode | null = parent; n && n.name.startsWith("Luau"); n = n.parent) {
    if ((n.name === "LuauSparkdownVariableDefinition" || n.name === "LuauSparkdownReassignment") && isStoryStatementIsland(n)) {
      end = unclosedIslandEnd(n, text);
      break;
    }
  }
  enclosingEnds.byParent.set(key, end ?? null);
  return end;
}

let enclosingEnds: { text: string; byParent: Map<string, number | null> } = { text: "", byParent: new Map() };

export function cutIslands(tree: Tree, text: string): { from: number; to: number }[] {
  const islands: { from: number; to: number }[] = [];
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== "LuauSparkdownVariableDefinition" && ref.name !== "LuauSparkdownReassignment") return;
      if (unclosedIslandEnd(ref.node, text) !== undefined) islands.push({ from: ref.from, to: ref.to });
    },
  });
  return islands;
}

function inMarkedStatementOrFunction(node: SyntaxNode): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (n.name === "LuauFunctionBody" || n.name === "LuauSparkdownExplicitStatement") return true;
  }
  return false;
}

function isStoryUntilCondition(node: SyntaxNode): boolean {
  return !inMarkedStatementOrFunction(node);
}

function isHeaderOnlyLoop(node: SyntaxNode): boolean {
  const content = node.getChild(`${node.name}_content`);
  return STORY_LOOPS.has(node.name) && !LOOP_DO_BLOCKS.some((name) => content?.getChild(name));
}

function isMarkedStatementLoop(node: SyntaxNode): boolean {
  return node.name === "LuauSparkdownExplicitLoop" && ruleOf(node)?.name === "LuauSparkdownExplicitStatement";
}

export function isStoryHeaderOnlyLoop(node: SyntaxNode): boolean {
  return isHeaderOnlyLoop(node) && (isMarkedStatementLoop(node) || !inMarkedStatementOrFunction(node));
}

export function isStoryStatementIsland(node: SyntaxNode): boolean {
  if (node.name === "LuauSparkdownExplicitUntilCondition") return isStoryUntilCondition(node);
  if (isHeaderOnlyLoop(node)) return !inMarkedStatementOrFunction(node);
  if (node.name !== "LuauSparkdownVariableDefinition" && node.name !== "LuauSparkdownReassignment") return false;
  for (let n = node.parent; n; n = n.parent) {
    if (n.name === "LuauFunctionBody" || STORY_STATEMENTS.has(n.name)) return false;
  }
  return true;
}
