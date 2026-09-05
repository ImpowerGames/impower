import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import {
  beatIndexIn,
  previewWindow,
} from "../../game/modules/assets/utils/previewWindow";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

// What a preview loads and waits for (#429, #434): the beat under the cursor
// goes through the restore gate before the connect settles, and exactly the
// pictures the preview writes with it, whatever the source looks like, since
// the gate runs the beat dry rather than reading the source; the window
// around the cursor warms first and the rest of the scene behind it, once
// per scene; and the window follows the cursor without being sent for every
// beat.

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
  asset("image", "owl", "png"),
  asset("audio", "theme", "mp3"),
];

// Line numbers matter: what displays together is decided by the story as it
// runs, and the tests below say which line the cursor is on.
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

/** Source shapes whose beats look alike and display differently: what
 *  separates two image lines decides whether they display together, and
 *  only the story knows which lines display. */
const SHAPES: Record<string, string> = {
  // A line of dialogue between every two beats: each displays alone.
  alternating: `scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  Line two.
  [[show portrait hat]]
  Line three.
  done
end
`,
  // Two image-only lines in a row display together with the line below.
  consecutive: `scene A
  [[show backdrop room]]
  [[show portrait bunny]]
  Line one.
  [[show portrait hat]]
  Line two.
  done
end
`,
  // Blank lines change nothing: three image-only lines display together.
  blank: `scene A
  [[show backdrop room]]

  [[show portrait bunny]]

  [[show portrait hat]]
  Line one.
  done
end
`,
  // A directive that displays nothing between two image lines: they still
  // display together.
  hide: `scene A
  [[show backdrop room]]
  [[hide portrait]]
  [[show portrait bunny]]
  Line one.
  done
end
`,
  // Control flow between two image lines displays nothing either.
  ifBetween: `scene A
  store q = 5
  [[show backdrop room]]
  if q > 1 then
    & q = 2
  end
  [[show portrait bunny]]
  Line one.
  done
end
`,
  // A divert carries the beat into the next scene's first beat.
  divert: `scene A
  [[show backdrop room]]
  -> B
end

scene B
  [[show portrait bunny]]
  Line one.
  done
end
`,
  // A line of dialogue above the scene's first beat displays alone.
  textAbove: `scene A
  Line one.
  [[show portrait bunny]]
  Line two.
  done
end
`,
  // However many image lines display together, all of them are gated.
  seven: `scene A
  [[show backdrop room]]
  [[show backdrop room2]]
  [[show portrait bunny]]
  [[show portrait hat]]
  [[show portrait cat]]
  [[show portrait dog]]
  [[show portrait owl]]
  Line one.
  done
end
`,
};

const byMethod = (messages: any[], method: string) =>
  messages.filter((m) => m?.method === method);

const itemKeys = (msg: any): string[] =>
  (msg?.params?.items ?? []).map((item: any) =>
    item.kind === "audio" ? item.params.key : item.src,
  );

const src = (name: string) => `/file:/proj/${name}.png?v=1`;

const fileOf = (key: string) => key.split("/").pop()!.split("?")[0]!;

/** The path of the beat in `flow` that shows `image`. */
const beatShowing = (game: Game, flow: string, image: string): string => {
  const beats = game.program.sceneAssets![flow]!.beats;
  const beat = beats.find((b) => b.image?.includes(image));
  if (!beat) {
    throw new Error(`no beat in ${flow} shows ${image}`);
  }
  return beat.path;
};

/** The path the editor's cursor on `line` resolves to. */
const pathAt = (game: Game, line: number): string | null =>
  findClosestPath(
    { file: MAIN_URI, line },
    Object.entries(game.program.pathLocations ?? {}) as any,
    Object.keys(game.program.scripts ?? {}),
  );

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

/** The pictures the messages show, by file. */
const imagesWritten = (messages: any[]) =>
  [
    ...new Set(
      byMethod(messages, "ui/write-image")
        .filter((m) => m.params?.control !== "hide")
        .flatMap(
          (m) => JSON.stringify(m.params).match(/[a-z0-9_]+\.png/g) ?? [],
        ),
    ),
  ].sort();

const syncTimeout = ((fn: Function, _ms?: number, ...a: any[]) => {
  fn(...a);
  return 0;
}) as any;

/** The checkpoint the compile worker hands the page for a preview at
 *  `line`: a real route simulation, as `patchAndSimulateRoute` runs it in
 *  production. Null when no route reaches the line. */
const checkpointFor = (story: string, line: number): string | null => {
  const { program } = compileUI(story, {
    experimentalDisplayCalls: true,
    assets: ASSETS,
  });
  const sim: any = new Game({
    program: program as any,
    now: () => 0,
    setTimeout: syncTimeout,
  } as any);
  sim.setStartFrom({ file: MAIN_URI, line });
  const toPath = sim.startPath as string;
  const fromPath = Game.getSimulateFromPath(toPath);
  const route = Game.planRoute(sim.story, program as any, fromPath, toPath);
  return route ? sim.patchAndSimulateRoute(route) : null;
};

/** How a preview gets to its beat: by jumping to it from a reset story
 *  (no route, or a failed one), or by continuing from the route's checkpoint. */
type Arrival = { simulation?: "fail"; checkpoint?: string };

/** What a game that never ran the beat ahead writes when it previews
 *  `line`: the oracle for the gate. Its preview point is a boolean, so the
 *  connect runs nothing and the preview runs the beat itself. `restore` is
 *  what the connect wrote (a loaded checkpoint's pictures), `preview` what
 *  the preview wrote after it. */
const writesOf = async (story: string, line: number, arrival: Arrival = {}) => {
  const h = createHarness(story, line, {
    assets: ASSETS,
    loadCheckpoint: arrival.checkpoint,
    beforeConnect: (game) => {
      if (arrival.simulation) {
        game.simulation = arrival.simulation;
      }
    },
  });
  await h.ready;
  const restore = [...h.messages];
  h.reset();
  h.preview(line);
  return { restore, preview: h.messages };
};

/**
 * What the restore gate asks for when the cursor is on `line`, against the
 * pictures a preview from that line writes in a game that never ran the
 * beat ahead. The two must agree: a picture in the gate the preview never
 * writes holds the line for nothing, and a picture the preview writes that
 * the gate skipped lands late.
 */
const gateAgainstPreview = async (
  story: string,
  line: number,
  arrival: Arrival = {},
) => {
  const h = createHarness(story, line, {
    assets: ASSETS,
    holdAssets: true,
    loadCheckpoint: arrival.checkpoint,
    beforeConnect: (game) => {
      if (arrival.simulation) {
        game.simulation = arrival.simulation;
      }
      const path = pathAt(game, line);
      if (path) {
        game.markPreviewing(path);
      }
    },
  });
  await flushMicrotasks(20);
  const gated = byMethod(h.messages, "assets/load")
    .flatMap((m) => itemKeys(m))
    .map(fileOf)
    .sort();
  h.releaseAssets();
  await h.ready;
  // The gate covers the restore and the preview together: what the loaded
  // checkpoint shows and what the beat then writes.
  const oracle = await writesOf(story, line, arrival);
  const written = imagesWritten([...oracle.restore, ...oracle.preview]);
  return { gated, written };
};

/** The writes of a preview, in order, as the page would receive them. */
const writes = (messages: any[]) =>
  messages
    .filter((m) => m?.method === "ui/write-text" || m?.method === "ui/write-image")
    .map((m) => `${m.method} ${JSON.stringify(m.params)}`);

describe("preview prediction and gate", () => {
  it("holds the connect on the cursor beat's pictures, and only what the preview writes with it", async () => {
    // Line 3 is `[[show portrait bunny]]`; line 4, `Line two.`, displays on
    // its own before `hat` on line 5.
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
    expect(itemKeys(load[0])).toEqual([src("bunny")]);
    // The beat's run sends no prefetch of its own for the picture the gate
    // is about to ask for: that would start it in a background slot first.
    const own = byMethod(h.messages, "assets/prefetch").filter(
      (m) => itemKeys(m).length === 1 && itemKeys(m)[0] === src("bunny"),
    );
    expect(own).toHaveLength(0);
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

  it("gates exactly what a preview writes, whatever the source shape", async () => {
    // Beat lines: 1, 3, 5 in the alternating and blank shapes; 1, 2, 4 in
    // the consecutive one; 1 and 3 in the hide shape; 2 and 6 with control
    // flow between. Line 0 is the scene heading.
    const cases: Array<[string, number, string[]]> = [
      ["alternating", 0, []],
      ["alternating", 1, ["room.png"]],
      ["alternating", 3, ["bunny.png"]],
      ["alternating", 5, ["hat.png"]],
      ["consecutive", 1, ["bunny.png", "room.png"]],
      ["consecutive", 2, ["bunny.png"]],
      ["consecutive", 4, ["hat.png"]],
      ["blank", 1, ["bunny.png", "hat.png", "room.png"]],
      ["blank", 3, ["bunny.png", "hat.png"]],
      ["blank", 5, ["hat.png"]],
      ["hide", 1, ["bunny.png", "room.png"]],
      ["hide", 2, ["bunny.png"]],
      ["hide", 3, ["bunny.png"]],
      ["ifBetween", 2, ["bunny.png", "room.png"]],
      ["ifBetween", 3, ["bunny.png"]],
      ["ifBetween", 6, ["bunny.png"]],
      ["divert", 1, ["bunny.png", "room.png"]],
      ["textAbove", 0, []],
      ["textAbove", 1, []],
      ["textAbove", 2, ["bunny.png"]],
      [
        "seven",
        1,
        [
          "bunny.png",
          "cat.png",
          "dog.png",
          "hat.png",
          "owl.png",
          "room.png",
          "room2.png",
        ],
      ],
    ];
    for (const [shape, line, expected] of cases) {
      const { gated, written } = await gateAgainstPreview(SHAPES[shape]!, line);
      expect({ shape, line, gated }).toEqual({ shape, line, gated: expected });
      expect({ shape, line, written }).toEqual({
        shape,
        line,
        written: expected,
      });
    }
  });

  it("gates exactly what a preview writes from a route's checkpoint too", async () => {
    // The page loads the checkpoint the route simulation built for the
    // cursor's line before it connects, and the preview continues from it
    // rather than jumping; the gate must follow that run.
    const cases: Array<[string, number]> = [
      ["alternating", 1],
      ["alternating", 3],
      ["consecutive", 1],
      ["blank", 3],
      ["hide", 1],
      ["divert", 1],
      ["textAbove", 1],
      ["seven", 1],
    ];
    for (const [shape, line] of cases) {
      const checkpoint = checkpointFor(SHAPES[shape]!, line);
      expect({ shape, line, checkpoint: checkpoint != null }).toEqual({
        shape,
        line,
        checkpoint: true,
      });
      const { gated, written } = await gateAgainstPreview(
        SHAPES[shape]!,
        line,
        { checkpoint: checkpoint! },
      );
      expect({ shape, line, gated }).toEqual({ shape, line, gated: written });
    }
  });

  it("displays the beat that ran ahead exactly as a preview that runs it itself, from a reset story or a checkpoint", async () => {
    // The oracle writes the beat by running it at preview time; the game
    // under test ran it at connect and displays what it flushed. The page
    // must not be able to tell the two apart, whichever way the story got
    // to the beat: reset and jumped to (no route, or a failed one) or
    // continued from a loaded checkpoint (a route that succeeded).
    const arrivals: Array<[string, Arrival]> = [
      ["no route", {}],
      ["failed route", { simulation: "fail" }],
      ["checkpoint", { checkpoint: checkpointFor(STORY, 3)! }],
    ];
    for (const [how, arrival] of arrivals) {
      const oracle = writes((await writesOf(STORY, 3, arrival)).preview);
      expect({ how, count: oracle.length }).not.toEqual({ how, count: 0 });
      const h = createHarness(STORY, 3, {
        assets: ASSETS,
        loadCheckpoint: arrival.checkpoint,
        beforeConnect: (game) => {
          if (arrival.simulation) {
            game.simulation = arrival.simulation;
          }
          game.markPreviewing(pathAt(game, 3)!);
        },
      });
      await h.ready;
      h.reset();
      h.preview(3);
      expect({ how, writes: writes(h.messages) }).toEqual({
        how,
        writes: oracle,
      });
    }
  });

  it("raises a runtime error in the beat once, from the run ahead, and not again at preview", async () => {
    const story = `scene A
  [[show backdrop room]]
  & error("boom")
  Line one.
  done
end
`;
    const h = createHarness(story, 1, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(pathAt(game, 1)!);
      },
    });
    await h.ready;
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(1);
    h.reset();
    h.preview(1);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(0);
  });

  it("runs the beat once: at connect, and never again at preview", async () => {
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await h.ready;
    // One run at connect, none at preview: the story executed once.
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    h.reset();
    h.preview(3);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("runs the beat itself when the one that ran ahead was for another path", async () => {
    // The page marks the last valid preview point and then previews the
    // cursor's line; when the two disagree, the run ahead is dropped.
    const h = createHarness(STORY, 5, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await h.ready;
    h.reset();
    h.preview(5);
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("runs nothing and gates nothing for a cursor inside a function", async () => {
    const story = `function greet
  [[show portrait bunny]]
  Hello there.
end

scene A
  [[show backdrop room]]
  Line one.
  done
end
`;
    const h = createHarness(story, 1, {
      assets: ASSETS,
      holdAssets: true,
      beforeConnect: (game) => {
        const path = Object.keys(game.program.pathLocations ?? {}).find((p) =>
          /^greet\./.test(p),
        );
        expect(path).toBeDefined();
        game.markPreviewing(path!);
      },
    });
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(0);
    expect(await settled(h.ready)).toBe(true);
  });

  it("gates what a jump to a line between beats writes, which is nothing, and nothing for a path the program does not know", async () => {
    // Line 2 of the alternating shape is `Line one.`. A preview that jumps
    // to it writes that line and no picture; from a route's checkpoint the
    // same line writes the backdrop above it too, and the gate follows the
    // run either way (the checkpoint table above).
    const between = await gateAgainstPreview(SHAPES["alternating"]!, 2);
    expect(between.gated).toEqual([]);
    expect(between.written).toEqual([]);
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

  it("enters a scene the cursor is not in from that scene's first beat, whichever side of the cursor it lies", async () => {
    // The cursor sits in B, defined after A in the source; the story enters
    // A (a divert back). Anchored on the cursor, the window would start from
    // A's last beat, the one before the cursor in the source.
    const h = createHarness(
      `define assets as config with\n  predict_distance = 1\nend\n\n${STORY}`,
      18,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "B", "room2"));
        },
      },
    );
    await h.ready;
    h.reset();
    (h.game.module.assets as any).onEnterScene("A", "B", []);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room"), src("bunny")]);
  });

  it("sends the window around the cursor when the cursor leaves half of the last one", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 2\nend\n\n${STORY}`,
      1,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "A", "room"));
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
    // One beat further (within half the reach of two): the last window
    // still covers it, nothing is sent.
    h.game.markPreviewing(beatShowing(h.game, "A", "bunny"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    // Two beats further: the window around the new position, and only that.
    h.game.markPreviewing(beatShowing(h.game, "A", "hat"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    let prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
    expect(itemKeys(prefetches[0])).toEqual([
      src("room"),
      src("bunny"),
      src("hat"),
      src("cat"),
      src("dog"),
    ]);
    h.reset();
    // Another program: what was sent is forgotten.
    h.game.module.assets.onProgramUpdate();
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
  });

  it("re-sends the window when the cursor leaves half of its reach, not the whole of it", async () => {
    // Five beats and a reach of six: half the reach is three beats.
    const h = createHarness(
      `define assets as config with\n  predict_distance = 6\nend\n\n${STORY}`,
      1,
      {
        assets: ASSETS,
        beforeConnect: (game) => {
          game.markPreviewing(beatShowing(game, "A", "room"));
        },
      },
    );
    await h.ready;
    h.reset();
    // Three beats on: within half the reach, nothing.
    h.game.markPreviewing(beatShowing(h.game, "A", "cat"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    // Four beats on: past half the reach, though well within the whole.
    h.game.markPreviewing(beatShowing(h.game, "A", "dog"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
    expect(itemKeys(prefetches[0])).toHaveLength(5);
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
