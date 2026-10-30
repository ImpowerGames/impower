import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { lexLuauDocumentForTesting, nextLuauToken, noteLuauDocumentEdit, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";

const forget = () => nextLuauToken(0, "");

test.each([
  ["a comment", "local x =\n  -- note\n  --[[ a long\n  comment ]]\n  value\n", "value"],
  ["a multiline string", "local x = [[\n  -- text\n]]\n  value\n", "value"],
  ["an unfinished long string", "local x = [==[\n  text ]] value\n", null],
  ["an unfinished long comment", "local x = --[[\n  value\n", null],
  ["the end of the document", "local x =\n  -- nothing after\n", null],
])("the next significant token after %s", (_, body, expected) => {
  const header = "local h = 1 -- header\n".repeat(10);
  const source = header + body;
  const from = header.length + body.indexOf("\n");
  for (const fresh of [true, false]) {
    if (fresh) forget();
    else {
      const before = source.slice(0, from) + "\n  other ]] -- [[\n";
      nextLuauToken(before.length, before);
      noteLuauDocumentEdit(before, source, from, before.length, source.length);
    }
    const token = nextLuauToken(from, source);
    expect(token).toEqual(expected == null ? null : { text: expected, from: source.lastIndexOf(expected) });
  }
});

function scansBelowComments(lines: number) {
  const head = `local x = 1\n${"-- note\n".repeat(lines)}`;
  const source = `${head}-- edit me\nvalue\n`;
  forget();
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
  let seed = 1724;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pieces = ["-", "[", "]", "=", "'", '"', "\n", " ", "x", "1", ".", "--", "[[", "]]", "--[==[", "]==]", "local y = ", "Hello there"];
  const trivia = (i: number) => `-- ${"a long comment ".repeat(6)}${i}\n\n${" ".repeat(70)}\n--[==[ ${"block ".repeat(14)}]==]\n`;
  let source = Array.from({ length: 40 }, (_, i) =>
    i % 4 === 0 ? `local v${i} = ${i} -- c${i}\n` : i % 4 === 1 ? `The hero's [[path]] ${i}.\n` : i % 4 === 2 ? `--[=[ long ${i}\n]=] x${i} = "s${i}"\n` : trivia(i)).join("");
  type Step = { source: string; probes: number[]; bound: number; found: unknown };
  const lookups = ({ source, probes, bound }: Omit<Step, "found">) => ({
    tokens: probes.map((from) => nextLuauToken(from, source)),
    expression: readLuauExpressionAfter(probes[0]!, source),
    bounded: readLuauExpressionAfter(probes[1]!, source, bound),
  });
  forget();
  const steps: Step[] = [];
  for (let step = 0; step < 200; step++) {
    const at = random(source.length + 1);
    const removed = random(4) === 0 ? random(8) : 0;
    const inserted = random(3) === 0 ? "" : pieces[random(pieces.length)]!;
    const before = source;
    source = source.slice(0, at) + inserted + source.slice(at + removed);
    noteLuauDocumentEdit(before, source, at, Math.min(at + removed, before.length), at + inserted.length);
    const probes = Array.from({ length: 6 }, (_, i) => i % 2 === 0 ? Math.min(source.length, at + random(80)) : random(source.length + 1));
    const bound = Math.min(source.length, probes[1]! + 40);
    steps.push({ source, probes, bound, found: lookups({ source, probes, bound }) });
  }
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

const tail = "function g(t)\n  local y = t.\n  Hello\nend\n\nThe hero stops.\n";

function validations(registry: SparkdownDocumentRegistry, uri: string) {
  const found: { from: number; to: number; message: string }[] = [];
  const iter = registry.annotations(uri)!.validations.iter(0);
  while (iter.value) {
    found.push({ from: iter.from, to: iter.to, message: iter.value.type.message ?? "" });
    iter.next();
  }
  return found;
}

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
  const dot = edited.lastIndexOf("t.") + 1;
  expect(validations(registry, uri)).toContainEqual({
    from: dot, to: dot + 1, message: expect.stringMatching(/^Expected identifier after '\.' on the same line/),
  });
  return { count, sourceUnits: edited.length, tokens };
}

test("an edit at the bottom of a long document lexes only near the edit", () => {
  const short = lexedOnEdit(20);
  const long = lexedOnEdit(400);
  console.log("validation window lexing", JSON.stringify({ short, long }));
  expect(long.tokens).toBeLessThanOrEqual(short.tokens + 20);
  expect(long.tokens).toBeLessThan(200);
});
