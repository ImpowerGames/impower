import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { lexLuauDocumentForTesting, luauPositionOffset, nextLuauToken, noteLuauDocumentEdit } from "../../compiler/typecheck/readLuauAst";

const forget = () => {
  luauPositionOffset({ line: 0, column: 0 } as never, "");
  nextLuauToken(0, "");
};

const block = (i: number) =>
  `function f${i}()\n  local x${i} = ${i} -- note ${i}\n  return x${i}\nend\n\nThe hero walks on, ${i} steps.\n\n`;

const tail = "function g(t)\n  local y = t.\n  Hello\nend\n\nThe hero stops.\n";

const ANNOTATE = ["compilations", "validations"] as const;

function position(source: string, at: number) {
  const line = Text.of(source.split("\n")).lineAt(at);
  return { line: line.number - 1, character: at - line.from };
}

function validations(registry: SparkdownDocumentRegistry, uri: string) {
  const found: { from: number; to: number; message: string }[] = [];
  const iter = registry.annotations(uri)!.validations.iter(0);
  while (iter.value) {
    found.push({ from: iter.from, to: iter.to, message: iter.value.type.message ?? "" });
    iter.next();
  }
  return found;
}

function slicesOnEdit(count: number) {
  const uri = `inmemory:///edit-range-readers-${count}.sd`;
  const source = Array.from({ length: count }, (_, i) => block(i)).join("") + tail;
  const registry = new SparkdownDocumentRegistry([...ANNOTATE]);
  forget();
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const before = "The hero stops.";
  const after = "The hero stops here.";
  const offset = source.lastIndexOf(before);
  const edited = source.slice(0, offset) + after + source.slice(offset + before.length);
  let slices = 0;
  const slice = String.prototype.slice;
  const spy = vi.spyOn(String.prototype, "slice").mockImplementation(function (this: string, start?: number, end?: number) {
    if (this.length === edited.length || this.length === source.length) slices++;
    return slice.call(this, start, end);
  });
  try {
    registry.update({ textDocument: { uri, version: 2 }, contentChanges: [{
      range: { start: position(source, offset), end: position(source, offset + before.length) }, text: after,
    }] });
  } finally {
    spy.mockRestore();
  }
  const dot = edited.lastIndexOf("t.") + 1;
  expect(validations(registry, uri)).toContainEqual({
    from: dot, to: dot + 1, message: expect.stringMatching(/^Expected identifier after '\.' on the same line/),
  });
  return { count, sourceUnits: edited.length, slices };
}

test("an edit at the bottom of a long document does not compare it with the document before", () => {
  const short = slicesOnEdit(20);
  const long = slicesOnEdit(400);
  console.log("document slices on an edit", JSON.stringify({ short, long }));
  expect(long.slices).toBeLessThanOrEqual(short.slices + 4);
});

function readings(text: string, probes: readonly number[]) {
  const lines = text.split("\n").length;
  return {
    starts: Array.from({ length: lines + 1 }, (_, line) => luauPositionOffset({ line, column: 0 } as never, text)),
    tokens: probes.map((from) => nextLuauToken(from, text)),
  };
}

function fresh(text: string, probes: readonly number[]) {
  const tokens = lexLuauDocumentForTesting(text);
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const lines = text.split("\n").length;
  return {
    starts: Array.from({ length: lines + 1 }, (_, line) => starts[line] ?? text.length),
    tokens: probes.map((from) => {
      const token = tokens.find((candidate) => candidate.from >= from);
      if (!token || token.kind === "eof") return null;
      return { text: token.kind === "name" || token.kind === "keyword" ? token.text : token.text[0], from: token.from };
    }),
  };
}

type Edit = { from: number; to: number; insert: string };

const SHAPES: [string, (source: string) => Edit[] | "replace"][] = [
  ["inserting lines above a Luau block", (s) => [{ from: s.indexOf("function f3"), to: s.indexOf("function f3"), insert: "\n\nThe hero waits.\n" }]],
  ["removing lines above a Luau block", (s) => [{ from: s.indexOf("The hero walks on, 2"), to: s.indexOf("function f3"), insert: "" }]],
  ["merging two lines", (s) => [{ from: s.indexOf("\n  return x5"), to: s.indexOf("\n  return x5") + 3, insert: " " }]],
  ["splitting a line", (s) => [{ from: s.indexOf("= 7 --"), to: s.indexOf("= 7 --") + 1, insert: "=\n   " }]],
  ["an edit at the document's start", () => [{ from: 0, to: 0, insert: "-- top\n" }]],
  ["an edit at the document's end", (s) => [{ from: s.length, to: s.length, insert: "local tail = 1\n" }]],
  ["an edit opening a long comment", (s) => [{ from: s.indexOf("-- note 4"), to: s.indexOf("-- note 4") + 2, insert: "--[[" }]],
  ["several changes in one event", (s) => {
    const first = s.indexOf("function f6");
    const second = s.indexOf("-- note 2");
    return [
      { from: first, to: first, insert: "local a = 1\nlocal b = 2\n" },
      { from: second, to: second + "-- note 2".length, insert: "--[==[ x\n]==]" },
      { from: 3, to: 9, insert: "" },
    ];
  }],
  ["a whole-document replacement", () => "replace"],
];

test.each(SHAPES)("after %s the readers give a fresh read's positions and tokens", (_, shape) => {
  const uri = "inmemory:///edit-range-readers-shapes.sd";
  const source = Array.from({ length: 12 }, (_, i) => block(i)).join("") + tail;
  const registry = new SparkdownDocumentRegistry([...ANNOTATE]);
  forget();
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const probesBefore = Array.from({ length: 16 }, (_, i) => Math.floor((source.length * i) / 16));
  expect(readings(source, probesBefore)).toEqual(fresh(source, probesBefore));
  const edits = shape(source);
  let edited = source;
  const contentChanges: TextDocumentContentChangeEvent[] = [];
  if (edits === "replace") {
    edited = source.replace(/hero/g, "heroine");
    contentChanges.push({ text: edited });
  } else {
    for (const { from, to, insert } of edits) {
      contentChanges.push({ range: { start: position(edited, from), end: position(edited, to) }, text: insert });
      edited = edited.slice(0, from) + insert + edited.slice(to);
    }
  }
  registry.update({ textDocument: { uri, version: 2 }, contentChanges });
  expect(registry.get(uri)!.getText()).toBe(edited);
  const probes = Array.from({ length: 24 }, (_, i) => Math.floor((edited.length * i) / 24)).concat(edited.length);
  expect(readings(edited, probes)).toEqual(fresh(edited, probes));
});

function applyEdit(registry: SparkdownDocumentRegistry, uri: string, version: number, source: string, { from, to, insert }: Edit) {
  registry.update({ textDocument: { uri, version }, contentChanges: [{
    range: { start: position(source, from), end: position(source, to) }, text: insert,
  }] });
  return source.slice(0, from) + insert + source.slice(to);
}

test("two registries holding one document leave the readers a fresh read's positions and tokens", () => {
  const uri = "inmemory:///edit-range-readers-two.sd";
  let source = Array.from({ length: 12 }, (_, i) => block(i)).join("") + tail;
  const first = new SparkdownDocumentRegistry([...ANNOTATE]);
  const second = new SparkdownDocumentRegistry([...ANNOTATE]);
  forget();
  for (const registry of [first, second]) {
    registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  }
  const edits: ((s: string) => Edit)[] = [
    (s) => ({ from: s.indexOf("function f3"), to: s.indexOf("function f3"), insert: "\n\nThe hero waits.\n" }),
    (s) => ({ from: s.indexOf("-- note 8"), to: s.indexOf("-- note 8") + 2, insert: "--[[" }),
    (s) => ({ from: s.indexOf("The hero walks on, 1 steps"), to: s.indexOf("function f2"), insert: "" }),
    (s) => ({ from: s.length, to: s.length, insert: "local tail = 1\n" }),
  ];
  edits.forEach((edit, i) => {
    const change = edit(source);
    const edited = applyEdit(first, uri, i + 2, source, change);
    applyEdit(second, uri, i + 2, source, change);
    source = edited;
    const probes = Array.from({ length: 24 }, (_, p) => Math.floor((source.length * p) / 24)).concat(source.length);
    expect(readings(source, probes), `after edit ${i}`).toEqual(fresh(source, probes));
  });
});

test("an edit after a deferred set leaves the readers a fresh read's positions and tokens", () => {
  const uri = "inmemory:///edit-range-readers-deferred.sd";
  const source = Array.from({ length: 12 }, (_, i) => block(i)).join("") + tail;
  const registry = new SparkdownDocumentRegistry([...ANNOTATE]);
  forget();
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const replaced = source.replace("function f5", "\n\nfunction f5");
  registry.set({ textDocument: { uri, text: replaced, version: 2, languageId: "sparkdown" } }, { defer: true });
  let text = applyEdit(registry, uri, 3, replaced, { from: 0, to: 0, insert: "-- top\n" });
  text = applyEdit(registry, uri, 4, text, { from: text.indexOf("return x9"), to: text.indexOf("return x9"), insert: "\n" });
  expect(registry.get(uri)!.getText()).toBe(text);
  const probes = Array.from({ length: 24 }, (_, p) => Math.floor((text.length * p) / 24)).concat(text.length);
  expect(readings(text, probes)).toEqual(fresh(text, probes));
});

test("a reader several edits behind carries what it read through all of them", () => {
  const lines = 2000;
  let text = `${"local a = 1\n".repeat(lines)}local x = value\n`;
  const probes = (t: string) => [t.length - 20, t.length - 4, 30];
  forget();
  readings(text, probes(text));
  const steps: Edit[] = [
    { from: 60, to: 60, insert: "\n\n" },
    { from: 6, to: 1, insert: "other\n" },
    { from: 40, to: 28, insert: "" },
    { from: 50, to: 49, insert: "--[[ x ]]" },
  ];
  for (const step of steps) {
    const from = text.length - step.from;
    const to = text.length - step.to;
    const insert = step.insert;
    const before = text;
    text = text.slice(0, from) + insert + text.slice(to);
    noteLuauDocumentEdit(before, text, from, to, from + insert.length);
  }
  let scans = 0;
  const indexOf = String.prototype.indexOf;
  const spy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search: string, position?: number) {
    if (search === "\n" && this.length === text.length) scans++;
    return indexOf.call(this, search, position);
  });
  let found: ReturnType<typeof readings>;
  try {
    found = readings(text, probes(text));
  } finally {
    spy.mockRestore();
  }
  expect(scans).toBeLessThan(lines / 10);
  expect(found).toEqual(fresh(text, probes(text)));
});

test("an edit to another document between two reads makes the next read a fresh one", () => {
  const text = "local a = 1\nlocal b = 2\n";
  const edited = "local a = 1\n\nlocal b = 2\n";
  const probes = [0, 13, 20];
  forget();
  readings(text, probes);
  noteLuauDocumentEdit("other\n", "other text\n", 5, 5, 10);
  expect(readings(edited, probes)).toEqual(fresh(edited, probes));
});

test("the readers take the edit's range as noted, without checking it against the texts", () => {
  const before = "local a = 1\nlocal b = 2\nlocal c = 3\n";
  const after = "local a = 1\n\n\nlocal b = 2\nlocal c = 3\n";
  const probes = [0, after.indexOf("b"), after.indexOf("c")];
  forget();
  readings(before, probes);
  noteLuauDocumentEdit(before, after, before.length - 2, before.length, after.length);
  expect(readings(after, probes)).not.toEqual(fresh(after, probes));
  forget();
  readings(before, probes);
  noteLuauDocumentEdit(before, after, 12, 12, 14);
  expect(readings(after, probes)).toEqual(fresh(after, probes));
});
