// A name on a later line of a `local` list continued after a trailing comma
// is a value or a target depending on an EARLIER name's `=` (#1116). An edit
// that adds or removes that `=` reparses only its own line once the function
// has been edited before (the parser then has split points inside it), so
// the later name lies outside the reparsed range. The annotations must still
// equal a cold parse's: `SparkdownCombinedAnnotator.update` runs its window
// past the list's last bare name, and no further.
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it, vi } from "vitest";
import {
  SparkdownCombinedAnnotator,
  type SparkdownAnnotators,
} from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///value-list.sd";
const CHANNELS: (keyof SparkdownAnnotators)[] = ["declarations", "references", "semantics"];

let nextVersion = 2;

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(CHANNELS);
  registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return registry;
}

function snapshot(registry: SparkdownDocumentRegistry) {
  const annotations = registry.annotations(URI) as Record<string, any>;
  const out: string[] = [];
  for (const key of CHANNELS) {
    const iter = annotations[key]!.iter(0);
    while (iter.value) {
      out.push(`${key} ${iter.from}-${iter.to} ${JSON.stringify(iter.value.type)}`);
      iter.next();
    }
  }
  return out;
}

function reparsedTo(registry: SparkdownDocumentRegistry): number | null {
  const cached: any = registry.tree(URI)?.prop(cachedCompilerProp as any);
  return cached?.reparsedFrom == null ? null : (cached.reparsedTo as number);
}

function script(declaration: string) {
  const pad = (tag: string) =>
    Array.from({ length: 40 }, (_, i) => `  local ${tag}_${i} = ${i} + 1`);
  return [
    "function helper()",
    "end",
    "function f()",
    ...pad("pre"),
    ...declaration.split("\n").map((line) => `  ${line}`),
    "  helper()",
    ...pad("post"),
    "  return bb",
    "end",
    "",
  ].join("\n");
}

// Replaces the first `find` in the document with `replace`, incrementally.
function edit(registry: SparkdownDocumentRegistry, text: string, find: string, replace: string) {
  const from = text.indexOf(find);
  expect(from, `"${find}" is in the document`).toBeGreaterThanOrEqual(0);
  const to = from + find.length;
  registry.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [{ range: { start: posAt(text, from), end: posAt(text, to) }, text: replace }],
  });
  return text.slice(0, from) + replace + text.slice(to);
}

describe("a continued local list after an incremental edit to its `=`", () => {
  it.each([
    ["gaining its `=`", "local aa, bb == 1,\n  helper", "bb ==", "bb ="],
    ["losing its `=`", "local aa, bb = 1,\n  helper", "bb =", "bb =="],
    ["three lines, gaining its `=`", "local aa, bb == 1,\n  2,\n  helper", "bb ==", "bb ="],
    ["gaining its `=` before a name with its own", "local aa, bb == 1,\n  helper = 2", "bb ==", "bb ="],
  ])("annotates a later-line name as a cold parse does when %s", (_, declaration, find, replace) => {
    let text = script(declaration);
    const incremental = open(text);
    // A first edit inside the function gives the parser split points there.
    text = edit(incremental, text, "pre_10 = 10 + 1", "pre_10 = 10 +  1");
    text = edit(incremental, text, find, replace);

    const cold = open(text);
    expect(incremental.tree(URI)!.toString()).toBe(cold.tree(URI)!.toString());
    // Non-vacuity: the parser's reparsed range stops before the later-line
    // name, so only the widened window re-annotates it.
    const name = text.indexOf("helper", text.indexOf(replace));
    expect(reparsedTo(incremental)).not.toBeNull();
    expect(reparsedTo(incremental)!).toBeLessThan(name);
    expect(snapshot(incremental)).toEqual(snapshot(cold));
  });
});

// The window the annotators re-run over after each edit.
function annotatedWindows(run: () => void): (number | undefined)[] {
  const spy = vi.spyOn(SparkdownCombinedAnnotator.prototype as any, "reannotate");
  try {
    run();
    // Only the edit's own window maps the carried annotations through it.
    return spy.mock.calls.filter((args) => args[6] != null).map((args) => args[2] as number | undefined);
  } finally {
    spy.mockRestore();
  }
}

describe("the re-annotation window after an edit inside a declaration", () => {
  it("runs past a continued list's later-line name", () => {
    let text = script("local aa, bb == 1,\n  helper");
    const registry = open(text);
    text = edit(registry, text, "pre_10 = 10 + 1", "pre_10 = 10 +  1");
    const windows = annotatedWindows(() => {
      text = edit(registry, text, "bb ==", "bb =");
    });
    const name = text.indexOf("helper", text.indexOf("bb ="));
    expect(windows).toHaveLength(1);
    expect(windows[0]!).toBeGreaterThanOrEqual(name + "helper".length);
    expect(windows[0]!).toBeLessThan(text.indexOf("helper()", name));
  });

  // An edit inside a value changes no `=` and no name in the list, so the
  // window stays the reparsed range even when a name follows the value.
  it.each([
    ["a table", "local t = {", "}"],
    ["a closure", "local g = function()", "end"],
    ["a table followed by a name", "local t, u = {", "}, helper"],
    ["a closure followed by a name", "local g, h = function()", "end, helper"],
  ])("stops at the reparsed range inside %s value", (_, first, last) => {
    const comma = first.endsWith("{") ? "," : "";
    const rows = Array.from({ length: 200 }, (_, i) => `  row_${i} = ${i} + 1${comma}`);
    let text = script([first, ...rows, last].join("\n"));
    const registry = open(text);
    text = edit(registry, text, "row_10 = 10 + 1", "row_10 = 10 +  1");
    const windows = annotatedWindows(() => {
      text = edit(registry, text, "row_100 = 100 + 1", "row_100 = 100 +  1");
    });
    expect(windows).toEqual([reparsedTo(registry)]);
    expect(windows[0]!).toBeLessThan(text.indexOf("row_101"));
    expect(snapshot(registry)).toEqual(snapshot(open(text)));
  });
});
