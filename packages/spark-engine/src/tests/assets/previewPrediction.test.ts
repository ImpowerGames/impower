import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { expandLineRanges } from "../../game/core/utils/executedLineRanges";
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

const asset = (type: string, name: string, ext: string): File => ({
  uri: `inmemory:///${name}.${ext}`,
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

const SHAPES: Record<string, string> = {
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
  consecutive: `scene A
  [[show backdrop room]]
  [[show portrait bunny]]
  Line one.
  [[show portrait hat]]
  Line two.
  done
end
`,
  blank: `scene A
  [[show backdrop room]]

  [[show portrait bunny]]

  [[show portrait hat]]
  Line one.
  done
end
`,
  hide: `scene A
  [[show backdrop room]]
  [[hide portrait]]
  [[show portrait bunny]]
  Line one.
  done
end
`,
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
  textAbove: `scene A
  Line one.
  [[show portrait bunny]]
  Line two.
  done
end
`,
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

const beatShowing = (
  game: Game,
  flow: string,
  image: string,
): ProgramAddress => {
  const beats = game.program.sceneAssets![flow]!.beats;
  const beat = beats.find((b) => b.image?.includes(image));
  if (!beat) {
    throw new Error(`no beat in ${flow} shows ${image}`);
  }
  return beat.address;
};

const pathAt = (game: Game, line: number): ProgramAddress | null =>
  programLocator(game.program).addressAt(MAIN_URI, line, { beat: "last" }) ??
  null;

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

const screenMessages = (messages: any[]) =>
  messages.filter((m) => m?.method?.startsWith("ui/"));

const screenOps = (messages: any[]) =>
  screenMessages(flattenMessages(messages));

const aboutChoice = (m: any) => /choice[ _]\d/.test(JSON.stringify(m));

const CLEAR_OPS_PER_CHOICE: Record<string, number> = {
  "ui/update": 4,
  "ui/write-text": 1,
  "ui/write-image": 1,
  "ui/unobserve": 1,
};

const clearOpsFor = (n: number): Record<string, number> =>
  Object.fromEntries(
    Object.entries(CLEAR_OPS_PER_CHOICE).map(([method, count]) => [
      method,
      count * n,
    ]),
  );

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

const checkpointFor = (story: string, line: number): string | null => {
  const { program } = compileUI(story, {
    assets: ASSETS,
  });
  const sim: any = new Game({
    program: program as any,
    now: () => 0,
    setTimeout: syncTimeout,
  } as any);
  sim.setStartFrom({ file: MAIN_URI, line });
  const to = sim.startAddress!;
  const from = sim.routeStartOf(to);
  const route = Game.planRoute(sim.story, program as any, from, to);
  return route ? sim.patchAndSimulateRoute(route) : null;
};

type Arrival = {
  simulation?: "fail";
  checkpoint?: string;
  prepare?: (game: Game) => void;
};

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
    expect(screenMessages(h.messages)).toEqual([]);
    expect(await settled(previewing)).toBe(false);
    h.releaseAssets();
    expect(await previewing).toBe(pathAt(h.game, 3));
    expect(imagesWritten(h.messages)).toEqual(["bunny.png"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain("Line two.");
    expect(byMethod(h.messages, "assets/release").at(-1)?.params).toEqual({
      pins: ["preview:1"],
      drop: false,
    });
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
    const cases: Array<[string, number, string[]]> = [
      ["alternating", 0, ["room.png"]],
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

  const ROUTED_CHOICES = `scene A
  [[show backdrop room]]
  Pick a fruit:
  choose
    + (a) Apple
      You chose apple.
    + (b) Banana
      You chose banana.
  end
  [[show portrait bunny]]
  Line two.
  done
end
`;

  const pinnedMethods = (messages: any[]) =>
    messages.map(
      (m) =>
        `${m.method}:${m.params?.pin ?? m.params?.pins?.join(",") ?? ""}`,
    );

  it("clears the choices the last preview showed as the next preview starts, after its gate's request and before its wait", async () => {
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
    h.game.setBreakpoints([{ file: MAIN_URI, line: 12 }]);
    h.reset();
    expect(await h.preview(11)).toBe(pathAt(h.game, 11));
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(1);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    const ops = screenOps(h.messages);
    expect(countMethods(ops)).toEqual(clearOpsFor(2));
    expect(ops.every(aboutChoice)).toBe(true);
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

  it("keeps its record of the choices shown through a route replay, which presents none, and clears them after it", async () => {
    const h = connected(ROUTED_CHOICES, 2);
    await h.ready;
    h.releaseAssets();
    await h.preview(2);
    expect(byMethod(h.messages, "game/awaitingInteraction")).toHaveLength(1);
    h.game.setStartFrom({ file: MAIN_URI, line: 5 });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await flushMicrotasks(20);
    h.reset();
    expect(await h.preview(5)).toBe(pathAt(h.game, 5));
    expect(
      byMethod(screenOps(h.messages), "ui/unobserve").map(
        (m) => m.params.event,
      ),
    ).toEqual(["click", "click"]);
    expect(JSON.stringify(screenMessages(h.messages))).toContain(
      "You chose apple.",
    );
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
    expect(await first).toBeNull();
    const order = pinnedMethods(h.messages);
    expect(order.indexOf("assets/release:preview:1")).toBe(
      order.indexOf("assets/load:preview:2") + 1,
    );
    h.releaseAssets();
    expect(await second).toBe(pathAt(h.game, 5));
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
    const count = h.messages.length;
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(h.messages.length).toBe(count);
  });

  it("displays nothing for a preview that PLAY interrupts, and lets its pin go at once", async () => {
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
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
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
      assets: ASSETS,
    });
    h.game.updateProgram(program as any);
    expect(await first).toBeNull();
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
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    void h.reconnect();
    await flushMicrotasks(20);
    expect(await first).toBeNull();
    const released = () =>
      byMethod(h.messages, "assets/release").flatMap((m) => m.params.pins);
    expect(released()).not.toContain("preview:1");
    expect(h.releaseAssets("preview:1")).toBe(1);
    await flushMicrotasks(20);
    expect(released()).toContain("preview:1");
    expect(
      screenOps(h.messages).filter(
        (m) => (m.params?.instructions?.length ?? 0) > 0,
      ),
    ).toEqual([]);
    expect(JSON.stringify(h.messages)).not.toContain("Line two.");
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
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
    const executed = expandLineRanges(
      reports[0].params.executedLines[MAIN_URI].ranges,
    );
    expect(executed).toContain(12);
    expect(executed.filter((line) => line >= 1 && line <= 2)).toEqual([]);
  });

  it("waits without a clock when `restore_timeout` is 0, until the page answers or a later preview takes over", async () => {
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
    const story = `style main with\n  font_family = "Fancy"\nend\n\n${STORY}`;
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

  it("displays nothing for a preview a debug step interrupts, and lets its pin go with the first step", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    expect(h.game.step()).toBe(false);
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
    expect(await first).toBeNull();
    for (let steps = 0; steps < 100 && !h.game.step(); steps++) {
    }
    h.releaseAssets();
    await flushMicrotasks(20);
    const screen = JSON.stringify(screenMessages(h.messages));
    expect(screen).toContain("Line three.");
    expect(screen).not.toContain("Line two.");
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("displays nothing for a preview a call for an unknown point interrupts, and lets its pin go at once", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    expect(await h.game.preview("file://proj/deleted.sd", 3)).toBeNull();
    const released = () =>
      byMethod(h.messages, "assets/release").map((m) => m.params.pins);
    expect(released()).toEqual([["preview:1"]]);
    expect(await first).toBeNull();
    h.releaseAssets();
    await flushMicrotasks(20);
    expect(released()).toEqual([["preview:1"]]);
    expect(JSON.stringify(screenMessages(h.messages))).not.toContain(
      "Line two.",
    );
    expect(byMethod(h.messages, "game/previewed")).toHaveLength(0);
  });

  it("previews the same point again after a load with nothing waiting", async () => {
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

  it("repaints the layouts from the story's state for a handler that runs while the beat waits, as play does while a beat's gate waits", async () => {
    const story = `store hp = 100
store pings = 0
function ping()
  pings = pings + 1
end
layout hud with
  text "HP {hp}"
  text "P {pings}"
  button "Ping" @click=ping
end

scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  & hp = 50
  Line two.
  done
end
`;
    const preview = connected(story, 14);
    await preview.ready;
    const previewButton = preview.observedElementIds()[0];
    expect(previewButton).toBeTruthy();
    preview.reset();
    const previewing = preview.preview(14);
    await flushMicrotasks(20);
    expect(byMethod(preview.messages, "assets/load")).toHaveLength(1);
    preview.emitEvent("click", previewButton!);
    await flushMicrotasks(20);
    const previewDuring = JSON.stringify(screenOps(preview.messages));
    expect(previewDuring).toContain("HP 50");
    expect(previewDuring).toContain("P 1");
    expect(previewDuring).not.toContain("Line two.");
    preview.releaseAssets();
    await previewing;
    expect(JSON.stringify(screenOps(preview.messages))).toContain("Line two.");

    const play = connected(story, 14);
    await play.ready;
    const playButton = play.observedElementIds()[0];
    expect(playButton).toBeTruthy();
    play.reset();
    play.game.start();
    await flushMicrotasks(20);
    expect(byMethod(play.messages, "assets/load")).toHaveLength(1);
    play.emitEvent("click", playButton!);
    await flushMicrotasks(20);
    const playDuring = JSON.stringify(screenOps(play.messages));
    expect(playDuring).toContain("HP 50");
    expect(playDuring).toContain("P 1");
    expect(playDuring).not.toContain("Line two.");
  });

  it("lets the abandoned pin go at once when the beat that takes over stops short of its flush", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.game.setBreakpoints([{ file: MAIN_URI, line: 6 }]);
    expect(await h.preview(5)).toBe(pathAt(h.game, 5));
    expect(await first).toBeNull();
    expect(byMethod(h.messages, "game/hitBreakpoint")).toHaveLength(1);
    expect(byMethod(h.messages, "assets/load").map((m) => m.params.pin)).toEqual(
      ["preview:1"],
    );
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
  });

  it("lets the abandoned pin go at once when play begins with a beat that needs no picture", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    const first = h.preview(3);
    await flushMicrotasks(20);
    h.game.setStartFrom({ file: MAIN_URI, line: 2 });
    h.game.start();
    expect(await first).toBeNull();
    expect(byMethod(h.messages, "assets/load").map((m) => m.params.pin)).toEqual(
      ["preview:1"],
    );
    expect(
      byMethod(h.messages, "assets/release").map((m) => m.params.pins),
    ).toEqual([["preview:1"]]);
  });

  it("gates and writes for a cursor inside a function what it does for the story after the function", async () => {
    const story = `function greet
  [[show portrait bunny]]
  Hello there.
end

[[show backdrop room]]
Line one.
`;
    const inFunction = await previewGate(story, 1);
    const atStory = await previewGate(story, 5);
    expect(pathAt(inFunction.h.game, 1)).toBe(pathAt(atStory.h.game, 5));
    expect(inFunction.gated).toEqual(atStory.gated);
    expect(inFunction.written).toEqual(atStory.written);
    expect(atStory.written).toContain("room.png");
    expect(inFunction.written).not.toContain("bunny.png");
    expect(
      byMethod(inFunction.h.messages, "game/runtimeError").map(
        (m) => m.params.message,
      ),
    ).toEqual([]);
  });

  it("previews nothing for a point the program does not know, and reveals the layouts", async () => {
    const h = connected(STORY, 3);
    await h.ready;
    h.reset();
    expect(await h.game.preview("file://proj/deleted.sd", 3)).toBeNull();
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(byMethod(h.messages, "game/executed")).toHaveLength(0);
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
    expect(itemKeys(prefetches[0])).toEqual([
      src("bunny"),
      src("hat"),
      src("cat"),
    ]);
    expect(itemKeys(prefetches[1])).toEqual([src("dog"), src("room")]);
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
    const inB = beatShowing(h.game, "B", "room2");
    h.game.markPreviewing(inB);
    h.game.observeScene(inB);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.length).toBeGreaterThan(0);
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room2")]);
  });

  it("enters a scene the cursor is not in from that scene's first beat, whichever side of the cursor it lies", async () => {
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
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    h.game.markPreviewing(beatShowing(h.game, "A", "bunny"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
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
    h.game.module.assets.onProgramUpdate();
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
    h.game.module.assets.onSceneMapChanged();
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2]);
  });

  it("re-sends the window when the cursor leaves half of its reach, not the whole of it", async () => {
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
    h.game.markPreviewing(beatShowing(h.game, "A", "cat"));
    new Coordinator(h.game, { text: { dialogue: [] }, end: 0 });
    expect(byMethod(h.messages, "assets/prefetch")).toHaveLength(0);
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
    h.game.observeScene(beats[0]!.address);
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches).toHaveLength(1);
    expect(prefetches[0].params.priority).toBe(2);
    expect(itemKeys(prefetches[0])).toEqual([src("room"), src("bunny")]);
  });

  it("divides a scene around an index", () => {
    const beats = [1, 2, 3, 4, 5, 6].map((address) => ({
      address,
    }));
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
    const paths = (list: { address: ProgramAddress }[]) =>
      list.map((b) => b.address);
    let w = previewWindow(entry, 2, 1);
    expect(paths(w.near)).toEqual([2, 3, 4]);
    expect(paths(w.rest)).toEqual([5, 6, 1]);
    w = previewWindow(entry, 0, 2);
    expect(paths(w.near)).toEqual([1, 2, 3]);
    expect(paths(w.rest)).toEqual([4, 5, 6]);
    w = previewWindow(entry, 99, 1);
    expect(paths(w.near)).toEqual([5, 6]);
    w = previewWindow(entry, 3, 0);
    expect(paths(w.near)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(w.rest).toEqual([]);
    expect(previewWindow({ ...entry, beats: [] }, 0, 3)).toEqual({
      near: [],
      rest: [],
    });
  });

  it("finds the beat at or before an address", () => {
    const OTHER_URI = "inmemory:///other.sd";
    const main = [
      "scene A",
      "  Line one.",
      "  Line two.",
      "  Line three.",
      "  Line four.",
      "  Line five.",
      "  Line six.",
      "  Line seven.",
      "  done",
      "end",
      "",
    ].join("\n");
    const { program } = compileUI(main, {
      scripts: { [OTHER_URI]: "scene other\n  Other line.\nend\n" },
    });
    const locator = programLocator(program);
    const at = (line: number, uri = MAIN_URI): ProgramAddress => {
      const address = locator.addressAt(uri, line);
      if (address === undefined) {
        throw new Error(`no address stands on line ${line} of ${uri}`);
      }
      return address;
    };
    const beats = [1, 3, 6].map((line) => ({ address: at(line) }));
    expect(beatIndexIn(beats, locator, at(3))).toBe(1);
    expect(beatIndexIn(beats, locator, at(5))).toBe(1);
    expect(beatIndexIn(beats, locator, at(2))).toBe(0);
    expect(beatIndexIn(beats, locator, at(7))).toBe(2);
    expect(beatIndexIn(beats, locator, at(1, OTHER_URI))).toBe(-1);
    expect(beatIndexIn(beats, locator, 2 ** 40)).toBe(-1);
    expect(beatIndexIn(beats, locator, null)).toBe(-1);
  });
});
