import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { EventMessage } from "../../game/core/classes/messages/EventMessage";
import type { PageEntry } from "../../game/modules/ui/types/PageState";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  type UIHarness,
} from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const ASSETS = `define theme as audio with
  src = "https://example.com/theme.wav"
end

define door_slam as audio with
  src = "https://example.com/door.wav"
end

define MARA as character with
  name = "MARA"
end

define JON as character with
  name = "JON"
end
`;

const OPEN_TEXTSTREAM = `define ui as config with
  layouts_initial = { "textstream" }
end
`;

const OPEN_BOTH = `define ui as config with
  layouts_initial = { "textbox", "textstream" }
end
`;

const STORY = `scene subway
  [[show backdrop int_subway_aisle]]
  The train rattles on.
  MARA: Did you hear that?
  MARA: Something is wrong.
  ((play music theme))
  JON: Stay calm.
  MARA: I am calm.
  choose
    + [Run.]
      ((play sound door_slam))
      You run.
      -> platform
    + [Wait.]
      You wait.
      -> platform
  end
end

scene platform
  $: THE PLATFORM
  Cold air.
end
`;

const FIXTURE = `${OPEN_TEXTSTREAM}\n${ASSETS}\n${STORY}`;

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  expect(program.chunks).toBeDefined();
  return program as SparkProgram;
}

function play(source = FIXTURE) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const text = () => (game.story.currentText ?? "").trim();
  const page = () => game.module.ui.page.entries as PageEntry[];
  const tapTo = (shown: string) => {
    for (let i = 0; i < 12 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  const tapToChoice = () => {
    for (
      let i = 0;
      i < 12 &&
      !(game.story.currentChoices.length > 0 && page().at(-1)?.kind === "options");
      i += 1
    ) {
      game.clickedToContinue();
    }
    expect(page().at(-1)?.kind).toBe("options");
  };
  return { game, text, page, tapTo, tapToChoice };
}

const words = (entry: PageEntry | undefined) =>
  (entry?.text ?? []).map((event) => event.text).join("");

const describeEntry = (entry: PageEntry) =>
  entry.kind === "caption"
    ? `caption ${entry.caption}`
    : entry.kind === "rule"
      ? "rule"
      : entry.kind === "options"
        ? `options ${(entry.options ?? []).map((o) => o.map((e) => e.text).join("")).join(" | ")}`
        : `${entry.kind}${entry.name ? ` [${entry.name}]` : ""} ${words(entry)}`;

const keydown = (key: string, extra: Record<string, unknown> = {}) =>
  EventMessage.type.notification({ type: "keydown", key, ...extra } as never);

describe("the Interactive Fiction page records one entry per beat (#1990)", () => {
  test("narration, dialogue with and without the name, captions, an open choice, a picked choice, a heading and a scene rule", () => {
    const h = play();
    h.game.start();
    h.tapToChoice();
    expect(h.page().map(describeEntry)).toEqual([
      "caption Backdrop: int_subway_aisle",
      "action The train rattles on.",
      "dialogue [MARA] Did you hear that?",
      "dialogue Something is wrong.",
      "caption Music: theme",
      "dialogue [JON] Stay calm.",
      "dialogue [MARA] I am calm.",
      "options Run. | Wait.",
    ]);

    h.game.chosePathToContinue(0);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 0 } as Clock);
    h.tapTo("Cold air.");
    expect(h.page().map(describeEntry).slice(6)).toEqual([
      "dialogue [MARA] I am calm.",
      "chosen Run.",
      "caption Sound: door_slam",
      "action You run.",
      "rule",
      "heading THE PLATFORM",
      "action Cold air.",
    ]);
  });

  test("typewriter blips get no caption", () => {
    const h = play(
      `${OPEN_TEXTSTREAM}\ndefine blip as synth with\nend\n\nscene start\n  ((play typewriter blip))\n  Tap tap.\nend\n`,
    );
    h.game.start();
    expect(h.page().map(describeEntry)).toEqual(["action Tap tap."]);
  });
});

describe("the page keeps growing (#1990)", () => {
  test("a choice keeps the earlier entries, and a restart empties the page", () => {
    const h = play();
    h.game.start();
    h.tapToChoice();
    const before = h.page().slice(0, 7).map(describeEntry);
    h.game.chosePathToContinue(1);
    h.tapTo("You wait.");
    expect(h.page().slice(0, 7).map(describeEntry)).toEqual(before);
    expect(h.page().map(describeEntry).at(-1)).toBe("action You wait.");

    h.game.reset();
    expect(h.page()).toEqual([]);
  });

  test("a save after three entries loads with the same three entries, and a checkpoint holds the entries up to its beat", () => {
    const h = play();
    h.game.start();
    h.tapTo("Did you hear that?");
    expect(h.page()).toHaveLength(3);
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const entries = structuredClone(h.page());
    h.tapTo("Stay calm.");
    expect(h.page().length).toBeGreaterThan(3);

    const loaded = play();
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    expect(loaded.page()).toEqual(entries);
    loaded.game.start();
    expect(loaded.page()).toEqual(entries);

    const checkpointAt = h.game.checkpoints.length - 1;
    h.tapTo("I am calm.");
    expect(h.game.restoreCheckpoint(checkpointAt)).toBe(true);
    expect(h.page().map(describeEntry).at(-1)).toBe("dialogue [JON] Stay calm.");
  });

  test("rolling back a beat restores the page with its checkpoint", async () => {
    const h = play();
    h.game.start();
    h.tapTo("Something is wrong.");
    const entries = structuredClone(h.page());
    h.tapTo("Stay calm.");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(h.text()).toBe("Something is wrong.");
    expect(h.page()).toEqual(entries);
  });
});

describe("simulating records entries as data only (#1990)", () => {
  test("a 200-beat simulation sends no ui/create until the final beat shows, then the page holds every entry", async () => {
    const lines = Array.from({ length: 200 }, (_, i) => `  Line ${i + 1}.`);
    const source = `${OPEN_TEXTSTREAM}\nscene start\n${lines.join("\n")}\nend\n`;
    const last = source.split("\n").findIndex((l) => l.trim() === "Line 200.");
    const h = createHarness(source, last, {
      reactive: true,
      autoOpenAll: false,
      connect: false,
    });
    const created: string[] = [];
    let simulated = false;
    h.game.connection.outgoing.addListener("*", (message: any) => {
      for (const m of flattenMessages([message])) {
        if (m.method === "ui/create" && !simulated) {
          created.push(m.params.name);
        }
      }
    });
    h.game.setStartFrom({ file: "inmemory:///main.sd", line: last });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    expect(created.filter((name) => name.startsWith("textstream_"))).toEqual([]);
    expect(h.game.module.ui.page.entries).toHaveLength(199);
    simulated = true;
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(last);
    await flushMicrotasks(30);
    const page = h.game.module.ui.page.entries;
    expect(page).toHaveLength(200);
    expect(page.map(words)).toEqual(lines.map((l) => l.trim()));
    const entryCreates = flattenMessages(h.messages).filter(
      (m: any) => m.method === "ui/create" && m.params.name === "textstream_action",
    );
    expect(entryCreates).toHaveLength(200);
  });
});

async function playLive(h: UIHarness, until: (beat: any) => boolean) {
  h.jumpToFlow("subway");
  let beat = h.nextBeat();
  let coordinator: Coordinator<Game> | undefined;
  while (beat) {
    coordinator = new Coordinator(h.game, beat);
    for (let i = 0; i < 5; i += 1) {
      await flushMicrotasks(5);
      coordinator.onUpdate({ deltaMS: 1000 } as Clock);
    }
    if (until(beat)) {
      return { beat, coordinator };
    }
    beat = h.nextBeat();
  }
  throw new Error("story ended first");
}

const created = (h: UIHarness, name: string) =>
  flattenMessages(h.messages).filter(
    (m: any) => m.method === "ui/create" && m.params.name === name,
  );

describe("keys pick and focus options in both modes (#1990)", () => {
  for (const [mode, prelude] of [
    ["Visual Novel", ""],
    ["Interactive Fiction", OPEN_TEXTSTREAM],
  ] as const) {
    test(`${mode}: key 2 picks the second option, and arrows move the focus`, async () => {
      const h = createHarness(`${prelude}\n${ASSETS}\n${STORY}`, 0, {
        reactive: true,
        autoOpenAll: false,
      });
      await h.ready;
      (h.game.context.system as any).previewing = undefined;
      const chosen: number[] = [];
      (h.game as any).chosePathToContinue = (index: number) => chosen.push(index);
      const { coordinator } = await playLive(h, (beat) => Boolean(beat.choices));
      h.reset();
      coordinator.onMessage(keydown("ArrowDown"));
      coordinator.onMessage(keydown("ArrowDown"));
      await flushMicrotasks(10);
      const focused = flattenMessages(h.messages).filter(
        (m: any) =>
          m.method === "ui/update" && m.params.attributes?.["data-focused"] === "",
      );
      expect(focused).toHaveLength(2);
      expect(focused[0].params.element).not.toBe(focused[1].params.element);
      coordinator.onMessage(keydown("9"));
      expect(chosen).toEqual([]);
      coordinator.onMessage(keydown("2"));
      coordinator.onMessage(keydown("1"));
      expect(chosen).toEqual([1]);
    });
  }

  test("Enter picks the focused option", async () => {
    const h = createHarness(`${OPEN_TEXTSTREAM}\n${ASSETS}\n${STORY}`, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    (h.game.context.system as any).previewing = undefined;
    const chosen: number[] = [];
    (h.game as any).chosePathToContinue = (index: number) => chosen.push(index);
    const { coordinator } = await playLive(h, (beat) => Boolean(beat.choices));
    coordinator.onMessage(keydown("ArrowUp"));
    coordinator.onMessage(keydown("Enter"));
    expect(chosen).toEqual([1]);
  });
});

describe("with textbox and textstream both open (#1990)", () => {
  test("a beat shows in both, and a pick on the page continues the story and updates both", async () => {
    const h = createHarness(`${OPEN_BOTH}\n${ASSETS}\n${STORY}`, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    (h.game.context.system as any).previewing = undefined;
    await playLive(h, (beat) => Boolean(beat.choices));
    const writes = flattenMessages(h.messages).filter(
      (m: any) => m.method === "ui/write-text",
    );
    const said = (m: any) => m.params.instructions.map((e: any) => e.text).join("");
    expect(writes.some((m: any) => m.params.target === "dialogue" && said(m) === "I am calm.")).toBe(true);
    const dialogueEntries = created(h, "textstream_dialogue");
    expect(dialogueEntries.length).toBeGreaterThanOrEqual(4);
    const options = created(h, "textstream_option");
    expect(options).toHaveLength(2);
    h.reset();
    h.emitEvent("click", options[0].params.element);
    await flushMicrotasks(10);
    expect(h.game.module.ui.page.entries.map(describeEntry)).toContain("chosen Run.");
    expect(h.game.story.currentChoices).toHaveLength(0);
    const flat = flattenMessages(h.messages);
    expect(flat.some((m: any) => m.method === "ui/create" && m.params.name === "textstream_chosen muted")).toBe(true);
    expect(
      flat.some(
        (m: any) => m.method === "ui/write-text" && m.params.target === "choice 0" && m.params.instructions.length === 0,
      ),
    ).toBe(true);
  });
});

describe("opening the page mid-run types the beat that opens it (#1990)", () => {
  test("the opening beat and the reopening beat reveal with the typewriter, and the page's history is shown at once", async () => {
    const h = createHarness(
      `scene start
  Before the page.
  [[open textstream]] The page opens on this line.
  [[close textstream]] Back in the box.
  [[open textstream]] The page opens again.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    (h.game.context.system as any).previewing = undefined;
    h.jumpToFlow("start");
    const writes = (text: string) =>
      flattenMessages(h.messages).filter(
        (m: any) =>
          m.method === "ui/write-text" &&
          m.params.elements?.length === 1 &&
          m.params.instructions.map((e: any) => e.text).join("") === text,
      );
    let beat = h.nextBeat();
    const shown: string[] = [];
    while (beat) {
      const coordinator = new Coordinator(h.game, beat);
      for (let i = 0; i < 30; i += 1) {
        await flushMicrotasks(20);
        await new Promise((resolve) => setTimeout(resolve, 0));
        coordinator.onUpdate({ deltaMS: 1000 } as Clock);
      }
      shown.push(words(h.game.module.ui.page.entries.at(-1)));
      beat = h.nextBeat();
    }
    expect(shown).toContain("The page opens again.");

    const opening = writes("The page opens on this line.");
    expect(opening.length).toBeGreaterThan(0);
    expect(opening[0].params.instant).toBe(false);
    expect(opening[0].params.time).toBeTypeOf("number");

    const reopening = writes("The page opens again.");
    expect(reopening.length).toBeGreaterThan(0);
    expect(reopening[0].params.instant).toBe(false);
    expect(reopening[0].params.time).toBeTypeOf("number");

    const history = opening.slice(1);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((m: any) => m.params.instant === true)).toBe(true);
  });
});

describe("the page across restores, scenes and simulation (#1990)", () => {
  test("restoring a checkpoint keeps the next run of an identical beat on the page", () => {
    const h = play(`${OPEN_TEXTSTREAM}
scene start
  Again.
  -> start
end
`);
    h.game.start();
    expect(h.page().map(words)).toEqual(["Again."]);
    expect(h.game.restoreCheckpoint(h.game.checkpoints.length - 1)).toBe(true);
    h.game.clickedToContinue();
    expect(h.page().map(words)).toEqual(["Again.", "Again."]);
  });

  test("a resumed menu shows its prompt and options once, and picking from it continues the page", () => {
    const source = `${OPEN_TEXTSTREAM}
scene start
  Before.
  choose
    + [Left.]
      Left result.
    + [Right.]
      Right result.
  end
end
`;
    const h = play(source);
    h.game.start();
    h.tapToChoice();
    const before = structuredClone(h.page());
    const saved = h.game.saveHere();
    const loaded = play(source);
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    expect(loaded.page()).toEqual(before);
    loaded.game.chosePathToContinue(1);
    loaded.tapTo("Right result.");
    expect(loaded.page().map(describeEntry)).toEqual([
      "action Before.",
      "chosen Right.",
      "action Right result.",
    ]);
  });

  test("a scene that opens with a cue on its own beat still gets its rule", () => {
    const h = play(`${OPEN_TEXTSTREAM}
define b as image with
  src = "https://example.com/b.png"
end

scene start
  Before.
  -> next
end

scene next
  [[show backdrop b]] >
  After.
end
`);
    h.game.start();
    h.tapTo("After.");
    expect(h.page().map((entry) => entry.kind)).toEqual([
      "action",
      "rule",
      "caption",
      "action",
    ]);
  });

  test("a mounted page builds no entry while the engine simulates, and records it", async () => {
    const h = createHarness(
      `${OPEN_TEXTSTREAM}
scene start
  First.
  Second.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    new Coordinator(h.game, h.nextBeat()!);
    await flushMicrotasks(30);
    expect(created(h, "textstream_action")).toHaveLength(1);
    h.reset();
    (h.game.context.system as any).simulating = "start";
    new Coordinator(h.game, h.nextBeat()!);
    await flushMicrotasks(30);
    expect(h.game.module.ui.page.entries.map(words)).toEqual([
      "First.",
      "Second.",
    ]);
    expect(created(h, "textstream_action")).toHaveLength(0);
  });
});

describe("both mount paths build the same page (#1990)", () => {
  test("the AST mount and the static fallback send the same messages for the textstream layout, and both mark its scroll root to follow the end", async () => {
    const source = `${OPEN_TEXTSTREAM}
scene start
  Hello.
end
`;
    const staticH = createHarness(source, 0, { staticFallback: true });
    const astH = createHarness(source);
    await Promise.all([staticH.ready, astH.ready]);
    const page = (h: UIHarness) => {
      const flat = h.snapshotFiltered("ui/") as any[];
      const at = flat.findIndex(
        (m) => m.method === "ui/create" && m.params?.name === "layout_textstream",
      );
      expect(at).toBeGreaterThanOrEqual(0);
      return flat.slice(at, at + 4);
    };
    expect(page(astH)).toEqual(page(staticH));
    for (const h of [astH, staticH]) {
      const flat = flattenMessages(h.messages);
      const root = flat.find(
        (m: any) => m.method === "ui/create" && m.params.name === "textstream paper ink",
      );
      const marked = flat.some(
        (m: any) =>
          (m.method === "ui/create" || m.method === "ui/update") &&
          m.params.element === root?.params.element &&
          m.params.attributes?.["data-follow"] === "end",
      );
      expect(marked).toBe(true);
    }
  });
});
