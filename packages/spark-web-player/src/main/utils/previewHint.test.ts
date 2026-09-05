// The page's cursor hint (#434): what it asks the cache for when the cursor
// lands, what it does not ask twice, and that its guess covers the cursor's
// own beat and stays inside the window it is issued with. The engine's gate
// is exact (it runs the beat); the hint is issued before anything can run.

import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";
import { type AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";
import { beatIndexIn } from "@impower/spark-engine/src/game/modules/assets/utils/previewWindow";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it } from "vitest";
import { resolveImageSrcs } from "./resolveImageSrcs";
import {
  applyPreviewHint,
  planPreviewHint,
  type PreviewHintCache,
  type PreviewHintState,
} from "./previewHint";

const URI = "file://proj/main.sd";

const asset = (name: string): File => ({
  uri: `file://proj/${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/proj/${name}.png?v=1`,
});

// Line numbers matter: `bunny` on line 3 and `hat` on line 5 each display
// alone, because line 4 displays between them; `cat` (line 10) and `dog`
// (line 12) likewise.
const STORY = `scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  Line two.
  [[show portrait hat]]
  Line three.
  Line three, continued.
  Line three, and more.
  Line three, at length.
  [[show portrait cat]]
  Line four.
  [[show portrait dog]]
  Line five.
  -> B
end

scene B
  [[show backdrop room2]]
  Line six.
  done
end
`;

// An SVG served through the service worker, its source not inlined: a
// filtered use of it resolves to a `?filters=` variant of this url.
const svg = (name: string): File => ({
  uri: `file://proj/${name}.svg`,
  type: "image",
  name,
  ext: "svg",
  src: `/file:/proj/${name}.svg?v=1`,
});

function compile(source: string, version = 1, extra: File[] = []): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    experimentalDisplayCalls: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version,
        languageId: "sparkdown",
      },
      ...["room", "room2", "bunny", "hat", "cat", "dog"].map(asset),
      ...extra,
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } } as any).program;
}

const entriesOf = (program: SparkProgram) =>
  Object.entries(program.pathLocations ?? {}) as Array<
    [string, [number, number, number, number, number]]
  >;

const srcs = (items: AssetItem[] | null) =>
  items?.map((i) => ("src" in i ? i.src : "")) ?? null;

/** The items the hint would make of these names, resolved as it resolves them. */
const items = (program: SparkProgram, names: string[]): AssetItem[] =>
  resolveImageSrcs(program.context, names).map((src) => ({
    kind: "image" as const,
    src,
  }));

const src = (name: string) => `/file:/proj/${name}.png?v=1`;

describe("planPreviewHint", () => {
  const program = compile(STORY);
  const entries = entriesOf(program);
  const plan = (line: number, last?: PreviewHintState) =>
    planPreviewHint(program, URI, line, entries, last);

  it("asks for the cursor's beats first, the window next, and the rest of the scene once on entering it", () => {
    const first = plan(3)!;
    expect(first).not.toBeNull();
    // The guess: the cursor's beat and the one after it.
    expect(srcs(first.cursor)).toEqual([src("bunny"), src("hat")]);
    // The default window is 32 beats either side: the whole of this scene.
    expect(srcs(first.near)).toEqual([
      src("room"),
      src("bunny"),
      src("hat"),
      src("cat"),
      src("dog"),
    ]);
    expect(srcs(first.rest)).toEqual([]);
    expect(first.state).toMatchObject({
      uri: URI,
      scene: "A",
      beat: 1,
      line: 3,
      nearBeat: 1,
    });
  });

  it("covers the cursor's own beat from any line of it, and stays inside the window", () => {
    const beats = program.sceneAssets!["A"]!.beats;
    const locations = program.pathLocations!;
    for (let line = 1; line <= 13; line++) {
      const fresh = plan(line)!;
      const path = findClosestPath(
        { file: URI, line },
        entries,
        Object.keys(program.scripts ?? {}),
      );
      const at = beatIndexIn(beats, locations, path);
      const own = srcs(items(program, beats[Math.max(0, at)]!.image ?? []));
      const cursor = srcs(fresh.cursor)!;
      const near = new Set(srcs(fresh.near));
      expect({ line, coversOwn: own!.every((s) => cursor.includes(s)) }).toEqual(
        { line, coversOwn: true },
      );
      expect({ line, insideWindow: cursor.every((s) => near.has(s)) }).toEqual(
        { line, insideWindow: true },
      );
    }
  });

  it("asks for the same pictures the engine resolves for the same names", () => {
    const game = new Game({ program } as any);
    const names = program.sceneAssets!["A"]!.beats.flatMap((b) => b.image ?? []);
    for (const name of names) {
      const theirs = game.module.ui.getImageSrcsByName(name) ?? [];
      const ours = srcs(plan(3)!.near)!.filter((s) => theirs.includes(s));
      expect({ name, ours }).toEqual({ name, ours: theirs });
    }
  });

  it("asks for the filtered variant the engine resolves, query string and all", () => {
    // The url a filtered SVG renders through carries the filter in its query
    // string, and nothing else ever fetches it; the hint is useless unless
    // it names that exact url.
    const story = `define dim as filter with
  includes = { "glow" }
end

scene A
  [[show backdrop hall~dim]]
  Line one.
  done
end
`;
    const filtered = compile(story, 1, [svg("hall")]);
    const game = new Game({ program: filtered } as any);
    const theirs = game.module.ui.getImageSrcsByName("hall~dim");
    expect(theirs).toHaveLength(1);
    expect(theirs![0]).toMatch(/^\/file:\/proj\/hall\.svg\?v=1&filters=/);
    const hint = planPreviewHint(
      filtered,
      URI,
      5,
      entriesOf(filtered),
      undefined,
    )!;
    expect(srcs(hint.cursor)).toEqual(theirs);
    expect(srcs(hint.near)).toEqual(theirs);
  });

  it("asks for nothing again on the same line, or on another line of the same beat", () => {
    const first = plan(3)!;
    expect(plan(3, first.state)).toBeNull();
    // Line 4 is the line below the bunny beat: not a beat, and the window
    // already covers it.
    const same = plan(4, first.state)!;
    expect(same.cursor).toEqual([]);
    expect(same.near).toEqual([]);
    expect(same.rest).toBeNull();
    expect(same.state.beat).toBe(first.state.beat);
  });

  it("guesses from the beat at or before the cursor, wherever in the beat the cursor is", () => {
    const first = plan(3)!;
    // Line 6 is `Line three.`: the beat before it is hat's.
    const between = plan(6, first.state)!;
    expect(srcs(between.cursor)).toEqual([src("hat"), src("cat")]);
    expect(between.state.beat).toBe(2);
    const onBeat = plan(10, between.state)!;
    expect(srcs(onBeat.cursor)).toEqual([src("cat"), src("dog")]);
    // Arriving at a beat's line from the line below it asks for nothing
    // new: that line's hint already covered the beat.
    const below = plan(4)!;
    expect(srcs(below.cursor)).toEqual([src("bunny"), src("hat")]);
    const up = plan(3, below.state)!;
    expect(up.cursor).toEqual([]);
    expect(up.near).toEqual([]);
  });

  it("re-sends the window only when the cursor leaves half of it, not the whole of it", () => {
    // Five beats and a reach of six: the whole scene is the window, and
    // half the reach is three beats.
    const wide = compile(
      `define assets as config with\n  predict_distance = 6\nend\n\n${STORY}`,
    );
    const at = (line: number, last?: PreviewHintState) =>
      planPreviewHint(wide, URI, line + 4, entriesOf(wide), last);
    const first = at(1)!;
    expect(srcs(first.near)).toHaveLength(5);
    // Three beats on: within half the reach, nothing.
    const three = at(10, first.state)!;
    expect(three.near).toEqual([]);
    expect(three.state.nearBeat).toBe(0);
    // Four beats on: past half the reach, though well within the whole.
    const four = at(12, three.state)!;
    expect(srcs(four.near)).toHaveLength(5);
    expect(four.state.nearBeat).toBe(4);
  });

  it("re-sends the window only when the cursor leaves half of it", () => {
    // The config block adds four lines above the story.
    const narrow = compile(
      `define assets as config with\n  predict_distance = 2\nend\n\n${STORY}`,
    );
    const at = (line: number, last?: PreviewHintState) =>
      planPreviewHint(narrow, URI, line + 4, entriesOf(narrow), last);
    const first = at(1)!;
    expect(srcs(first.near)).toEqual([src("room"), src("bunny"), src("hat")]);
    // One beat further: within half the reach, the last window stands.
    const one = at(3, first.state)!;
    expect(one.near).toEqual([]);
    expect(one.state.nearBeat).toBe(0);
    // Two beats further: a new window, centred there.
    const two = at(5, one.state)!;
    expect(srcs(two.near)).toEqual([
      src("room"),
      src("bunny"),
      src("hat"),
      src("cat"),
      src("dog"),
    ]);
    expect(two.state.nearBeat).toBe(2);
    expect(two.rest).toBeNull();
  });

  it("asks for the scene again when the cursor enters another scene", () => {
    const first = plan(3)!;
    const inB = plan(18, first.state)!;
    expect(inB.state.scene).toBe("B");
    expect(srcs(inB.cursor)).toEqual([src("room2")]);
    expect(inB.rest).not.toBeNull();
  });

  it("asks for the beat's own pictures again after a recompile, and nothing else", () => {
    const first = plan(3)!;
    const recompiled = compile(STORY.replace("portrait bunny", "portrait cat"), 2);
    const again = planPreviewHint(
      recompiled,
      URI,
      3,
      entriesOf(recompiled),
      first.state,
    )!;
    expect(again).not.toBeNull();
    expect(srcs(again.cursor)).toEqual([src("cat"), src("hat")]);
    expect(again.near).toEqual([]);
    expect(again.rest).toBeNull();
    expect(again.state.version).toBe(recompiled.version);
  });

  it("hints nothing for a path the program does not know", () => {
    const first = plan(3)!;
    const nowhere = planPreviewHint(program, URI, 999, [], first.state)!;
    expect(nowhere.cursor).toEqual([]);
    expect(nowhere.near).toEqual([]);
    expect(nowhere.rest).toBeNull();
  });
});

describe("applyPreviewHint", () => {
  const fake = () => {
    const calls: string[] = [];
    const cache: PreviewHintCache = {
      hint: (items) => calls.push(`hint:${items.length}`),
      prefetch: (items, priority) =>
        calls.push(`prefetch:${items.length}@${priority}`),
    };
    return { calls, cache };
  };
  const item = (n: number): AssetItem => ({ kind: "image", src: `/p${n}.png` });
  const state: PreviewHintState = {
    uri: URI,
    version: 1,
    scene: "A",
    beat: 0,
    line: 0,
    nearBeat: 0,
  };

  it("hints the cursor's beats, always, and prefetches the window at 2 and the rest at 3", () => {
    const { calls, cache } = fake();
    applyPreviewHint(cache, {
      state,
      cursor: [item(1)],
      near: [item(1), item(2)],
      rest: [item(3)],
    });
    expect(calls).toEqual(["hint:1", "prefetch:2@2", "prefetch:1@3"]);
  });

  it("retires the last hint with an empty one, and skips empty prefetches", () => {
    const { calls, cache } = fake();
    applyPreviewHint(cache, { state, cursor: [], near: [], rest: null });
    expect(calls).toEqual(["hint:0"]);
  });
});
