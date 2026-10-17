import type { SyntaxNode } from "@lezer/common";

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
// statement does, each with the bounded rule that reads it.
const STORY_CONDITIONS: Record<string, ReadonlySet<string>> = {
  LuauSparkdownExplicitIfCondition: new Set(["LuauSparkdownIfBlock", "LuauSparkdownElseifBlock"]),
  LuauSparkdownExplicitLoopCondition: new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop"]),
};

// Story loops, whose header ends at its line: one with no `do` block on it
// is an island of its own, missing its `do` (#1907).
const STORY_LOOPS = new Set(["LuauSparkdownForLoop", "LuauSparkdownWhileLoop"]);

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
 * a node in one has none.
 */
export function storyIslandEnd(node: SyntaxNode, text: string): number | undefined {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "LuauFunctionBody") return undefined;
    if (n.name === "LuauSparkdownExplicitStatement") return n.to;
    if (STORY_STATEMENTS.has(n.name)) return storyStatementEnd(n, text);
    if (isStoryCondition(n)) return lastLineEnd(text, n.to);
    if (n.name === "LuauSparkdownExplicitUntilCondition" && isStoryUntilCondition(n)) return lastLineEnd(text, n.to);
  }
  return undefined;
}

/**
 * Where a story statement's Luau meets its end of input: the end of its last
 * line, or of the last line of a statement that begins later on that line
 * (`local a = 0 a = math.max(1,` / `2)`, or a block such as `while x do`),
 * which Luau reads on with it, since nothing ends Luau's reading between
 * them.
 */
export function storyStatementEnd(node: SyntaxNode, text: string): number {
  let end = lastLineEnd(text, node.to);
  for (let next = node.nextSibling; next && next.from < end; next = next.nextSibling) {
    end = Math.max(end, lastLineEnd(text, next.to));
  }
  return end;
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
  return STORY_LOOPS.has(node.name) && !node.getChild(`${node.name}_content`)?.getChild("LuauSparkdownDoBlock");
}

/**
 * Whether a node is a story `for` or `while` whose header has no `do` block
 * on its line: an island whose Luau meets its end of input where the `do`
 * should be, so Luau's error there is the loop's diagnostic.
 */
export function isStoryHeaderOnlyLoop(node: SyntaxNode): boolean {
  return isHeaderOnlyLoop(node) && !inMarkedStatementOrFunction(node);
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
