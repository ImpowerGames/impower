// Images of the program engine's state (#699, docs/engine/binary-program.md,
// section 7): a capture holds the positional state whole and, past a
// keyframe, only the keyed state the write barrier marked since the capture
// before it, and a restore puts an earlier image back in place.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { ObjectValue } from "../../inkjs/engine/Value";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript } from "./programHarness";

const story = (text: string) =>
  new ProgramStory(compileScript(text, { programChunks: true }).program.chunks!);

/** The text of the next `count` beats. */
const next = (s: ProgramStory, count: number): string[] => {
  const out: string[] = [];
  while (out.length < count && s.canContinue) {
    const text = s.Continue() ?? "";
    if (text.trim()) {
      out.push(text.trim());
    }
  }
  return out;
};

const global = (s: ProgramStory, name: string) =>
  s.variablesState.GetVariableWithName(name);

describe("random draws read the state an image holds", () => {
  const RANDOM = [
    "store pool = { \"a\", \"b\", \"c\", \"d\", \"e\", \"f\", \"g\", \"h\", \"i\", \"j\" }",
    "",
    "-> start",
    "",
    "scene start",
    "  First.",
    ...Array.from({ length: 6 }, (_, i) => [
      `  Number {math.random(1, 1000)} pick {pool:random()} ${i}.`,
      `  Shuffle {shuffle|"one"|"two"|"three"|"four"|"five"|"six"} ${i}.`,
    ]).flat(),
    "end",
    "",
  ].join("\n");

  it("draws again what it drew after a saved state is loaded back", () => {
    const s = story(RANDOM);
    expect(next(s, 1)).toEqual(["First."]);
    const saved = s.state.toJson();
    const first = next(s, 12);
    s.state.LoadJson(saved);
    expect(next(s, 12)).toEqual(first);
  });

  it("draws again what it drew from math.random, a shuffle and table:random() after an earlier beat's image is restored", () => {
    const s = story(RANDOM);
    expect(next(s, 1)).toEqual(["First."]);
    const image = s.capture();
    const first = next(s, 12);
    expect(new Set(first.filter((t) => t.startsWith("Number"))).size).toBe(6);
    expect(s.restore(image)).toBe(true);
    expect(next(s, 12)).toEqual(first);
    expect(s.restore(image)).toBe(true);
    expect(next(s, 12)).toEqual(first);
  });
});

describe("a save shares a closed cell between the closures that share it", () => {
  it("keeps the captured value and the sharing across a save", () => {
    const text = [
      "store inc = nil",
      "store get = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  & local function make()",
      "  &   local n = 10",
      "  &   inc = function() n = n + 1 end",
      "  &   get = function() return n end",
      "  & end",
      "  & make()",
      "  & inc()",
      "  Got {get()}.",
      "  & inc()",
      "  After {get()}.",
      "end",
      "",
    ].join("\n");
    const s = story(text);
    expect(next(s, 1)).toEqual(["Got 11."]);
    const saved = s.state.toJson();
    const loaded = story(text);
    loaded.state.LoadJson(saved);
    expect(next(loaded, 1)).toEqual(["After 12."]);
  });
});

// A scene whose beats write tables in every way the barrier hears of: a
// store, a builtin that writes in place, a metatable, a freeze, a clear and
// the length hint `#` leaves, with a table two globals refer to, a closed
// cell two closures share, counts and globals.
const WRITES = [
  "store shared = { 1, 2, 3 }",
  "store other = nil",
  "store late = { x = 1 }",
  "store meta = { kind = \"meta\" }",
  "store frozen = { 1 }",
  "store cleared = { 1, 2, 3, 4 }",
  "store hits = 0",
  "store bump = nil",
  "store peek = nil",
  "",
  "-> start",
  "",
  "scene start",
  "  & other = shared",
  "  & local function cell()",
  "  &   local n = 0",
  "  &   bump = function() n = n + 1 end",
  "  &   peek = function() return n end",
  "  & end",
  "  & cell()",
  "  First {#shared} {peek()}.",
  "  label again",
  "  & hits = hits + 1",
  "  & table.insert(shared, hits)",
  "  & bump()",
  "  Pass {hits} {#other} {peek()}.",
  "  & shared.extra = hits",
  "  & late.x = late.x + 1",
  "  & setmetatable(meta, { __index = shared })",
  "  if hits == 1 then",
  "    & table.freeze(frozen)",
  "  end",
  "  & table.clear(cleared)",
  "  Then {#cleared} {late.x} {meta[1]}.",
  "  if hits < 3 then",
  "    -> again",
  "  end",
  "  Done {hits} {peek()}.",
  "end",
  "",
].join("\n");

describe("a fork, a run and a restore", () => {
  it("leave the state identical to before, tables written through builtins included", () => {
    const s = story(WRITES);
    expect(next(s, 1)).toEqual(["First 3 0."]);
    s.capture();
    expect(next(s, 2)).toEqual(["Pass 1 4 1.", "Then 0 2 1."]);
    const before = s.state.toJson();
    const shared = global(s, "shared");
    const image = s.capture();
    const run = next(s, 20);
    expect(run.at(-1)).toBe("Done 3 3.");
    expect(s.state.toJson()).not.toBe(before);
    expect(s.restore(image)).toBe(true);
    expect(s.state.toJson()).toBe(before);
    // In place: the table two globals refer to is the one it was.
    expect(global(s, "shared")).toBe(shared);
    expect(global(s, "other")).toBe(shared);
    // And the run continues as it ran.
    expect(next(s, 20)).toEqual(run);
  });

  it("puts back a table's frozen flag, metatable and length hints as the image had them", () => {
    const s = story(WRITES);
    expect(next(s, 1)).toEqual(["First 3 0."]);
    const image = s.capture();
    const meta = global(s, "meta") as ObjectValue;
    const frozen = global(s, "frozen") as ObjectValue;
    const cleared = global(s, "cleared") as ObjectValue;
    const hints = (t: ObjectValue) => {
      const map = t.value as any;
      return [map.__luauCapacity, map.__luauBoundary];
    };
    const clearedHints = hints(cleared);
    next(s, 2);
    expect(meta.metatable).not.toBeNull();
    expect(frozen.isFrozen).toBe(true);
    expect(cleared.value!.size).toBe(0);
    expect(hints(cleared)).not.toEqual(clearedHints);
    expect(s.restore(image)).toBe(true);
    expect(meta.metatable).toBeNull();
    expect(frozen.isFrozen).toBe(false);
    expect(cleared.value!.size).toBe(4);
    expect(hints(cleared)).toEqual(clearedHints);
    expect(global(s, "meta")).toBe(meta);
  });

  it("restores an image taken before a table's first write with its pristine content, in place", () => {
    const s = story(WRITES);
    // The image before any line ran: `shared` is as its declaration made it.
    const image = s.capture();
    const shared = global(s, "shared") as ObjectValue;
    const entries = [...shared.value!.entries()];
    next(s, 4);
    expect(global(s, "other")).toBe(shared);
    expect(shared.value!.size).toBeGreaterThan(entries.length);
    expect(s.restore(image)).toBe(true);
    expect(global(s, "shared")).toBe(shared);
    expect([...shared.value!.entries()]).toEqual(entries);
    // `other` was assigned after the image, so it holds what it held then;
    // the run assigns it the same table again.
    expect(global(s, "other")?.toString()).not.toBe(shared.toString());
    expect(next(s, 1)).toEqual(["First 3 0."]);
    expect(global(s, "other")).toBe(shared);
  });

  it("forks as a delta that holds the changed count ids, globals and tables only", () => {
    const s = story(WRITES);
    const stats = s.images.stats;
    expect(next(s, 1)).toEqual(["First 3 0."]);
    const keyframe = s.capture();
    expect(keyframe.keyframe).toBe(keyframe);
    expect(stats.keyframes).toBe(1);
    const globalsBefore = stats.globals;
    const countsBefore = stats.counts;
    expect(next(s, 1)).toEqual(["Pass 1 4 1."]);
    const fork = s.capture();
    expect(stats.keyframes).toBe(1);
    expect(stats.deltas).toBe(1);
    expect(fork.parent).toBe(keyframe);
    expect(fork.visits).toBeNull();
    // The counts the pass visited, and `hits` and nothing else assigned.
    const visited = [...s.state.visits.keys()].filter(
      (id) => s.state.visits[id] !== (keyframe.visits![id] ?? 0),
    );
    expect(visited.length).toBeGreaterThan(0);
    expect([...fork.countIds!].sort()).toEqual(visited.sort());
    expect([...fork.globals.keys()]).toEqual(["hits"]);
    expect([...fork.tables.keys()]).toEqual([global(s, "shared")]);
    expect(fork.cells.size).toBe(1);
    expect(stats.globals - globalsBefore).toBe(1);
    expect(stats.counts - countsBefore).toBe(visited.length);
    // Siblings fork from one image: a run restores it and forks again.
    expect(s.restore(fork)).toBe(true);
    const sibling = s.capture();
    expect(sibling.parent).toBe(fork);
    expect(sibling.globals.size).toBe(0);
    expect(sibling.tables.size).toBe(0);
    expect(stats.keyframes).toBe(1);
  });
});
