import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import {
  beatIndexIn,
  gateBeats,
  PREVIEW_GATE_BEATS,
  PREVIEW_GATE_LINES,
  previewWindow,
} from "../../game/modules/assets/utils/previewWindow";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

// What a preview loads and waits for (#429, #434): the beat under the cursor
// goes through the restore gate before the connect settles, and only the
// beats that display with it; the window around the cursor warms first and
// the rest of the scene behind it, once per scene; and the window follows
// the cursor without being sent twice for one position.

const asset = (type: string, name: string, ext: string): File => ({
  uri: `file://proj/${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("image", "room", "png"),
  asset("image", "room2", "png"),
  asset("image", "bunny", "png"),
  asset("image", "hat", "png"),
  asset("image", "cat", "png"),
  asset("image", "dog", "png"),
  asset("audio", "theme", "mp3"),
];

// Line numbers matter here: `bunny` (line 3) and `hat` (line 5) display
// together with the line between them; `cat` (line 10) is a later scrub's.
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

const byMethod = (messages: any[], method: string) =>
  messages.filter((m) => m?.method === method);

const itemKeys = (msg: any): string[] =>
  (msg?.params?.items ?? []).map((item: any) =>
    item.kind === "audio" ? item.params.key : item.src,
  );

const src = (name: string) => `/file:/proj/${name}.png?v=1`;

/** The path of the beat in `flow` that shows `image`. */
const beatShowing = (game: Game, flow: string, image: string): string => {
  const beats = game.program.sceneAssets![flow]!.beats;
  const beat = beats.find((b) => b.image?.includes(image));
  if (!beat) {
    throw new Error(`no beat in ${flow} shows ${image}`);
  }
  return beat.path;
};

/** Whether a promise has settled by the time the microtasks drain. */
const settled = async (promise: Promise<unknown>): Promise<boolean> => {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  await flushMicrotasks(20);
  return done;
};

describe("preview prediction and gate", () => {
  it("holds the connect on the cursor beat's pictures, and those of the beats that display with it", async () => {
    // Line 3 is `[[show portrait bunny]]`, the beat that shows the portrait.
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      holdAssets: true,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await flushMicrotasks(20);
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params.pin).toBe("restore");
    expect(load[0].params.priority).toBe(0);
    // The cursor's beat and the one two lines below it, which the same
    // preview writes; not the portrait several lines further down, which
    // the next scrub writes.
    expect(itemKeys(load[0])).toEqual([src("bunny"), src("hat")]);
    // The connect is what the page waits on before it previews: it does
    // not settle until the gate does.
    expect(await settled(h.ready)).toBe(false);
    const bunnyWrites = () =>
      byMethod(h.messages, "ui/write-image").filter((m) =>
        JSON.stringify(m.params).includes("bunny.png"),
      );
    expect(bunnyWrites()).toHaveLength(0);
    h.releaseAssets();
    // Once the page answers, the connect settles (a wait that never ends
    // fails this test by its timeout).
    await h.ready;
    expect(byMethod(h.messages, "assets/release").at(-1)?.params).toEqual({
      pins: ["restore"],
      drop: false,
    });
    h.reset();
    h.preview(3);
    expect(bunnyWrites().length).toBeGreaterThan(0);
  });

  it("gates nothing for a path the program does not know", async () => {
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      holdAssets: true,
      beforeConnect: (game) => {
        // A remembered preview point the last edit removed.
        game.markPreviewing("A.9999");
      },
    });
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(await settled(h.ready)).toBe(true);
  });

  it("warms the beats around the cursor first, the rest of the scene behind them, then the next scene", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 1\nend\n\n${STORY}`,
      5,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "A", "hat"));
        },
      },
    );
    await h.ready;
    h.reset();
    const assets: any = h.game.module.assets;
    assets.onEnterScene("A", null, []);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2, 3, 3]);
    // One beat either side of the cursor's.
    expect(itemKeys(prefetches[0])).toEqual([
      src("bunny"),
      src("hat"),
      src("cat"),
    ]);
    // The rest of the scene: what follows the window, then what precedes it.
    expect(itemKeys(prefetches[1])).toEqual([src("dog"), src("room")]);
    // The scene A diverts to, from its first beat.
    expect(itemKeys(prefetches[2])).toEqual([src("room2")]);
  });

  it("enters a scene through the game's own path watcher", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 1\nend\n\n${STORY}`,
      3,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "A", "bunny"));
        },
      },
    );
    await h.ready;
    h.reset();
    // The cursor lands in B: the scene changes, so the whole of B warms.
    const inB = beatShowing(h.game, "B", "room2");
    h.game.markPreviewing(inB);
    h.game.observeScene(inB);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.length).toBeGreaterThan(0);
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room2")]);
  });

  it("enters a scene the cursor is not in from that scene's first beat", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 1\nend\n\n${STORY}`,
      13,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          // The cursor sits on A's last beat; the preview diverts on into B.
          game.markPreviewing(beatShowing(game, "A", "dog"));
        },
      },
    );
    await h.ready;
    h.reset();
    (h.game.module.assets as any).onEnterScene("B", "A", []);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room2")]);
  });

  it("sends the window around the cursor once per cursor position", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 1\nend\n\n${STORY}`,
      3,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "A", "bunny"));
        },
      },
    );
    await h.ready;
    h.reset();
    // The beats one preview writes, with the cursor where it was: the
    // window was sent on entering the scene and is not sent again.
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    // The cursor moves within the scene: the window around it, and only
    // that; the rest of the scene was sent on entry.
    h.game.markPreviewing(beatShowing(h.game, "A", "dog"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    let prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
    expect(itemKeys(prefetches[0])).toEqual([src("cat"), src("dog")]);
    h.reset();
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    // Another program: what was sent is forgotten.
    h.game.module.assets.onProgramUpdate();
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
  });

  it("keeps play's forward window unchanged", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 2\nend\n\n${STORY}`,
      0,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.context.system.previewing = undefined;
        },
      },
    );
    await h.ready;
    h.reset();
    const beats = h.game.program.sceneAssets!["A"]!.beats;
    h.game.observeScene(beats[0]!.path);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches).toHaveLength(1);
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room"), src("bunny")]);
  });

  it("divides a scene around an index", () => {
    const beats = ["a", "b", "c", "d", "e", "f"].map((path) => ({ path }));
    const entry = {
      kind: "scene" as const,
      beats,
      image: [],
      audio: [],
      layouts: [],
      loads: [],
      successors: [],
      calls: [],
    };
    const paths = (list: { path: string }[]) => list.map((b) => b.path);
    let w = previewWindow(entry, 2, 1);
    expect(paths(w.near)).toEqual(["b", "c", "d"]);
    expect(paths(w.rest)).toEqual(["e", "f", "a"]);
    w = previewWindow(entry, 0, 2);
    expect(paths(w.near)).toEqual(["a", "b", "c"]);
    expect(paths(w.rest)).toEqual(["d", "e", "f"]);
    w = previewWindow(entry, 99, 1);
    expect(paths(w.near)).toEqual(["e", "f"]);
    w = previewWindow(entry, 3, 0);
    expect(paths(w.near)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(w.rest).toEqual([]);
    expect(previewWindow({ ...entry, beats: [] }, 0, 3)).toEqual({
      near: [],
      rest: [],
    });
  });

  it("gates the beats that display together, by their distance in the source", () => {
    const beats = ["a", "b", "c", "d", "e"].map((path) => ({ path }));
    const entry = {
      kind: "scene" as const,
      beats,
      image: [],
      audio: [],
      layouts: [],
      loads: [],
      successors: [],
      calls: [],
    };
    const paths = (list: { path: string }[]) => list.map((b) => b.path);
    // a ends on line 3; b begins on line 5 (within reach), c on line 6
    // (within reach of b), d on line 20 (too far), e in another script.
    const locations = {
      a: [0, 3, -1, 3, 10],
      b: [0, 3 + PREVIEW_GATE_LINES, -1, 5, 10],
      c: [0, 6, -1, 6, 10],
      d: [0, 20, -1, 20, 10],
      e: [1, 7, -1, 7, 10],
    };
    expect(paths(gateBeats(entry, 0, locations))).toEqual(["a", "b", "c"]);
    expect(paths(gateBeats(entry, 2, locations))).toEqual(["c"]);
    expect(paths(gateBeats(entry, 3, locations))).toEqual(["d"]);
    // Never more than the cap, however close the beats are.
    const close = { a: [0, 1, -1, 1, 5], b: [0, 2, -1, 2, 5], c: [0, 3, -1, 3, 5], d: [0, 4, -1, 4, 5], e: [0, 5, -1, 5, 5] };
    expect(gateBeats(entry, 0, close)).toHaveLength(PREVIEW_GATE_BEATS);
    // No location for the cursor's beat: the beat alone.
    expect(paths(gateBeats(entry, 0, {}))).toEqual(["a"]);
    expect(gateBeats(entry, 9, locations)).toEqual([]);
  });

  it("finds the beat at or before a path", () => {
    const beats = [{ path: "A.0" }, { path: "A.3" }, { path: "A.7" }];
    const locations = {
      "A.0": [0, 1, 0],
      "A.2": [0, 2, 0],
      "A.3": [0, 3, 0],
      "A.5": [0, 5, 2],
      "A.7": [0, 7, 0],
      "B.0": [1, 0, 0],
    };
    expect(beatIndexIn(beats, locations, "A.3")).toBe(1);
    expect(beatIndexIn(beats, locations, "A.5")).toBe(1);
    expect(beatIndexIn(beats, locations, "A.2")).toBe(0);
    expect(beatIndexIn(beats, locations, "B.0")).toBe(2);
    expect(beatIndexIn(beats, locations, "nowhere")).toBe(-1);
    expect(beatIndexIn(beats, locations, null)).toBe(-1);
  });
});
