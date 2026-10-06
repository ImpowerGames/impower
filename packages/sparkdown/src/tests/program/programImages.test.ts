// Images of the program engine's state (#699, docs/engine/binary-program.md,
// section 7): a capture holds the positional state whole and, past a
// keyframe, only the keyed state the write barrier marked since the capture
// before it, and a restore puts an earlier image back in place.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { lastSearchStats, planRoute } from "../../compiler/utils/planRoute";
import type { Story } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";
import {
  MAX_DELTA_DEPTH,
  ProgramImages,
  imageDigest,
} from "../../program/ProgramImages";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { countIdOf } from "../../program/ProgramSymbols";
import { chunkId } from "../../program/StatementChunk";
import { compileScript, programSession, rootChunks } from "./programHarness";

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

/** An engine on `root` that shares the pristine copies of `images`, as the
 *  engine a game builds for each program shares those of the one before. */
const sharing = (root: ProgramRoot, images?: ProgramImages) =>
  new ProgramStory(root, null, { images });

describe("a checkpoint within a session", () => {
  const TEXT = [
    "store seen = 0",
    "",
    "-> start",
    "",
    "scene start",
    "  One.",
    "  & seen = seen + 1",
    "  Two {seen}.",
    "  Three {start}.",
    "  Four.",
    "end",
    "",
  ].join("\n");

  it("taken before a compile, loads after it for every statement that was not emitted again, for an edit above and below it", () => {
    for (const [before, after, shown] of [
      // Above the checkpoint.
      ["  One.", "  Zero.\n  One.", ["Three 1.", "Four."]],
      // Below it.
      ["  Four.", "  Four.\n  Five.", ["Three 1.", "Four.", "Five."]],
    ] as const) {
      const s = programSession(TEXT);
      const game = sharing(s.root);
      expect(next(game, 2)).toEqual(["One.", "Two 1."]);
      const checkpoint = game.captureBeat();
      const edited = s.edit(before, after);
      const resumed = sharing(edited, game.images);
      expect(resumed.restore(checkpoint)).toBe(true);
      expect(next(resumed, 10)).toEqual(shown);
    }
  });

  it("whose position names a chunk the root no longer holds is reported unplaced and never run", () => {
    const s = programSession(TEXT);
    const game = sharing(s.root);
    expect(next(game, 2)).toEqual(["One.", "Two 1."]);
    // The position rests at the start of the statement after the beat.
    const checkpoint = game.captureBeat();
    const edited = s.edit("  Three {start}.", "  Three again {start}.");
    const resumed = sharing(edited, game.images);
    const before = resumed.state.toJson();
    const steps = resumed.stepCount;
    expect(resumed.restore(checkpoint)).toBe(false);
    expect(resumed.state.toJson()).toBe(before);
    expect(resumed.stepCount).toBe(steps);
  });
});

describe("a reseed of the program table", () => {
  const TEXT = [
    "scene early",
    "  Early.",
    "end",
    "",
    "store target = -> there",
    "",
    "-> here",
    "",
    "scene here",
    '  Here {here} {cycle|"a"|"b"}.',
    "  -> target",
    "end",
    "",
    "scene there",
    "  There {there} {here}.",
    "end",
    "",
  ].join("\n");

  it("leaves a running game's counts and symbol values reading the same through the remap", () => {
    const s = programSession(TEXT);
    // `early` is gone before the reseed, which drops it, so the ids after it
    // move.
    const played = s.edit("scene early\n  Early.\nend\n\n", "");
    const game = sharing(played);
    expect(next(game, 10)).toEqual(["Here 1 a.", "There 1 1."]);
    expect(game.canContinue).toBe(false);
    const ended = game.capture();
    const counts = (story: ProgramStory, root: ProgramRoot) =>
      ["here", "there"].map((name) =>
        story.state.VisitCount(countIdOf(root.table, root.table.symbolIds.get(name)!)),
      );
    expect(counts(game, played)).toEqual([1, 1]);
    s.reseed();
    const reseeded = s.edit("  There {there}", "  There! {there}");
    expect(reseeded.generation).toBe(played.generation + 1);
    for (const name of ["here", "there"]) {
      expect(reseeded.table.symbolIds.get(name)).not.toBe(
        played.table.symbolIds.get(name),
      );
    }
    // The game on its own root reads its counts as it did.
    expect(counts(game, played)).toEqual([1, 1]);
    // An image of the ended game, which names no chunk, restores into an
    // engine on the reseeded root with its counts and symbol values taken
    // through the remap.
    const after = sharing(reseeded, game.images);
    expect(after.restore(ended)).toBe(true);
    expect(counts(after, reseeded)).toEqual([1, 1]);
    const target = after.variablesState.GetVariableWithName("target");
    after.ChoosePathString("here", true);
    expect(next(after, 10)).toEqual(["Here 2 b.", "There! 2 2."]);
    expect(after.variablesState.GetVariableWithName("target")).toBe(target);
  });

  it("gives no chunk id again, and no sequence id to another body, so a checkpoint from before it is reported unplaced", () => {
    const s = programSession(TEXT.replace("scene early\n  Early.\nend\n\n", ""));
    const game = sharing(s.root);
    expect(next(game, 1)).toEqual(["Here 1 a."]);
    const checkpoint = game.captureBeat();
    s.reseed();
    const reseeded = s.edit("  There {there}", "  There! {there}");
    const chunks = (root: ProgramRoot) => rootChunks(root).map(chunkId);
    expect(Math.min(...chunks(reseeded))).toBeGreaterThan(Math.max(...chunks(s.root)));
    // A sequence id goes on naming the body it named: a flow's sequence
    // keeps its id across the cold compile (section 1).
    const body = (root: ProgramRoot, id: number) => {
      const row = root.sequence(id)!;
      return `${row.flow >= 0 ? root.table.symbols[row.flow] : row.uri}:${row.block}`;
    };
    for (const row of reseeded.sequences()) {
      if (s.root.sequence(row.id)) {
        expect(body(reseeded, row.id)).toBe(body(s.root, row.id));
      }
    }
    const resumed = sharing(reseeded, game.images);
    const before = resumed.state.toJson();
    expect(resumed.restore(checkpoint)).toBe(false);
    expect(resumed.state.toJson()).toBe(before);
  });
});

describe("a route search on the program engine", () => {
  // Decisions whose branches meet again, a table written in one of them, a
  // menu and a decision after it: a search that finds no target goes
  // everywhere, and a fork site reached twice in the same state is
  // expanded once.
  const BRANCHES = [
    "store a = 0",
    "store t = { x = 0 }",
    "",
    "-> start",
    "",
    "scene start",
    "  Begin.",
    "  if a == 0 then",
    "    & t.x = t.x + 1",
    "    Left.",
    "  else",
    "    Right.",
    "  end",
    "  if t.x > 0 then",
    "    Up.",
    "  else",
    "    Down.",
    "  end",
    "  choose",
    "    * [one]",
    "      & a = a + 1",
    "    * [two]",
    "  end",
    "  if a > 0 then",
    "    More.",
    "  end",
    "  if t.x == 1 then",
    "    Same.",
    "  end",
    "  End.",
    "end",
    "",
  ].join("\n");

  it("forks images that are deltas, and expands the nodes the JSON round trip expands", () => {
    const root = compileScript(BRANCHES, { programChunks: true }).program.chunks!;
    const search = (stateImages: boolean) => {
      const story = new ProgramStory(root);
      const before = { ...story.images.stats };
      const plan = planRoute(story as unknown as Story, "start", "nowhere", {
        stateImages,
        maxNodes: 2000,
      });
      const stats = story.images.stats;
      return {
        plan,
        search: { ...lastSearchStats, errors: lastSearchStats.errors.length },
        keyframes: stats.keyframes - before.keyframes,
        deltas: stats.deltas - before.deltas,
        globals: stats.globals - before.globals,
        restores: stats.restores - before.restores,
        wholeRestores: stats.wholeRestores - before.wholeRestores,
        globalsInProgram: story.variablesState.globalEntries.size,
      };
    };
    const json = search(false);
    const images = search(true);
    expect(json.plan).toBeNull();
    expect(images.plan).toBeNull();
    expect(json.search.endReason).toBe("exhausted");
    expect(images.search).toEqual(json.search);
    expect(json.search.nodesExpanded).toBeGreaterThan(5);
    expect(json.search.forkSitesSkipped).toBeGreaterThan(0);
    expect(json.keyframes + json.deltas).toBe(0);
    // One keyframe where the search starts, and every fork a delta.
    expect(images.keyframes).toBe(1);
    expect(images.deltas).toBeGreaterThan(5);
    // A delta copies the globals its run assigned, never all of them.
    expect(images.globals - images.globalsInProgram).toBeLessThan(images.deltas);
    expect(images.restores).toBe(images.search.nodesExpanded);
    // Every node restores by what changed since the image it forked from.
    expect(images.wholeRestores).toBe(0);
  });
});

describe("images along a long run", () => {
  it("restore any earlier image as it was, across the keyframe a long chain takes", () => {
    const s = story(WRITES.replace("if hits < 3 then", "if hits < 40 then"));
    const taken: { image: ReturnType<ProgramStory["capture"]>; json: string }[] = [];
    while (s.canContinue) {
      s.Continue();
      taken.push({ image: s.capture(), json: s.state.toJson() });
    }
    // More images than a chain holds, so that the run took a keyframe on its
    // own after the first.
    expect(taken.length).toBeGreaterThan(MAX_DELTA_DEPTH + 10);
    const keyframes = taken.filter(({ image }) => image.keyframe === image);
    expect(keyframes.length).toBeGreaterThan(1);
    // A keyframe keeps nothing before it alive.
    for (const { image } of keyframes) expect(image.parent).toBeNull();
    // Each restored out of order, so that none is the image the state was
    // last restored from or taken at.
    const order = taken.map((_, i) => (i * 37) % taken.length);
    for (const i of order) {
      expect(s.restore(taken[i]!.image)).toBe(true);
      expect(s.state.toJson()).toBe(taken[i]!.json);
    }
  });
});

// Round 1 of the review of #1579 (report 6016969769).
describe("the digest and restores a route search reads", () => {
  // Two tables that hold the same, and a decision that writes one or the
  // other: the two arrivals at the line after it differ only in which.
  const TWO_TABLES = [
    "store a = { x = 0 }",
    "store b = { x = 0 }",
    "store pick = 0",
    "",
    "-> start",
    "",
    "scene start",
    "  Begin.",
    "  if pick == 0 then",
    "    & a.x = 1",
    "  else",
    "    & b.x = 1",
    "  end",
    "  Same {a.x + b.x}.",
    "  Then {a.x}.",
    "end",
    "",
  ].join("\n");

  // A route simulator that forces every decision to `verdict`.
  const forcing = (verdict: boolean) => ({
    forceCondition: () => verdict,
    forceChoice: () => null,
    willForceCondition: () => true,
    willForceChoice: () => false,
    saveSnapshot: () => ({ conditionPointer: {}, choicePointer: {} }),
  });

  it("reads a table the keyframe reached by its identity, so two arrivals that wrote two tables apart differ", () => {
    const s = story(TWO_TABLES);
    expect(next(s, 1)).toEqual(["Begin."]);
    const keyframe = s.capture(true);
    const arrive = (verdict: boolean) => {
      expect(s.restore(keyframe)).toBe(true);
      s.simulator = forcing(verdict);
      expect(next(s, 1)).toEqual(["Same 1."]);
      s.simulator = null;
      return imageDigest(s.capture());
    };
    const left = arrive(true);
    const right = arrive(false);
    expect(right).not.toBe(left);
    // The same arrival reads the same.
    expect(arrive(true)).toBe(left);
    // And they do differ: the next line reads `a.x`.
    arrive(false);
    expect(next(s, 1)).toEqual(["Then 0."]);
  });

  it("restores a sibling's fork from a descendant of it by what changed between them, never whole", () => {
    const s = story(WRITES);
    const stats = s.images.stats;
    expect(next(s, 1)).toEqual(["First 3 0."]);
    const fork = s.capture(true);
    const json = s.state.toJson();
    const before = stats.wholeRestores;
    for (let i = 0; i < 3; i += 1) {
      expect(s.restore(fork)).toBe(true);
      expect(s.state.toJson()).toBe(json);
      next(s, 2);
      s.capture();
      next(s, 1);
      s.capture();
    }
    expect(s.restore(fork)).toBe(true);
    expect(s.state.toJson()).toBe(json);
    expect(stats.wholeRestores).toBe(before);
  });

  it("restores a fork across the keyframe a long run took after it by what changed since, never whole", () => {
    const s = story(WRITES.replace("if hits < 3 then", "if hits < 40 then"));
    const stats = s.images.stats;
    expect(next(s, 1)).toEqual(["First 3 0."]);
    const fork = s.capture();
    const json = s.state.toJson();
    const keyframes = stats.keyframes;
    const before = stats.wholeRestores;
    while (stats.keyframes === keyframes && s.canContinue) {
      next(s, 1);
      s.capture();
    }
    // The run took a keyframe of its own on top of the fork's chain.
    expect(stats.keyframes).toBe(keyframes + 1);
    next(s, 2);
    s.capture();
    expect(s.restore(fork)).toBe(true);
    expect(s.state.toJson()).toBe(json);
    expect(stats.wholeRestores).toBe(before);
  });
});

// Round 1 of the review of #1579 (report 6017530237).
describe("images across engines, aliases and keyframes", () => {
  it("takes a keyframe after restoring an image of an older table generation, so the counts it remapped stay remapped", () => {
    const text = [
      "scene early",
      "  Early.",
      "end",
      "",
      "-> here",
      "",
      "scene here",
      "  Here {here}.",
      "end",
      "",
    ].join("\n");
    const s = programSession(text);
    const played = s.edit("scene early\n  Early.\nend\n\n", "");
    const game = sharing(played);
    expect(next(game, 10)).toEqual(["Here 1."]);
    const ended = game.capture();
    s.reseed();
    const reseeded = s.edit("  Here {here}.", "  Here! {here}.");
    expect(reseeded.table.symbolIds.get("here")).not.toBe(
      played.table.symbolIds.get("here"),
    );
    const after = sharing(reseeded, game.images);
    expect(after.restore(ended)).toBe(true);
    const visits = () =>
      after.state.VisitCount(
        countIdOf(reseeded.table, reseeded.table.symbolIds.get("here")!),
      );
    expect(visits()).toBe(1);
    const mark = after.capture();
    expect(mark.keyframe).toBe(mark);
    after.ChoosePathString("here", true);
    expect(next(after, 10)).toEqual(["Here! 2."]);
    expect(visits()).toBe(2);
    expect(after.restore(mark)).toBe(true);
    expect(visits()).toBe(1);
  });

  it("reads one table two globals hold apart from two tables that hold the same, both made since the keyframe", () => {
    const text = [
      "store a = nil",
      "store b = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  Begin.",
      "  if true then",
      "    & a = { x = 0 }",
      "    & b = a",
      "  else",
      "    & a = { x = 0 }",
      "    & b = { x = 0 }",
      "  end",
      "  Same.",
      "  & a.x = 1",
      "  Then {b.x}.",
      "end",
      "",
    ].join("\n");
    const forcing = (verdict: boolean) => ({
      forceCondition: () => verdict,
      forceChoice: () => null,
      willForceCondition: () => true,
      willForceChoice: () => false,
      saveSnapshot: () => ({ conditionPointer: {}, choicePointer: {} }),
    });
    const s = story(text);
    expect(next(s, 1)).toEqual(["Begin."]);
    const keyframe = s.capture(true);
    const arrive = (verdict: boolean) => {
      expect(s.restore(keyframe)).toBe(true);
      s.simulator = forcing(verdict);
      expect(next(s, 1)).toEqual(["Same."]);
      s.simulator = null;
      return imageDigest(s.capture());
    };
    const shared = arrive(true);
    expect(next(s, 1)).toEqual(["Then 1."]);
    const apart = arrive(false);
    expect(next(s, 1)).toEqual(["Then 0."]);
    expect(apart).not.toBe(shared);
    expect(arrive(true)).toBe(shared);
  });

  it("restores forward across a keyframe the run took, by the keys written between, never whole", () => {
    const s = story(WRITES.replace("if hits < 3 then", "if hits < 40 then"));
    const stats = s.images.stats;
    expect(next(s, 1)).toEqual(["First 3 0."]);
    // The first image is a keyframe; the chain grows from the next.
    expect(s.capture().depth).toBe(0);
    let before = s.capture();
    expect(before.depth).toBe(1);
    let after = before;
    while (after.keyframe !== after) {
      before = after;
      next(s, 1);
      after = s.capture();
    }
    const json = s.state.toJson();
    const whole = stats.wholeRestores;
    expect(s.restore(before)).toBe(true);
    expect(s.restore(after)).toBe(true);
    expect(s.state.toJson()).toBe(json);
    expect(stats.wholeRestores).toBe(whole);
  });
});
