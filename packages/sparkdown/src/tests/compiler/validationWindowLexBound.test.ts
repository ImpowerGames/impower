// #1724: the validation window looks up the first significant token after an
// edit (`nextSignificantToken`). It must not lex the whole document to find
// it, or every keystroke in a long script pays for the whole script.
import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { lexLuauDocumentForTesting, nextLuauToken, noteLuauDocumentEdit, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";

// The lookups keep the last document's tokens; a lookup in an empty
// document makes the next one lex its document from the start.
const forget = () => nextLuauToken(0, "");

test.each([
  ["a comment", "local x =\n  -- note\n  --[[ a long\n  comment ]]\n  value\n", "value"],
  ["a multiline string", "local x = [[\n  -- text\n]]\n  value\n", "value"],
  ["an unfinished long string", "local x = [==[\n  text ]] value\n", null],
  ["an unfinished long comment", "local x = --[[\n  value\n", null],
  ["the end of the document", "local x =\n  -- nothing after\n", null],
])("the next significant token after %s", (_, body, expected) => {
  // Lines before, which an edit below them leaves to be carried over.
  const header = "local h = 1 -- header\n".repeat(10);
  const source = header + body;
  // From the end of the body's first line, as the window looks up from the
  // end of the edit's line: inside a long string or comment that line opens.
  const from = header.length + body.indexOf("\n");
  for (const fresh of [true, false]) {
    if (fresh) forget();
    // Without `fresh`, the lookup carries tokens over from the document
    // before, which differs from this one past the body's first line.
    else {
      const before = source.slice(0, from) + "\n  other ]] -- [[\n";
      nextLuauToken(before.length, before);
      noteLuauDocumentEdit(before, source, from, before.length, source.length);
    }
    const token = nextLuauToken(from, source);
    expect(token).toEqual(expected == null ? null : { text: expected, from: source.lastIndexOf(expected) });
  }
});

/**
 * What the lexer reads from the document (its comment test at the start of
 * each token or comment, `text.startsWith("--", i)`) for a lookup after an
 * edit in the last of `lines` comment lines: comments leave no token behind,
 * so only what the lexer records of its way through them can spare it
 * reading them again.
 */
function scansBelowComments(lines: number) {
  const head = `local x = 1\n${"-- note\n".repeat(lines)}`;
  const source = `${head}-- edit me\nvalue\n`;
  forget();
  // The cache has read the whole document before the edit.
  expect(nextLuauToken(source.length, source)).toBeNull();
  const at = head.length + "-- edit".length;
  const edited = `${source.slice(0, at)}s${source.slice(at)}`;
  noteLuauDocumentEdit(source, edited, at, at, at + 1);
  let scans = 0;
  const startsWith = String.prototype.startsWith;
  const spy = vi.spyOn(String.prototype, "startsWith").mockImplementation(function (this: string, search: string, position?: number) {
    if (search === "--" && this.length === edited.length) scans++;
    return startsWith.call(this, search, position);
  });
  try {
    // From the end of the edited line, as the window looks up.
    expect(nextLuauToken(edited.indexOf("\n", at), edited)).toEqual({ text: "value", from: edited.lastIndexOf("value") });
  } finally {
    spy.mockRestore();
  }
  return scans;
}

test("an edit below a long run of comments reads only near the edit", () => {
  const long = scansBelowComments(1000);
  const longer = scansBelowComments(4000);
  console.log("lookup below comments", JSON.stringify({ long, longer }));
  expect(longer).toBeLessThanOrEqual(long + 2);
  expect(longer).toBeLessThan(60);
});

test("lookups after edits read the tokens a lex of the whole edited document gives", () => {
  // A small fixed generator, so a failure reproduces.
  let seed = 1724;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pieces = ["-", "[", "]", "=", "'", '"', "\n", " ", "x", "1", ".", "--", "[[", "]]", "--[==[", "]==]", "local y = ", "Hello there"];
  // Runs of comments and blank lines longer than the lex's resume gap, so
  // edits also resume from between two tokens.
  const trivia = (i: number) => `-- ${"a long comment ".repeat(6)}${i}\n\n${" ".repeat(70)}\n--[==[ ${"block ".repeat(14)}]==]\n`;
  let source = Array.from({ length: 40 }, (_, i) =>
    i % 4 === 0 ? `local v${i} = ${i} -- c${i}\n` : i % 4 === 1 ? `The hero's [[path]] ${i}.\n` : i % 4 === 2 ? `--[=[ long ${i}\n]=] x${i} = "s${i}"\n` : trivia(i)).join("");
  type Step = { source: string; probes: number[]; bound: number; found: unknown };
  const lookups = ({ source, probes, bound }: Omit<Step, "found">) => ({
    tokens: probes.map((from) => nextLuauToken(from, source)),
    expression: readLuauExpressionAfter(probes[0]!, source),
    bounded: readLuauExpressionAfter(probes[1]!, source, bound),
  });
  // One chain of edits, each looked up with the tokens carried over from
  // the lookups after the edits before it, as an editing session does.
  forget();
  const steps: Step[] = [];
  for (let step = 0; step < 200; step++) {
    const at = random(source.length + 1);
    const removed = random(4) === 0 ? random(8) : 0;
    const inserted = random(3) === 0 ? "" : pieces[random(pieces.length)]!;
    const before = source;
    source = source.slice(0, at) + inserted + source.slice(at + removed);
    // As the registry notes each change it applies (#1750).
    noteLuauDocumentEdit(before, source, at, Math.min(at + removed, before.length), at + inserted.length);
    // Some lookups near the edit, some anywhere.
    const probes = Array.from({ length: 6 }, (_, i) => i % 2 === 0 ? Math.min(source.length, at + random(80)) : random(source.length + 1));
    const bound = Math.min(source.length, probes[1]! + 40);
    steps.push({ source, probes, bound, found: lookups({ source, probes, bound }) });
  }
  // Each edited document's tokens, lexed whole with no cache, give the
  // tokens looked up; the expressions read again from an emptied cache are
  // the ones read with the tokens carried over.
  for (const { found, ...step } of steps) {
    const tokens = lexLuauDocumentForTesting(step.source);
    const next = (from: number) => {
      const token = tokens.find((candidate) => candidate.from >= from);
      if (!token) return null;
      return { text: token.kind === "name" || token.kind === "keyword" ? token.text : token.text[0], from: token.from };
    };
    forget();
    expect(found).toEqual({ ...lookups(step), tokens: step.probes.map(next) });
  }
});

const block = (i: number) =>
  `function f${i}()\n  local x${i} = ${i} -- note ${i}\n  return x${i}\nend\n\nThe hero walks on, ${i} steps.\n\n`;

// A deliberate error near the bottom, which the window must still report.
const tail = "function g()\n  Hello there\nend\n\nThe hero stops.\n";

function validations(registry: SparkdownDocumentRegistry, uri: string) {
  const found: { from: number; to: number; message: string }[] = [];
  const iter = registry.annotations(uri)!.validations.iter(0);
  while (iter.value) {
    found.push({ from: iter.from, to: iter.to, message: iter.value.type.message ?? "" });
    iter.next();
  }
  return found;
}

/**
 * The tokens the Luau lexer reads from the document during one edit at the
 * bottom of a document of `count` blocks, counted by the comment test the
 * lexer makes at the start of each token (`text.startsWith("--", i)`).
 */
function lexedOnEdit(count: number) {
  const uri = `inmemory:///validation-window-${count}.sd`;
  const source = Array.from({ length: count }, (_, i) => block(i)).join("") + tail;
  const registry = new SparkdownDocumentRegistry(["validations"]);
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const before = "The hero stops.";
  const after = "The hero stops here.";
  const offset = source.lastIndexOf(before);
  const text = Text.of(source.split("\n"));
  const position = (at: number) => {
    const line = text.lineAt(at);
    return { line: line.number - 1, character: at - line.from };
  };
  const edited = source.slice(0, offset) + after + source.slice(offset + before.length);
  let tokens = 0;
  const startsWith = String.prototype.startsWith;
  const spy = vi.spyOn(String.prototype, "startsWith").mockImplementation(function (this: string, search: string, at?: number) {
    if (search === "--" && this.length === edited.length) tokens++;
    return startsWith.call(this, search, at);
  });
  try {
    registry.update({ textDocument: { uri, version: 2 }, contentChanges: [{
      range: { start: position(offset), end: position(offset + before.length) }, text: after,
    }] });
  } finally {
    spy.mockRestore();
  }
  // The deliberate error is still reported after the edit.
  const hello = edited.lastIndexOf("Hello");
  expect(validations(registry, uri)).toContainEqual({
    from: hello, to: hello + 5, message: "Incomplete statement: expected assignment or a function call",
  });
  return { count, sourceUnits: edited.length, tokens };
}

test("an edit at the bottom of a long document lexes only near the edit", () => {
  const short = lexedOnEdit(20);
  const long = lexedOnEdit(400);
  console.log("validation window lexing", JSON.stringify({ short, long }));
  // The long document holds about twenty times the short one's tokens; the
  // tokens lexed on an edit at its bottom must not grow with it.
  expect(long.tokens).toBeLessThanOrEqual(short.tokens + 20);
  expect(long.tokens).toBeLessThan(200);
});
