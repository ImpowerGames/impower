import type { SyntaxNode, Tree } from "@lezer/common";

// A Luau statement in a story body (a scene, a branch or the file's top
// level) ends at its line unless a bracket, a long string or a block comment
// carries it on (#1907): an `&` statement (#1374), a declaration or a
// reassignment. Its text is an island of Luau with its own end, where Luau's
// reading meets its end of input, so what the statement is missing there is
// `<eof>`, never a word of the story line after it.
const STORY_STATEMENTS = new Set([
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownVariableDefinition",
  "LuauSparkdownReassignment",
]);

// The story blocks whose header's condition ends at its line, as a story
// statement does, each with the bounded rule that reads it. A marked (`&`)
// loop shares the story loops' condition.
const STORY_CONDITIONS: Record<string, ReadonlySet<string>> = {
  LuauSparkdownExplicitIfCondition: new Set(["LuauSparkdownIfBlock", "LuauSparkdownElseifBlock"]),
  LuauSparkdownExplicitLoopCondition: new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]),
};

// Story loops, whose header ends at its line: one with no `do` block on it
// is an island of its own, missing its `do` (#1907). A marked loop's header
// ends with its marked statement's line.
const STORY_LOOPS = new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]);
const LOOP_DO_BLOCKS = ["LuauSparkdownDoBlock", "LuauSparkdownExplicitDoBlock"];

/** The rule a node is a part of, past the `_content` node that holds it. */
function ruleOf(node: SyntaxNode): SyntaxNode | null {
  const parent = node.parent;
  return parent?.name.endsWith("_content") ? parent.parent : parent;
}

/** Whether a node is a story block's header condition, which ends at its line. */
export function isStoryCondition(node: SyntaxNode): boolean {
  return STORY_CONDITIONS[node.name]?.has(ruleOf(node)?.name ?? "") ?? false;
}

/**
 * The end of the last line a node spans, before its line break: a node that
 * a bracket carried past a line break it took in ends on the line before.
 */
export function lastLineEnd(text: string, to: number): number {
  let end = to;
  if (text[end - 1] === "\n") end--;
  if (text[end - 1] === "\r") end--;
  while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end++;
  return end;
}

/**
 * Where the story statement, or story `if` or `elseif` condition, that holds
 * a node ends: the end of input of its Luau. That is the end of the line the
 * statement ends on, so a token later on that line (`local a = 1 +;`) is
 * still one Luau's reading meets. A marked statement already spans its
 * line. A genuine function inside it keeps Luau's own multiline reading, so
 * a node in one has none, unless the statement is cut at its unclosed
 * bracket's line (`unclosedIslandEnd`), which ends the function too.
 */
export function storyIslandEnd(node: SyntaxNode, text: string): number | undefined {
  // A statement cut at its unclosed bracket's line ends there, a function
  // in it included (`unclosedIslandEnd`, I-1532).
  const cut = enclosingUnclosedIslandEnd(node, text);
  if (cut !== undefined) return cut;
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "LuauFunctionBody") return undefined;
    if (n.name === "LuauSparkdownExplicitStatement") return n.to;
    if (STORY_STATEMENTS.has(n.name)) return lastLineEnd(text, n.to);
    if (isStoryCondition(n)) return lastLineEnd(text, n.to);
    if (n.name === "LuauSparkdownExplicitUntilCondition" && isStoryUntilCondition(n)) return lastLineEnd(text, n.to);
  }
  return undefined;
}

/**
 * Whether a statement that begins later on a story statement's last line goes
 * on past that line (`local a = 0 a = math.max(1,` / `2)`, or a block such as
 * `while x do`). Nothing ends Luau's reading between the two, so the end of
 * the line is no end of input: the later statement's own end, or the story
 * after its block, ends the reading instead.
 */
export function continuesPastLine(node: SyntaxNode, text: string): boolean {
  const end = lastLineEnd(text, node.to);
  for (let next = node.nextSibling; next && next.from < end; next = next.nextSibling) {
    if (lastLineEnd(text, next.to) > end) return true;
  }
  return false;
}

const BRACKET_OPENER = /^Punctuation(?:Paren|Brace|Bracket)Open$/;
const BRACKET_CLOSER = /^Punctuation(?:Paren|Brace|Bracket)Close$/;

/** The first node with text and no children in a node's subtree. */
function firstLeaf(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from === child.to) continue;
    return firstLeaf(child) ?? child;
  }
  return null;
}

/** The first node in a node's subtree, itself included, named as `pattern` matches. */
function holds(node: SyntaxNode, pattern: RegExp): SyntaxNode | null {
  if (pattern.test(node.name)) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = holds(child, pattern);
    if (found) return found;
  }
  return null;
}

/**
 * The opener of the outermost bracket in a story declaration or
 * reassignment island that has no closer, if one does. A bracket the tree
 * never closes runs on to the island's end, so it is on the path of the
 * nodes that end where the island does; a closed bracket on that path ends
 * the search, as no bracket in it is outermost.
 */
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
    // A bracket's rule begins with its opener (`(`, `{`, `[`), where a
    // block's begins with its keyword (`function(x)`, ended by `end`).
    const begin = next.getChild(`${next.name}_begin`);
    const opener = begin && firstLeaf(begin);
    if (opener && BRACKET_OPENER.test(opener.name)) {
      const end = next.getChild(`${next.name}_end`);
      return end && holds(end, BRACKET_CLOSER) ? null : opener;
    }
    node = next;
  }
}

/**
 * Where a story declaration or reassignment island ends when it leaves a
 * bracket open (I-1532): the end of the line of its outermost unclosed
 * bracket's opener. The tree reads the story lines after that bracket into
 * it, up to whatever ends the statement's node, but a bracket that never
 * closes carried nothing on (#1907), so those lines are story, and Luau's
 * reading meets its end of input at the end of the opener's line, as it
 * does for that line alone. Undefined for any other node, or an island
 * with no unclosed bracket.
 */
export function unclosedIslandEnd(node: SyntaxNode, text: string): number | undefined {
  if (node.name !== "LuauSparkdownVariableDefinition" && node.name !== "LuauSparkdownReassignment") return undefined;
  if (!isStoryStatementIsland(node)) return undefined;
  const opener = unclosedOpener(node);
  return opener ? lastLineEnd(text, opener.to) : undefined;
}

/** The `unclosedIslandEnd` of the story island a node is inside, if it has one. */
export function enclosingUnclosedIslandEnd(node: SyntaxNode, text: string): number | undefined {
  for (let n = node.parent; n; n = n.parent) {
    if ((n.name === "LuauSparkdownVariableDefinition" || n.name === "LuauSparkdownReassignment") && isStoryStatementIsland(n)) {
      return unclosedIslandEnd(n, text);
    }
  }
  return undefined;
}

/**
 * The story lines after each story island's unclosed bracket in a tree
 * (`unclosedIslandEnd`): from the island's cut to its end. A node that
 * begins in one is story, not the statement's Luau.
 */
export function unclosedIslandCuts(tree: Tree, text: string): { from: number; to: number }[] {
  const cuts: { from: number; to: number }[] = [];
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== "LuauSparkdownVariableDefinition" && ref.name !== "LuauSparkdownReassignment") return;
      const end = unclosedIslandEnd(ref.node, text);
      if (end !== undefined) cuts.push({ from: end, to: ref.to });
    },
  });
  return cuts;
}

/** Whether a node lies inside a marked statement or a function, which read Luau as their own rules do. */
function inMarkedStatementOrFunction(node: SyntaxNode): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (n.name === "LuauFunctionBody" || n.name === "LuauSparkdownExplicitStatement") return true;
  }
  return false;
}

/** Whether a bounded `until` condition is a story `repeat` loop's rather than a marked statement's. */
function isStoryUntilCondition(node: SyntaxNode): boolean {
  return !inMarkedStatementOrFunction(node);
}

/** Whether a story loop's header has no `do` block on it, so the loop ends with its header's line. */
function isHeaderOnlyLoop(node: SyntaxNode): boolean {
  const content = node.getChild(`${node.name}_content`);
  return STORY_LOOPS.has(node.name) && !LOOP_DO_BLOCKS.some((name) => content?.getChild(name));
}

/** Whether a node is the loop a marked statement holds as its own statement (`& while x`), not one nested in its block. */
function isMarkedStatementLoop(node: SyntaxNode): boolean {
  return node.name === "LuauSparkdownExplicitLoop" && ruleOf(node)?.name === "LuauSparkdownExplicitStatement";
}

/**
 * Whether a node is a story `for` or `while`, or a marked statement's own loop,
 * whose header has no `do` block on its line: its Luau meets its end of input
 * where the `do` should be, so Luau's error there is the loop's diagnostic.
 * A loop nested in a marked block meets that block's `end` instead.
 */
export function isStoryHeaderOnlyLoop(node: SyntaxNode): boolean {
  return isHeaderOnlyLoop(node) && (isMarkedStatementLoop(node) || !inMarkedStatementOrFunction(node));
}

/**
 * Whether a node is a story statement that is its own island: a story
 * declaration or reassignment not inside another story statement, whose
 * island it is part of; a story `repeat` loop's `until` condition; or a
 * story `for` or `while` whose header has no `do` block on its line. None
 * is inside a function.
 */
export function isStoryStatementIsland(node: SyntaxNode): boolean {
  if (node.name === "LuauSparkdownExplicitUntilCondition") return isStoryUntilCondition(node);
  if (isHeaderOnlyLoop(node)) return !inMarkedStatementOrFunction(node);
  if (node.name !== "LuauSparkdownVariableDefinition" && node.name !== "LuauSparkdownReassignment") return false;
  for (let n = node.parent; n; n = n.parent) {
    if (n.name === "LuauFunctionBody" || STORY_STATEMENTS.has(n.name)) return false;
  }
  return true;
}
