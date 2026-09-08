import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it, vi } from "vitest";
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
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

// What a preview loads and waits for (#429, #434): the beat under the cursor
// waits for exactly the pictures it writes, whatever the source looks like,
// since the preview runs the beat and holds what it flushed until those
// pictures are resident, then writes it all together; the checkpoint's own
// pictures are gated by the connect; the window around the cursor warms
// first and the rest of the scene behind it, once per scene; and the window
// follows the cursor without being sent for every beat.

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
  asset("font", "Fancy", "ttf"),
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

/** Everything the page is told about the layouts and the beat: the
 *  messages that write or update the screen. */
const screenMessages = (messages: any[]) =>
  messages.filter((m) => m?.method?.startsWith("ui/"));

/** The screen operations, with the `ui/batch` envelopes opened. */
const screenOps = (messages: any[]) =>
  screenMessages(flattenMessages(messages));

/** Whether a screen operation is about a choice target: the interpreter's
 *  target `choice 0`, or the element named after it, `choice_0`. */
const aboutChoice = (m: any) => /choice[ _]\d/.test(JSON.stringify(m));

/** What clearing a choice the last beat presented sends for its target:
 *  the text and the picture cleared (an update and a write each), the
 *  click observer gone (an update and the unobserve), the element hidden
 *  (an update). */
const CLEAR_OPS_PER_CHOICE: Record<string, number> = {
  "ui/update": 4,
  "ui/write-text": 1,
  "ui/write-image": 1,
  "ui/unobserve": 1,
};

/** What clearing `n` choices sends, counted by method. */
const clearOpsFor = (n: number): Record<string, number> =>
  Object.fromEntries(
    Object.entries(CLEAR_OPS_PER_CHOICE).map(([method, count]) => [
      method,
      count * n,
    ]),
  );

/** The methods of the given operations, counted. */
const countMethods = (ops: any[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const op of ops) {
    counts[op.method] = (counts[op.method] ?? 0) + 1;
  }
  return counts;
};

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
 *  breakpoint, a budget). */
type Arrival = {
  simulation?: "fail";
  checkpoint?: string;
  prepare?: (game: Game) => void;
};

/** A game connected the way the page connects one for a preview at `line`:
 *  the point marked, the checkpoint loaded, every load request held until
 *  `releaseAssets()` answers it. */
const connected = (story: string, line: number, arrival: Arrival = {}) =>
  createHarness(story, line, {
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

/**
 * What the connect and the preview at `line` ask the page for, and what
 * each then writes. `restore` is the connect's gate (the checkpoint's
 * pictures, by request), `restored` what the connect wrote; `gate` the
 * preview's requests while it waits, `before` what the beat wrote to the
 * screen while the preview waited (none, or the wait is not a gate), or
 * "no wait" for a preview with nothing to wait for, which writes its beat
 * at once, `written` what the preview wrote once the page answered,
 * `prefetches` how many prefetches the preview sent before it was
 * answered.
 */
const previewGate = async (
  story: string,
  line: number,
  arrival: Arrival = {},
) => {
  const h = connected(story, line, arrival);
  await flushMicrotasks(20);
  const restore = byMethod(h.messages, "assets/load").map((m) =>
    itemKeys(m).map(fileOf).sort(),
  );
  h.releaseAssets();
  await h.ready;
  const restored = imagesWritten(h.messages);
  h.reset();
  const previewing = h.preview(line);
  await flushMicrotasks(20);
  const gate = byMethod(h.messages, "assets/load").map((m) => ({
    pin: m.params.pin,
    priority: m.params.priority,
    files: itemKeys(m).map(fileOf).sort(),
  }));
  const waited = gate.length > 0;
  const before = waited ? screenOps(h.messages) : "no wait";
  const prefetches = byMethod(h.messages, "assets/prefetch").length;
  h.releaseAssets();
  await previewing;
  const written = imagesWritten(h.messages);
  return {
    h,
    restore,
    restored,
    gate,
    gated: [...new Set(gate.flatMap((g) => g.files))].sort(),
    before,
    written,
    prefetches,
  };
};

describe("preview prediction and gate", () => {
  it("waits to write the beat until the pictures it shows are resident, then writes them together", async () => {
    // Line 3 is `[[show portrait bunny]]`; line 4, `Line two.`, displays on
    // its own before `hat` on line 5.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const previewing = h.preview(3);
    await flushMicrotasks(20);
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params.pin).toBe("preview:1");
    expect(load[0].params.priority).toBe(0);
    expect(itemKeys(load[0])).toEqual([src("bunny")]);
    // Nothing of the beat reaches the screen while the page loads: no
    // picture, no line, no layout update; and the preview has not settled.
    expect(screenMessages(h.messages)).toEqual([]);
    expect(await settled(previewing)).toBe(false);
    h.releaseAssets();
    // Once the page answers, the preview settles (a wait that never ends
    // fails this test by its timeout) and writes the beat: its picture and
    // its line, then the pin goes.
    expect(await previewing).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
    expect(byMethod(h.messages, "assets/release").at(-1)?.params).toEqual({
      pins: ["preview:1"],
      drop: false,
    });
    // The execution report follows the writes, as it does in play, and the
    // preview notice follows it.
    const methods = h.messages.map((m) => m.method);
    expect(methods.indexOf("ui/write-image")).toBeLessThan(
      methods.indexOf("game/executed"),
    );
    expect(methods.indexOf("game/executed")).toBeLessThan(
      methods.indexOf("game/previewed"),
    );
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("gates exactly what the preview writes, whatever the source shape", async () => {
    // Beat lines: 1, 3, 5 in the alternating and blank shapes; 1, 2, 4 in
    // the consecutive one; 1 and 3 in the hide shape; 2 and 6 with control
    // flow between. Line 0 is the scene heading. A jump to a line runs from
    // that line's path, so a backdrop on the line above is not written.
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
      const got = await previewGate(SHAPES[shape]!, line);
      expect({ shape, line, gated: got.gated }).toEqual({
        shape,
        line,
        gated: expected,
      });
      expect({ shape, line, written: got.written }).toEqual({
        shape,
        line,
        written: expected,
      });
      expect({ shape, line, before: got.before }).toEqual({
        shape,
        line,
        before: expected.length > 0 ? [] : "no wait",
      });
    }
  });

  it("gates the checkpoint's pictures at connect and the beat's at preview, from a route's checkpoint", async () => {
    // The page loads the checkpoint the route simulation built for the
    // cursor's line before it connects, and the preview continues from it
    // rather than jumping. Each row gives the connect's request (the
    // pictures the checkpoint restores), what the connect wrote, the
    // preview's request (the pictures the beat writes), and what the
    // preview wrote. A route runs from the top of the cursor's scene, so a
    // checkpoint in scene B restores nothing scene A showed; and a portrait
    // shows only with the beat that writes it (the connect clears the
    // target), so a checkpoint taken after a portrait beat restores the
    // backdrop alone and the previous beat's portrait is not waited for.
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
      ["alternating", SHAPES["alternating"]!, 1, [], [], ["room.png"]],
      ["alternating", SHAPES["alternating"]!, 3, [["room.png"]], ["room.png"], ["bunny.png"]],
      ["alternating", SHAPES["alternating"]!, 5, [["room.png"]], ["room.png"], ["hat.png"]],
      ["consecutive", SHAPES["consecutive"]!, 1, [], [], ["bunny.png", "room.png"]],
      ["consecutive", SHAPES["consecutive"]!, 4, [["room.png"]], ["room.png"], ["hat.png"]],
      ["hide", SHAPES["hide"]!, 3, [], [], ["bunny.png", "room.png"]],
      ["divert", SHAPES["divert"]!, 6, [], [], ["bunny.png"]],
      ["textAbove", SHAPES["textAbove"]!, 1, [], [], []],
      ["textAbove", SHAPES["textAbove"]!, 3, [], [], ["bunny.png"]],
      ["seven", SHAPES["seven"]!, 8, [], [], seven],
      ["story", STORY, 10, [["room.png"]], ["room.png"], ["cat.png"]],
      ["story", STORY, 18, [], [], ["room2.png"]],
    ];
    for (const [shape, source, line, restore, restored, written] of cases) {
      const checkpoint = checkpointFor(source, line);
      expect({ shape, line, checkpoint: checkpoint != null }).toEqual({
        shape,
        line,
        checkpoint: true,
      });
      const got = await previewGate(source, line, { checkpoint: checkpoint! });
      expect({
        shape,
        line,
        restore: got.restore,
        restored: got.restored,
        gated: got.gated,
        written: got.written,
        before: got.before,
      }).toEqual({
        shape,
        line,
        restore,
        restored,
        gated: written,
        written,
        before: written.length > 0 ? [] : "no wait",
      });
    }
  });

  it("sends no prefetch of its own for the beat while it waits, whatever the beat shows", async () => {
    // The scene's window went out when the connect entered the scene; the
    // preview's run enters a scene only when its beat runs into one (the
    // divert shape). The interpreter's own prefetch of the names it parses
    // would add to these and start the gate's pictures in a background slot
    // first.
    const cases: Array<[string, number, number]> = [
      ["alternating", 3, 0],
      ["consecutive", 1, 0],
      ["seven", 1, 0],
      ["divert", 1, 1],
    ];
    for (const [shape, line, expected] of cases) {
      const { prefetches } = await previewGate(SHAPES[shape]!, line);
      expect({ shape, line, prefetches }).toEqual({
        shape,
        line,
        prefetches: expected,
      });
    }
  });

  it("writes a beat with no picture at once, before the preview returns", async () => {
    const h = connected(SHAPES["textAbove"]!, 1);
    await h.ready;
    h.reset();
    const previewing = h.preview(1);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line one.");
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(await previewing).toBe(pathAt(h.game, 1));
  });

  it("updates a binding the beat changes with the beat's writes, not while it waits", async () => {
    const story = `store hp = 100

layout hud
  text
    text = "HP {hp}"

scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  & hp = 50
  Line two.
  done
end
`;
    // Line 9 is the portrait's line; its beat sets `hp` and shows the line.
    const h = connected(story, 9);
    await h.ready;
    h.reset();
    const previewing = h.preview(9);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    expect(JSON.stringify(screenMessages(h.messages))).not.toContain("HP 50");
    h.releaseAssets();
    await previewing;
    const screen = JSON.stringify(screenMessages(h.messages));
    expect(screen).toContain("HP 50");
    expect(screen).toContain("Line two.");
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  // A beat of choices on line 2, and the portrait's beat on line 11.
  const CHOICES = `scene A
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
  [[show portrait bunny]]
  Line two.
  done
end
`;

  // The same choices in scene A, and the portrait's beat at the top of
  // scene B (line 12), which a route from B's start reaches.
  const CROSS_CHOICES = `scene A
  [[show backdrop room]]
  Pick a fruit:
  choose
    + (a) Apple
      -> B
    + (b) Banana
      -> B
  end
end

scene B
  [[show portrait bunny]]
  Line two.
  done
end
`;

  /** The messages' methods, each with the pin it names, for order checks. */
  const pinnedMethods = (messages: any[]) =>
    messages.map(
      (m) =>
        `${m.method}:${m.params?.pin ?? m.params?.pins?.join(",") ?? ""}`,
    );

  it("clears the choices the last preview showed as the next preview starts, after its gate's request and before its wait", async () => {
    // The choices go before the wait, so none of them can be clicked while
    // the beat's pictures load: a click would reach a story that has
    // jumped away from them. They go after the beat's own request, so that
    // request is the first thing out; they are exactly the two choices
    // shown, and nothing else reaches the screen before the page answers.
    const h = connected(CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    await h.preview(2);
    expect(byMethod(h.messages, "game/awaitingInteraction")).toHaveLength(1);
    expect(
      byMethod(screenOps(h.messages).filter(aboutChoice), "ui/observe").map(
        (m) => m.params.event,
      ),
    ).toEqual(["click", "click"]);
    h.reset();
    const previewing = h.preview(11);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    const ops = screenOps(h.messages);
    expect(countMethods(ops)).toEqual(clearOpsFor(2));
    expect(ops.every(aboutChoice)).toBe(true);
    expect(
      byMethod(ops, "ui/unobserve").map((m) => m.params.event),
    ).toEqual(["click", "click"]);
    const methods = h.messages.map((m) => m.method);
    expect(methods.indexOf("assets/load")).toBeLessThan(
      methods.findIndex((m) => m.startsWith("ui/")),
    );
    h.releaseAssets();
    await previewing;
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
  });

  it("clears the choices the last preview showed on the checkpoint route too", async () => {
    // The ordinary route: the compile worker's checkpoint is loaded and the
    // preview continues from it. The checkpoint's own state holds no
    // choices, yet the ones the last preview showed are still on the page,
    // so the game remembers them and clears exactly those.
    const h = connected(CROSS_CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    await h.preview(2);
    expect(byMethod(h.messages, "game/awaitingInteraction")).toHaveLength(1);
    const checkpoint = checkpointFor(CROSS_CHOICES, 12);
    expect(checkpoint).not.toBeNull();
    h.game.load(checkpoint!);
    h.reset();
    const previewing = h.preview(12);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map(itemKeys)).toEqual([
      [src("bunny")],
    ]);
    const ops = screenOps(h.messages);
    expect(countMethods(ops)).toEqual(clearOpsFor(2));
    expect(ops.every(aboutChoice)).toBe(true);
    h.releaseAssets();
    await previewing;
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
  });

  it("sends no clears for choices the connect has already taken off the page", async () => {
    // The page connects the game again before every preview. The connect
    // clears every transient target, the choice slots among them, out of
    // the page and out of the module's state, so the restore does not bring
    // them back and the preview after it has nothing to clear.
    const h = connected(CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    await h.preview(2);
    h.reset();
    await h.reconnect();
    await flushMicrotasks(20);
    const choiceWrites = byMethod(
      screenOps(h.messages).filter(aboutChoice),
      "ui/write-text",
    );
    expect(choiceWrites.length).toBeGreaterThan(0);
    expect(
      choiceWrites.every((m) => m.params.instructions.length === 0),
    ).toBe(true);
    h.reset();
    const previewing = h.preview(11);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    expect(screenMessages(h.messages)).toEqual([]);
    h.releaseAssets();
    await previewing;
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("clears the choices the last preview showed even when the beat that replaces them stops at a breakpoint", async () => {
    const h = connected(CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    await h.preview(2);
    // Line 12 is `Line two.`, inside the portrait's beat.
    h.game.setBreakpoints([{ file: MAIN_URI, line: 12 }]);
    h.reset();
    expect(await h.preview(11)).toBe(pathAt(h.game, 11));
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(1);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    const ops = screenOps(h.messages);
    expect(countMethods(ops)).toEqual(clearOpsFor(2));
    expect(ops.every(aboutChoice)).toBe(true);
    // A preview after a beat that presented no choices (line 12's, text
    // alone) clears nothing.
    h.game.setBreakpoints([]);
    h.reset();
    await h.preview(12);
    h.reset();
    const previewing = h.preview(11);
    await flushMicrotasks(20);
    expect(screenMessages(h.messages)).toEqual([]);
    h.releaseAssets();
    await previewing;
  });

  it("stops at a breakpoint inside the beat as play does: nothing written, nothing gated, the stop reported", async () => {
    const h = connected(STORY, 3, {
      prepare: (game) => game.setBreakpoints([{ file: MAIN_URI, line: 4 }]),
    });
    await h.ready;
    h.reset();
    expect(await h.preview(3)).toBe(pathAt(h.game, 3));
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(1);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(byMethod(h.messages, "game/runtimeError")).toHaveLength(0);
    expect(imagesWritten(h.messages)).toEqual([]);
  });

  it("reports a runaway beat's budget once, and writes nothing", async () => {
    const h = connected(
      `scene A
  [[show backdrop room]]
  -> A
end
`,
      1,
      {
        prepare: (game) => {
          (game as any)._executionStepLimit = 400;
        },
      },
    );
    await h.ready;
    h.reset();
    await h.preview(1);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    const errors = byMethod(h.messages, "game/runtimeError");
    expect(errors).toHaveLength(1);
    expect(errors[0].params.message).toContain("possible infinite loop");
    expect(imagesWritten(h.messages)).toEqual([]);
  });

  it("reports a runtime error in the beat once, with the beat", async () => {
    const h = connected(
      `scene A
  [[show backdrop room]]
  & error("boom")
  Line one.
  done
end
`,
      1,
    );
    await h.ready;
    h.reset();
    const previewing = h.preview(1);
    await flushMicrotasks(20);
    h.releaseAssets();
    await previewing;
    const errors = byMethod(h.messages, "game/runtimeError");
    expect(errors).toHaveLength(1);
    expect(errors[0].params.message).toContain("boom");
    expect(imagesWritten(h.messages)).toEqual(["room.png"]);
  });

  it("lets a preview that starts while another waits take over", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const second = h.preview(5);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map(itemKeys)).toEqual([
      [src("bunny")],
      [src("hat")],
    ]);
    // The first preview's wait ends at once, and its pin goes right after
    // the second's request: not before, which would let the page's
    // background queue start loads beside the second's picture, and not
    // when the first's own wait would have ended.
    expect(await first).toBeNull();
    const order = pinnedMethods(h.messages);
    expect(order.indexOf("assets/release:preview:1")).toBe(
      order.indexOf("assets/load:preview:2") + 1,
    );
    h.releaseAssets();
    expect(await second).toBe(pathAt(h.game, 5));
    // Only the later beat is written; each preview releases its own pin.
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
    expect(
      byMethod(h.messages, "assets/release")
        .map((m) => m.params.pins)
        .sort(),
    ).toEqual([["preview:1"], ["preview:2"]]);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("previews the same path once, and again after a recompile", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.releaseAssets();
    await first;
    h.reset();
    expect(await h.preview(3)).toBe(pathAt(h.game, 3));
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    const { program } = compileUI(STORY.replace("Line two.", "Line two, edited."), {
      experimentalDisplayCalls: true,
      assets: ASSETS,
    });
    h.game.updateProgram(program as any);
    h.reset();
    const again = h.preview(3);
    await flushMicrotasks(20);
    h.releaseAssets();
    await again;
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(JSON.stringify(screenMessages(h.messages))).toContain(
      "Line two, edited.",
    );
  });

  it("settles a repeat of the point whose preview is waiting with that preview", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const second = h.preview(3);
    expect(await settled(second)).toBe(false);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    h.releaseAssets();
    expect(await first).toBe(pathAt(h.game, 3));
    expect(await second).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("displays the beat when the restore timeout elapses before the page answers", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const previewing = h.preview(3);
    await flushMicrotasks(20);
    expect(h.timerDelays()).toEqual([2000]);
    h.flushTimers();
    expect(await previewing).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
    // The page's late answer changes nothing.
    const count = h.messages.length;
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(h.messages.length).toBe(count);
  });

  it("displays nothing for a preview that PLAY interrupts, and lets its pin go at once", async () => {
    // Without this the beat would be written over the running game once
    // the page answered, and the game left without its coordinator.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const previewing = h.preview(3);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    h.game.start();
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toContainEqual(["preview:1"]);
    expect(await previewing).toBeNull();
    const count = h.messages.length;
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(h.messages.length).toBe(count);
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("displays nothing for a preview a checkpoint load interrupts, and previews the point again when asked", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const previewing = h.preview(3);
    await flushMicrotasks(20);
    h.game.load(checkpointFor(STORY, 10)!);
    expect(await previewing).toBeNull();
    // The abandoned pin waits for the next gate's request.
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
    // The page loads the checkpoint for the line the cursor moved to, and
    // previews that line: the preview continues from the checkpoint to the
    // beat, which shows `cat` on line 10, and the abandoned pin goes right
    // after that beat's request.
    const again = h.preview(10);
    await flushMicrotasks(20);
    const order = pinnedMethods(h.messages);
    expect(order.indexOf("assets/release:preview:1")).toBe(
      order.indexOf("assets/load:preview:2") + 1,
    );
    h.releaseAssets();
    expect(await again).toBe(pathAt(h.game, 10));
    expect(imagesWritten(h.messages)).toEqual(["cat.png"]);
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(1);
  });

  it("displays nothing for a preview a recompile interrupts, and previews the point again on the new program", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const { program } = compileUI(STORY.replace("Line two.", "Line two, edited."), {
      experimentalDisplayCalls: true,
      assets: ASSETS,
    });
    h.game.updateProgram(program as any);
    expect(await first).toBeNull();
    // No gate follows a recompile by itself, so the abandoned pin goes when
    // its own load settles.
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
    expect(screenMessages(h.messages)).toEqual([]);
    h.reset();
    const again = h.preview(3);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map((m) => m.params.pin)).toEqual(
      ["preview:2"],
    );
    h.releaseAssets();
    expect(await again).toBe(pathAt(h.game, 3));
    expect(JSON.stringify(screenMessages(h.messages))).toContain(
      "Line two, edited.",
    );
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("displays nothing for a preview the game's destruction interrupts, and lets its pin go with the game", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const previewing = h.preview(3);
    await flushMicrotasks(20);
    h.game.destroy();
    expect(
      byMethod(h.messages, "assets/release").flatMap((m) => m.params.pins),
    ).toContain("preview:1");
    expect(await previewing).toBeNull();
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("previews the same point again after a load interrupts its wait", async () => {
    // A load replaces the state the waiting preview would have displayed
    // into; the point is not remembered as previewed, so asking for it
    // again runs it again.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.game.load(checkpointFor(STORY, 3)!);
    expect(await first).toBeNull();
    h.reset();
    const again = h.preview(3);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map((m) => m.params.pin)).toEqual(
      ["preview:2"],
    );
    h.releaseAssets();
    expect(await again).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(1);
  });

  it("displays nothing for a preview a connect interrupts", async () => {
    // The page connects before every preview; a preview waiting from
    // before the connect would display its beat over the restored state.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const late: any[] = [];
    void h.game.connect((message) => late.push(message));
    expect(await first).toBeNull();
    h.releaseAssets();
    await flushMicrotasks(20);
    // The connect's own traffic clears the transient targets (empty
    // writes); the abandoned beat's line and picture never land.
    expect(
      late.filter(
        (m) =>
          (m.method?.startsWith("ui/write") &&
            (m.params?.instructions?.length ?? 0) > 0) ||
          m.method === "game/previewed",
      ),
    ).toEqual([]);
    expect(JSON.stringify(late)).not.toContain("Line two.");
    // The connect asked for no gate of its own (nothing to restore), so the
    // abandoned pin goes when its own load settles.
    expect(
      byMethod(late, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
  });

  it("displays nothing for a preview a reset interrupts", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.game.reset();
    expect(await first).toBeNull();
    const count = h.messages.length;
    h.releaseAssets();
    await flushMicrotasks(20);
    // Only the abandoned pin's release, when its load settles.
    expect(h.messages.slice(count).map((m) => m.method)).toEqual([
      "assets/release",
    ]);
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("repaints the layouts at once for a handler that runs while the beat waits, and keeps its work out of the beat's report", async () => {
    const story = `store hp = 100
function heal()
  hp = hp + 5
end
layout hud with
  text "HP: {hp}"
  button "Heal" @click=heal
end

scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  Line two.
  done
end
`;
    // Line 12 is the portrait's line.
    const h = connected(story, 12);
    await h.ready;
    const button = h.observedElementIds()[0];
    expect(button).toBeTruthy();
    h.reset();
    const previewing = h.preview(12);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    h.emitEvent("click", button!);
    await flushMicrotasks(20);
    expect(JSON.stringify(screenOps(h.messages))).toContain("HP: 105");
    h.releaseAssets();
    await previewing;
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
    const reports = byMethod(h.messages, "game/executed");
    expect(reports).toHaveLength(1);
    expect(
      reports[0].params.executedPaths.filter((p: string) =>
        p.startsWith("heal"),
      ),
    ).toEqual([]);
  });

  it("waits without a clock when `restore_timeout` is 0, until the page answers or a later preview takes over", async () => {
    // The config block moves the story down four lines: the portrait is on
    // line 7 and `hat` on line 9.
    const story = `define assets as config with\n  restore_timeout = 0\nend\n\n${STORY}`;
    const h = connected(story, 7);
    await h.ready;
    h.reset();
    const first = h.preview(7);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map(itemKeys)).toEqual([
      [src("bunny")],
    ]);
    expect(h.timerDelays()).toEqual([]);
    expect(await settled(first)).toBe(false);
    const second = h.preview(9);
    expect(await first).toBeNull();
    h.releaseAssets();
    expect(await second).toBe(pathAt(h.game, 9));
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
  });

  it("warns of no timeout for a preview that was taken over", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const h = connected(STORY, 3);
      await h.ready;
      h.reset();
      const first = h.preview(3);
      await flushMicrotasks(20);
      const second = h.preview(5);
      await flushMicrotasks(20);
      expect(await first).toBeNull();
      // Both gates' clocks run out: the abandoned one settles silently,
      // the live one displays its beat anyway and says so.
      h.flushTimers();
      expect(await second).toBe(pathAt(h.game, 5));
      expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
      const warnings = warn.mock.calls.map((call) => String(call[0]));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("hat");
      expect(warnings[0]).not.toContain("bunny");
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps the abandoned pin through a connect's own gates, and lets it go with the next beat's", async () => {
    // A real project's main layout has fonts, so the page's connect issues
    // a gate of its own before the next beat's picture is asked for. That
    // gate settles first; the abandoned pin must outlive it, or the page's
    // background queue restarts between the two and shares the worker with
    // the next portrait.
    const story = `style main with\n  font_family = "Fancy"\nend\n\n${STORY}`;
    // The style block moves the story down four lines: bunny on 7, hat on 9.
    const h = connected(story, 7);
    await flushMicrotasks(20);
    expect(h.releaseAssets("layout:main")).toBe(1);
    await h.ready;
    h.reset();
    const first = h.preview(7);
    await flushMicrotasks(20);
    expect(pinnedMethods(byMethod(h.messages, "assets/load"))).toEqual([
      "assets/load:preview:1",
    ]);
    void h.reconnect();
    await flushMicrotasks(20);
    expect(await first).toBeNull();
    expect(pinnedMethods(h.messages)).toContain("assets/load:layout:main");
    const released = () =>
      byMethod(h.messages, "assets/release").flatMap((m) => m.params.pins);
    // The connect releases its own restore pin; the abandoned one stays.
    expect(released()).not.toContain("preview:1");
    expect(h.releaseAssets("layout:main")).toBe(1);
    await flushMicrotasks(20);
    expect(released()).not.toContain("preview:1");
    const second = h.preview(9);
    await flushMicrotasks(20);
    const order = pinnedMethods(h.messages);
    expect(order.indexOf("assets/release:preview:1")).toBe(
      order.indexOf("assets/load:preview:2") + 1,
    );
    h.releaseAssets();
    expect(await second).toBe(pathAt(h.game, 9));
    expect(imagesWritten(h.messages)).toEqual(["hat.png"]);
  });

  it("lets the abandoned pin go at once when the beat that takes over needs no picture", async () => {
    // Line 4 is `Line two.` alone: no gate, so nothing for the abandoned
    // pin to protect, and the page's prefetching must not stay paused
    // behind a picture nobody waits for.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const second = h.preview(4);
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
    expect(await first).toBeNull();
    expect(await second).toBe(pathAt(h.game, 4));
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(1);
  });

  it("displays nothing for a preview a debug step interrupts", async () => {
    // A step advances the story one element from where the held beat left
    // it; stepping on to the next beat displays that beat, and the held
    // beat's line never lands.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    for (let steps = 0; steps < 100 && !h.game.step(); steps++) {
      // The step that reaches the next beat's flush returns true.
    }
    expect(await first).toBeNull();
    h.releaseAssets();
    await flushMicrotasks(20);
    const screen = JSON.stringify(screenMessages(h.messages));
    expect(screen).toContain("Line three.");
    expect(screen).not.toContain("Line two.");
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("displays nothing for a preview a call for an unknown point interrupts", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    expect(await h.game.preview("file://proj/deleted.sd", 3)).toBeNull();
    expect(await first).toBeNull();
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(JSON.stringify(screenMessages(h.messages))).not.toContain(
      "Line two.",
    );
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("previews the same point again after a load with nothing waiting", async () => {
    // A load replaces the state the last preview displayed into, whether
    // or not a preview is waiting, so the point is not remembered as
    // previewed.
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.releaseAssets();
    expect(await first).toBe(pathAt(h.game, 3));
    h.game.load(checkpointFor(STORY, 3)!);
    h.reset();
    const again = h.preview(3);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load").map((m) => m.params.pin)).toEqual(
      ["preview:2"],
    );
    h.releaseAssets();
    expect(await again).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
  });

  it("settles a repeat of the point a later preview took over with, with that preview", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    const second = h.preview(5);
    await flushMicrotasks(20);
    const third = h.preview(5);
    expect(await settled(third)).toBe(false);
    expect(await first).toBeNull();
    h.releaseAssets();
    expect(await second).toBe(pathAt(h.game, 5));
    expect(await third).toBe(pathAt(h.game, 5));
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
  });

  it("remembers the choices play presents, and forgets them once a path is chosen", async () => {
    // Play records the choices at the beat's flush; a chosen path takes
    // them off the page through the coordinator's own handler.
    const h = connected(CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    h.reset();
    h.game.start();
    await flushMicrotasks(20);
    expect(
      byMethod(screenOps(h.messages).filter(aboutChoice), "ui/observe").map(
        (m) => m.params.event,
      ),
    ).toEqual(["click", "click"]);
    h.reset();
    h.game.clearChoices();
    await flushMicrotasks(20);
    expect(countMethods(screenOps(h.messages))).toEqual(clearOpsFor(2));

    const g = connected(CHOICES, 2);
    await g.ready;
    g.releaseAssets();
    g.reset();
    g.game.start();
    await flushMicrotasks(20);
    const choice = g.observedElementIds().find((id) => id.includes("choice"));
    expect(choice).toBeTruthy();
    g.emitEvent("click", choice!, { button: 0 });
    await flushMicrotasks(20);
    expect(byMethod(g.messages, "game/chosePathToContinue")).toHaveLength(1);
    g.reset();
    g.game.clearChoices();
    await flushMicrotasks(20);
    expect(screenOps(g.messages)).toEqual([]);
  });

  it("sets the beat's changes aside for the wait, so a handler repaints only what it changed itself", async () => {
    const story = `store hp = 100
store pings = 0
function ping()
  pings = pings + 1
end
function heal()
  hp = hp + 5
end
layout hud with
  text "HP {hp}"
  text "P {pings}"
  button "Ping" @click=ping
  button "Heal" @click=heal
end

scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  & hp = 50
  Line two.
  Line three.
  done
end
`;
    // Line 18 is the portrait's line; its beat sets `hp` to 50.
    const h = connected(story, 18);
    await h.ready;
    const [ping, heal] = h.observedElementIds();
    expect(ping && heal).toBeTruthy();
    h.reset();
    const previewing = h.preview(18);
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(1);
    // A handler that changes something else repaints that alone: the
    // beat's `hp` stays at what the screen shows until the beat lands.
    h.emitEvent("click", ping!);
    await flushMicrotasks(20);
    const during = JSON.stringify(screenOps(h.messages));
    expect(during).toContain("P 1");
    expect(during).not.toContain("HP 50");
    expect(during).not.toContain("Line two.");
    // A handler that changes what the beat changed repaints it with the
    // beat's value, since that is the state.
    h.emitEvent("click", heal!);
    await flushMicrotasks(20);
    expect(JSON.stringify(screenOps(h.messages))).toContain("HP 55");
    expect(JSON.stringify(screenOps(h.messages))).not.toContain("Line two.");
    h.releaseAssets();
    await previewing;
    const after = JSON.stringify(screenOps(h.messages));
    expect(after).toContain("Line two.");
    // A preview taken over instead hands its changes back to the story's
    // change set, so the next display paints the state as it is. A debug
    // step keeps the state and displays the next beat: `hp` is still 50
    // and that beat's display shows it (without the hand-back the screen
    // would keep the stale 100).
    const g = connected(story, 18);
    await g.ready;
    g.reset();
    const first = g.preview(18);
    await flushMicrotasks(20);
    for (let steps = 0; steps < 100 && !g.game.step(); steps++) {
      // The step that reaches the next beat's flush returns true.
    }
    expect(await first).toBeNull();
    const taken = JSON.stringify(screenOps(g.messages));
    expect(taken).toContain("Line three.");
    expect(taken).toContain("HP 50");
    expect(taken).not.toContain("Line two.");
  });

  it("gates nothing for a cursor inside a function, whose body a preview cannot run to a picture", async () => {
    // A function's body has no scene to run in: entered from its start, it
    // runs out of content before it displays anything, and the preview
    // reports that as the runtime does. The gate follows the writes, which
    // hold no picture.
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
    const h = createHarness(story, 1, { assets: ASSETS, holdAssets: true });
    await h.ready;
    h.reset();
    const path = pathAt(h.game, 1);
    expect(path).toMatch(/^greet\./);
    h.game.markPreviewing(path!);
    expect(await h.preview(1)).toBe(path);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(imagesWritten(h.messages)).toEqual([]);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(1);
    expect(
      byMethod(h.messages, "game/runtimeError").map((m) => m.params.message),
    ).toEqual([expect.stringContaining("ran out of content")]);
  });

  it("previews nothing for a point the program does not know, and reveals the layouts", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    expect(await h.game.preview("file://proj/deleted.sd", 3)).toBeNull();
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
    // A jump to a line between beats writes that line and no picture.
    const between = await previewGate(SHAPES["alternating"]!, 2);
    expect(between.gated).toEqual([]);
    expect(between.written).toEqual([]);
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
