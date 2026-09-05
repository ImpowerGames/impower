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
// the gate runs the beat ahead of its display rather than reading the
// source, and the preview then displays that run, telling the page what a
// preview that ran the beat itself would tell it; the window around the
// cursor warms first and the rest of the scene behind it, once per scene;
// and the window follows the cursor without being sent for every beat.

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
  // A hide that names the picture it hides shows nothing, and gates nothing.
  hideNamed: `scene A
  [[show backdrop room]]
  [[show portrait bunny]]
  Line one.
  [[hide portrait bunny]]
  Line two.
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

/** The pictures the messages show, by file: what a write-image message's
 *  instructions show, leaving out a hide, which can name the picture it
 *  hides. */
const imagesWritten = (messages: any[]) =>
  [
    ...new Set(
      byMethod(messages, "ui/write-image")
        .flatMap((m) => m.params?.instructions ?? [])
        .filter((instruction: any) => instruction?.control !== "hide")
        .flatMap(
          (instruction: any) =>
            JSON.stringify(instruction).match(/[a-z0-9_]+\.png/g) ?? [],
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
 *  (no route, or a failed one), or by continuing from the route's
 *  checkpoint; `prepare` sets the game up further before it connects (a
 *  breakpoint, a budget), in the oracle and the game under test alike. */
type Arrival = {
  simulation?: "fail";
  checkpoint?: string;
  prepare?: (game: Game) => void;
};

/** What a game that never ran the beat ahead writes when it previews
 *  `line`: the oracle for the gate. Its preview point is a boolean, so the
 *  connect runs nothing and the preview runs the beat itself. `restore` is
 *  what the connect sent (a loaded checkpoint's pictures), `preview` what
 *  the preview sent after it, both read the moment each finished. */
const writesOf = async (story: string, line: number, arrival: Arrival = {}) => {
  const h = createHarness(story, line, {
    assets: ASSETS,
    loadCheckpoint: arrival.checkpoint,
    beforeConnect: (game) => {
      if (arrival.simulation) {
        game.simulation = arrival.simulation;
      }
      arrival.prepare?.(game);
    },
  });
  await h.ready;
  const restore = [...h.messages];
  h.reset();
  h.preview(line);
  const preview = [...h.messages];
  return { restore, preview, game: h.game };
};

/** A game whose cursor beat runs ahead at connect, the way the page marks
 *  it: connected, its gate answered, ready to preview `line`. */
const runAhead = async (story: string, line: number, arrival: Arrival = {}) => {
  const h = createHarness(story, line, {
    assets: ASSETS,
    loadCheckpoint: arrival.checkpoint,
    beforeConnect: (game) => {
      if (arrival.simulation) {
        game.simulation = arrival.simulation;
      }
      arrival.prepare?.(game);
      game.markPreviewing(pathAt(game, line)!);
    },
  });
  await h.ready;
  return h;
};

/**
 * What the restore gate asks for when the cursor is on `line`, against the
 * pictures a preview from that line writes in a game that never ran the
 * beat ahead. The two must agree: a picture in the gate the preview never
 * writes holds the line for nothing, and a picture the preview writes that
 * the gate skipped lands late. `loads` is each gate request on its own, in
 * the order sent; `gated` every picture they name; `prefetches` how many
 * prefetches the connect sent; `restore` and `preview` what the oracle's
 * connect and preview wrote.
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
      arrival.prepare?.(game);
      const path = pathAt(game, line);
      if (path) {
        game.markPreviewing(path);
      }
    },
  });
  await flushMicrotasks(20);
  const loads = byMethod(h.messages, "assets/load").map((m) =>
    itemKeys(m).map(fileOf).sort(),
  );
  const gated = [...new Set(loads.flat())].sort();
  const prefetches = byMethod(h.messages, "assets/prefetch").length;
  h.releaseAssets();
  await h.ready;
  // The gate covers the restore and the preview together: what the loaded
  // checkpoint shows and what the beat then writes.
  const oracle = await writesOf(story, line, arrival);
  const restore = imagesWritten(oracle.restore);
  const preview = imagesWritten(oracle.preview);
  const written = imagesWritten([...oracle.restore, ...oracle.preview]);
  return { loads, gated, prefetches, restore, preview, written };
};

/** Everything a preview tells the page, in order, but for what it asks the
 *  asset cache (a beat that ran ahead asked at connect; see the prefetch
 *  and gate tests for that), with request ids dropped, and without the
 *  paths of the layouts' binding evaluators among the executed paths: those
 *  run whenever a mounted layout refreshes, during the preview's run in the
 *  oracle, whose layouts are mounted by then, and at the mount after the
 *  run in a game whose beat ran at connect; they are not the beat. */
const stream = (messages: any[]) =>
  messages
    .filter((m) => m?.method && !m.method.startsWith("assets/"))
    .map((m) => {
      let params = m.params;
      if (m.method === "game/executed" && Array.isArray(params?.executedPaths)) {
        params = {
          ...params,
          executedPaths: params.executedPaths.filter(
            (p: string) => !p.startsWith("__binding_"),
          ),
        };
      }
      return `${m.method} ${JSON.stringify(params).replace(
        /"id":"[^"]*"/g,
        '"id":"*"',
      )}`;
    });

/** The notifications a game sends about its own story: none must arrive
 *  for a beat that has not displayed. */
const gameNotices = (messages: any[]) =>
  messages.filter((m) => m?.method?.startsWith("game/"));

/** A game's save, comparable across two games. Left out: the story's
 *  random seed, drawn when the story is made; the paths of the layouts'
 *  binding evaluators among the executed paths, which sit where each game
 *  ran them (after the beat in a game whose beat ran at connect, before it
 *  in a game whose layouts mounted first); and the story's previous
 *  content pointer, where the two games genuinely differ: it names the
 *  last thing the story ran, which for a beat that ran at connect is a
 *  binding evaluator the layouts' mount ran after the beat, and for a beat
 *  the preview ran itself is the beat's last content, or a binding
 *  evaluator again when the beat changed what a binding reads. The pointer
 *  feeds only the first step of the next continue, and the next preview's
 *  checkpoint load or jump replaces it before one. */
const saveOf = (game: Game) =>
  game
    .save()
    .replace(/"storySeed\\*":\d+/g, '"storySeed":0')
    .replace(/,?\\*"__binding_[^"\\]*\\*"/g, "")
    .replace(/\[,/g, "[")
    .replace(/,?\\*"previousContentObject\\*":(?:\\*"[^"\\]*\\*")?/g, "");

/** How often the story has visited each of its containers. */
const visitCountsOf = (game: Game) =>
  JSON.parse(JSON.parse(game.save()).story).visitCounts;

/** The story's own state, comparable across two games: the callstack,
 *  the variables, the visit counts; not the seed or the previous content
 *  pointer, for the reasons `saveOf` gives. */
const storyOf = (game: Game) => {
  const story = JSON.parse(JSON.parse(game.save()).story);
  delete story.storySeed;
  for (const flow of Object.values<any>(story.flows ?? {})) {
    for (const thread of flow?.callstack?.threads ?? []) {
      delete thread.previousContentObject;
    }
  }
  return story;
};

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
      ["hideNamed", 2, ["bunny.png"]],
      ["hideNamed", 4, []],
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

  it("gates the checkpoint's pictures first and the beat's next, from a route's checkpoint", async () => {
    // The page loads the checkpoint the route simulation built for the
    // cursor's line before it connects, and the preview continues from it
    // rather than jumping. The gate is two requests: the pictures the
    // checkpoint restores, so their loads are under way while the beat
    // runs, then the pictures the beat writes; a checkpoint that restores
    // nothing sends one. Each row gives both requests, then what the
    // oracle's connect restored and what its preview wrote. A route runs
    // from the top of the cursor's scene, so a checkpoint in scene B
    // restores nothing scene A showed; and a portrait shows only with the
    // beat that writes it (the connect clears the target), so a checkpoint
    // taken after a portrait beat restores the backdrop alone and the
    // previous beat's portrait is not waited for.
    const seven = [
      "bunny.png",
      "cat.png",
      "dog.png",
      "hat.png",
      "owl.png",
      "room.png",
      "room2.png",
    ];
    const cases: Array<
      [string, string, number, string[][], string[], string[]]
    > = [
      ["alternating", SHAPES["alternating"]!, 1, [["room.png"]], [], ["room.png"]],
      [
        "alternating",
        SHAPES["alternating"]!,
        3,
        [["room.png"], ["bunny.png"]],
        ["room.png"],
        ["bunny.png"],
      ],
      [
        "alternating",
        SHAPES["alternating"]!,
        5,
        [["room.png"], ["hat.png"]],
        ["room.png"],
        ["hat.png"],
      ],
      [
        "consecutive",
        SHAPES["consecutive"]!,
        1,
        [["bunny.png", "room.png"]],
        [],
        ["bunny.png", "room.png"],
      ],
      [
        "consecutive",
        SHAPES["consecutive"]!,
        4,
        [["room.png"], ["hat.png"]],
        ["room.png"],
        ["hat.png"],
      ],
      ["hide", SHAPES["hide"]!, 3, [["bunny.png", "room.png"]], [], ["bunny.png", "room.png"]],
      ["divert", SHAPES["divert"]!, 6, [["bunny.png"]], [], ["bunny.png"]],
      ["textAbove", SHAPES["textAbove"]!, 1, [], [], []],
      ["textAbove", SHAPES["textAbove"]!, 3, [["bunny.png"]], [], ["bunny.png"]],
      ["seven", SHAPES["seven"]!, 8, [seven], [], seven],
      ["story", STORY, 10, [["room.png"], ["cat.png"]], ["room.png"], ["cat.png"]],
      ["story", STORY, 18, [["room2.png"]], [], ["room2.png"]],
    ];
    for (const [shape, source, line, loads, restore, preview] of cases) {
      const checkpoint = checkpointFor(source, line);
      expect({ shape, line, checkpoint: checkpoint != null }).toEqual({
        shape,
        line,
        checkpoint: true,
      });
      const got = await gateAgainstPreview(source, line, {
        checkpoint: checkpoint!,
      });
      expect({
        shape,
        line,
        loads: got.loads,
        restore: got.restore,
        preview: got.preview,
      }).toEqual({ shape, line, loads, restore, preview });
      // And the gate is what the restore and the preview wrote together.
      expect({ shape, line, gated: got.gated }).toEqual({
        shape,
        line,
        gated: got.written,
      });
    }
  });

  it("sends no prefetch of its own for the beat that runs ahead, whatever the beat shows", async () => {
    // What the connect prefetches is the window of the scene it enters (one
    // message: the default window covers these scenes whole, so nothing is
    // left for the rest of the scene), the spill into a successor scene, and
    // the window of a scene the beat runs into. The interpreter's own
    // prefetch of the names it parses, sent for a beat the preview runs
    // itself, would add to these and start the gate's pictures in a
    // background slot first.
    const cases: Array<[string, number, number]> = [
      ["alternating", 3, 1],
      ["consecutive", 1, 1],
      ["seven", 1, 1],
      ["divert", 1, 3],
    ];
    for (const [shape, line, expected] of cases) {
      const { prefetches } = await gateAgainstPreview(SHAPES[shape]!, line);
      expect({ shape, line, prefetches }).toEqual({
        shape,
        line,
        prefetches: expected,
      });
    }
  });

  it("tells the page exactly what a preview that runs the beat itself tells it, and nothing of the beat before the preview", async () => {
    // The oracle runs the beat at preview time; the game under test ran it
    // at connect and displays what it flushed. Everything the page hears
    // about the beat (its writes, the interaction and execution notices,
    // an error it raises, a breakpoint it stops at) must arrive with the
    // preview, in the oracle's order, and none of it with the connect;
    // and the game must be left in the same state, whichever way the story
    // got to the beat, and whatever the beat does.
    const errorStory = `scene A
  [[show backdrop room]]
  & error("boom")
  Line one.
  done
end
`;
    const runawayStory = `scene A
  [[show backdrop room]]
  -> A
end
`;
    const choicesStory = `scene A
  [[show backdrop room]]
  Pick a fruit:
  choose
    + (a) Apple
      You chose apple.
      -> DONE
    + (b) Banana
      You chose banana.
      -> DONE
  end
end
`;
    const cases: Array<[string, string, number, Arrival]> = [
      ["no route", STORY, 3, {}],
      ["failed route", STORY, 3, { simulation: "fail" }],
      ["checkpoint", STORY, 3, { checkpoint: checkpointFor(STORY, 3)! }],
      ["a beat that raises an error", errorStory, 1, {}],
      [
        "a breakpoint inside the beat",
        STORY,
        3,
        {
          prepare: (game) =>
            game.setBreakpoints([{ file: MAIN_URI, line: 4 }]),
        },
      ],
      [
        "a beat that never ends",
        runawayStory,
        1,
        {
          prepare: (game) => {
            (game as any)._executionStepLimit = 400;
          },
        },
      ],
      ["a beat that presents choices", choicesStory, 2, {}],
      ["a beat that runs into the next scene", SHAPES["divert"]!, 1, {}],
      ["the scene heading", SHAPES["textAbove"]!, 0, {}],
      ["a line above the first picture", SHAPES["textAbove"]!, 1, {}],
      ["the last beat of the file", STORY, 19, {}],
    ];
    for (const [how, story, line, arrival] of cases) {
      const oracle = await writesOf(story, line, arrival);
      expect({ how, told: stream(oracle.preview).length }).not.toEqual({
        how,
        told: 0,
      });
      const h = await runAhead(story, line, arrival);
      expect({
        how,
        atConnect: gameNotices(h.messages).map((m) => m.method),
      }).toEqual({ how, atConnect: [] });
      h.reset();
      h.preview(line);
      expect({ how, stream: stream(h.messages) }).toEqual({
        how,
        stream: stream(oracle.preview),
      });
      expect({ how, save: saveOf(h.game) }).toEqual({
        how,
        save: saveOf(oracle.game),
      });
      // The checkpoint the display captures, as the flush it stands in for.
      expect({ how, checkpoints: h.game.checkpoints.length }).toEqual({
        how,
        checkpoints: oracle.game.checkpoints.length,
      });
    }
  });

  it("reports the beat's own paths and conditions for a beat that ran ahead, whatever the layouts' bindings evaluate at their mount", async () => {
    // A layout whose binding calls a function with a condition in it. The
    // layouts mount after the run, and what their bindings evaluate then is
    // not the beat's: the report a kept run sends names the beat's paths
    // and the conditions the beat met, so the next route's favoured
    // conditions are the beat's, not the binding's. A preview that runs the
    // beat itself, with the layouts already mounted, reports the binding's
    // work as well; everything else it tells the page is the same.
    const story = `store hp = 100
function label()
  if hp > 50 then
    return "high"
  end
  return "low"
end

layout hud
  text
    text = "{label()}"

scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  Line two.
  done
end
`;
    // Line 15 is the portrait's beat.
    const oracle = await writesOf(story, 15);
    const h = await runAhead(story, 15);
    expect(gameNotices(h.messages).map((m) => m.method)).toEqual([]);
    h.reset();
    h.preview(15);
    const executed = byMethod(h.messages, "game/executed");
    expect(executed).toHaveLength(1);
    const report = executed[0].params;
    expect(report.executedPaths.length).toBeGreaterThan(0);
    expect(
      report.executedPaths.filter((p: string) => !p.startsWith("A.")),
    ).toEqual([]);
    expect(report.conditions).toEqual([]);
    expect(report.choices).toEqual([]);
    const butExecuted = (messages: any[]) =>
      stream(messages.filter((m) => m?.method !== "game/executed"));
    expect(butExecuted(h.messages)).toEqual(butExecuted(oracle.preview));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("reports a runtime error in the beat once, when the beat displays", async () => {
    const story = `scene A
  [[show backdrop room]]
  & error("boom")
  Line one.
  done
end
`;
    const h = await runAhead(story, 1);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(0);
    h.preview(1);
    const errors = byMethod(h.messages, "game/runtimeError");
    expect(errors).toHaveLength(1);
    expect(errors[0].params.message).toContain("boom");
  });

  it("runs the beat once, and reports its execution once, when it displays", async () => {
    const oracle = await writesOf(STORY, 3);
    const h = await runAhead(STORY, 3);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    h.preview(3);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    // The story ran the beat once: its lines were visited as often as a
    // preview that ran the beat itself visited them.
    expect(visitCountsOf(h.game)).toEqual(visitCountsOf(oracle.game));
  });

  it("stops at a breakpoint inside the beat as a preview that runs the beat itself does, after the game is connected", async () => {
    // A run that stops short of its flush leaves the story part-way through
    // a line, which nothing may evaluate: the layouts mounted next would
    // report an error against the author's script. Nothing is kept of such
    // a run; the preview runs the beat itself and stops there.
    const arrival: Arrival = {
      prepare: (game) => game.setBreakpoints([{ file: MAIN_URI, line: 4 }]),
    };
    const h = await runAhead(STORY, 3, arrival);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(0);
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(0);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    h.reset();
    h.preview(3);
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(1);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(imagesWritten(h.messages)).toEqual([]);
    // From a checkpoint too: the run continued from it and is put back to it.
    const fromCheckpoint = await runAhead(STORY, 3, {
      ...arrival,
      checkpoint: checkpointFor(STORY, 3)!,
    });
    expect(byMethod(fromCheckpoint.messages, "game/runtimeError")).toHaveLength(
      0,
    );
    fromCheckpoint.reset();
    fromCheckpoint.preview(3);
    expect(byMethod(fromCheckpoint.messages, "game/hitBreakpoint")).toHaveLength(
      1,
    );
    expect(imagesWritten(fromCheckpoint.messages)).toEqual([]);
  });

  it("runs the beat itself when the one that ran ahead was for another path, and the page hears nothing of the dropped run", async () => {
    // The page marks the last valid preview point and then previews the
    // cursor's line; when the two disagree, the run ahead is dropped.
    const oracle = await writesOf(STORY, 5);
    const h = createHarness(STORY, 5, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await h.ready;
    // The run that is about to be dropped told the page nothing at connect.
    expect(gameNotices(h.messages).map((m) => m.method)).toEqual([]);
    h.reset();
    h.preview(5);
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
    expect(stream(h.messages)).toEqual(stream(oracle.preview));
    // From a checkpoint, the dropped run is put back to it first, and the
    // preview continues from the checkpoint as the oracle does.
    const checkpoint = checkpointFor(STORY, 5)!;
    const fromCheckpoint = await writesOf(STORY, 5, { checkpoint });
    const kept = createHarness(STORY, 5, {
      assets: ASSETS,
      loadCheckpoint: checkpoint,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await kept.ready;
    expect(gameNotices(kept.messages).map((m) => m.method)).toEqual([]);
    kept.reset();
    kept.preview(5);
    expect(stream(kept.messages)).toEqual(stream(fromCheckpoint.preview));
    expect(saveOf(kept.game)).toEqual(saveOf(fromCheckpoint.game));
  });

  it("drops a kept run when the preview resolves no path, so nothing of it is stranded", async () => {
    // The point the page marked no longer resolves for the preview (its
    // script renamed, its line deleted since the mark): the run is dropped,
    // its game put back, and the page hears nothing of it; the next preview
    // runs its beat itself.
    const story = `scene A
  [[show backdrop room]]
  & error("boom")
  Line one.
  done
end
`;
    const h = await runAhead(story, 1);
    expect(gameNotices(h.messages).map((m) => m.method)).toEqual([]);
    h.reset();
    expect(h.game.preview("file://proj/deleted.sd", 1)).toBeNull();
    expect(gameNotices(h.messages).map((m) => m.method)).toEqual([]);
    // The story is put back where a game that never ran the beat stands: a
    // run left in place would sit past the beat, and the next preview of
    // its path would display it instead of running the beat itself.
    const untouched = createHarness(story, 1, { assets: ASSETS });
    await untouched.ready;
    expect(storyOf(h.game)).toEqual(storyOf(untouched.game));
    h.reset();
    h.preview(1);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(1);
    expect(imagesWritten(h.messages)).toEqual(["room.png"]);
  });

  it("completes the connect when the run throws out of a story step, and leaves the throw to the preview", async () => {
    // An error thrown out of a step, not a story error the runtime reports,
    // leaves the runtime counting the step as open, so the story cannot be
    // put back. The connect must still complete and release its gate; the
    // preview then runs the beat itself and meets the same throw.
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(pathAt(game, 3)!);
        // A throw from inside a step: past the point where the runtime
        // counts the continue as open, which is what leaves it unable to
        // cancel the line afterwards.
        const story: any = game.story;
        const original = story.ContinueSingleStep;
        let steps = 0;
        story.ContinueSingleStep = function () {
          steps += 1;
          if (steps === 2) {
            throw new TypeError("a step threw");
          }
          return original.call(this);
        };
      },
    });
    await h.ready;
    expect(byMethod(h.messages, "assets/release").at(-1)?.params).toEqual({
      pins: ["restore"],
      drop: false,
    });
    // Nothing of the run itself reaches the page; what does is the
    // runtime's own complaint, raised by the layouts' bindings as they
    // mount against a line the runtime still counts as open.
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(0);
    expect(() => h.preview(3)).toThrow();
  });

  it("puts a kept run back before the game starts, so play begins at the preview point", async () => {
    // A host that previews and then starts the same game must start where
    // the checkpoint left the story, not a beat past it.
    const checkpoint = checkpointFor(STORY, 5)!;
    const control = createHarness(STORY, 5, {
      assets: ASSETS,
      loadCheckpoint: checkpoint,
    });
    await control.ready;
    const h = await runAhead(STORY, 5, { checkpoint });
    control.game.start();
    h.game.start();
    expect(h.game.story.state.currentPathString).toEqual(
      control.game.story.state.currentPathString,
    );
    expect(imagesWritten(h.messages)).toEqual(imagesWritten(control.messages));
  });

  it("runs nothing ahead for a connect the page did not mark, and keeps a kept run for the preview", async () => {
    // A preview leaves the preview point set to the path it settled on. A
    // host that connects the same game again without marking (the game
    // worker does) gets a connect that runs nothing and gates nothing.
    const h = createHarness(STORY, 3, { assets: ASSETS });
    await h.ready;
    h.preview(3);
    h.reset();
    await h.game.module.assets.onConnected();
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(gameNotices(h.messages).map((m) => m.method)).toEqual([]);
  });

  it("drops a kept run when the program changes, and runs the beat of the new one", async () => {
    const h = await runAhead(STORY, 3);
    const edited = STORY.replace("Line two.", "Line two, edited.");
    const { program } = compileUI(edited, {
      experimentalDisplayCalls: true,
      assets: ASSETS,
    });
    h.game.updateProgram(program as any);
    h.reset();
    h.preview(3);
    // The line's text lands in a `ui/batch` of element updates.
    const shown = h.messages
      .filter((m) => m?.method?.startsWith("ui/"))
      .map((m) => JSON.stringify(m.params))
      .join("\n");
    expect(shown).toContain("Line two, edited.");
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("drops a kept run when a checkpoint is loaded, and continues from the checkpoint", async () => {
    // The run ahead jumped to the beat (no route); the checkpoint loaded
    // next is a route's, and the preview must continue from it.
    const h = await runAhead(STORY, 3);
    h.game.load(checkpointFor(STORY, 3)!);
    h.reset();
    h.preview(3);
    const executed = byMethod(h.messages, "game/executed");
    expect(executed).toHaveLength(1);
    expect(executed[0].params.simulation).toBe("success");
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("enters no scene again at preview after a run that spilled into the next one", async () => {
    // The run at connect crossed from A into B and observed B; the preview
    // displays that run and must not flip the tracker back to A, which
    // would predict A's whole scene again on the preview's own path.
    const h = createHarness(SHAPES["divert"]!, 1, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(pathAt(game, 1)!);
      },
    });
    await h.ready;
    h.reset();
    h.preview(1);
    expect(imagesWritten(h.messages)).toEqual(["bunny.png", "room.png"]);
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
  });

  it("keeps a run across a connect with no fresh mark, and runs again from the same place for one", async () => {
    // The route's checkpoint sits at the beat. A second connect with no new
    // mark leaves the kept run for the preview; a second connect for a new
    // mark puts the first run back and runs from the checkpoint again, not
    // from where the first run stopped.
    const checkpoint = checkpointFor(STORY, 5)!;
    expect(checkpoint).not.toBeNull();
    const h = await runAhead(STORY, 5, { checkpoint });
    h.reset();
    await h.game.module.assets.onConnected();
    await flushMicrotasks(20);
    // The checkpoint's own pictures are gated again; no beat runs, so no
    // second request.
    expect(byMethod(h.messages, "assets/load").map(itemKeys)).toEqual([
      [src("room")],
    ]);
    h.preview(5);
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    const again = await runAhead(STORY, 5, { checkpoint });
    again.reset();
    again.game.markPreviewing(pathAt(again.game, 5)!);
    await again.game.module.assets.onConnected();
    await flushMicrotasks(20);
    expect(byMethod(again.messages, "assets/load").map(itemKeys)).toEqual([
      [src("room")],
      [src("hat")],
    ]);
    expect(gameNotices(again.messages).map((m) => m.method)).toEqual([]);
    again.reset();
    again.preview(5);
    expect(imagesWritten(again.messages)).toEqual(["hat.png"]);
    expect(byMethod(again.messages, "game/executed")).toHaveLength(1);
  });

  it("displays a kept run even when the preview's memo says the path was previewed", async () => {
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
      },
    });
    await h.ready;
    (h.game as any)._previewedPath = beatShowing(h.game, "A", "bunny");
    h.reset();
    h.preview(3);
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("keeps nothing from a run that threw, so the preview runs the beat itself", async () => {
    const h = createHarness(STORY, 3, {
      assets: ASSETS,
      holdAssets: true,
      beforeConnect: (game) => {
        game.markPreviewing(beatShowing(game, "A", "bunny"));
        const original = (game as any).runPreview;
        let first = true;
        (game as any).runPreview = function (path: string) {
          if (first) {
            first = false;
            throw new Error("the runtime threw out of the run");
          }
          return original.call(this, path);
        };
      },
    });
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    h.releaseAssets();
    await h.ready;
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    h.reset();
    h.preview(3);
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
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
