import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { Game } from "../../src/game/core/classes/Game";
import type { CastEntry } from "../../src/game/modules/ui/types/CastState";
import { createHarness, flattenMessages, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const PICTURES = ["mia@happy", "mia@sad", "sam@calm", "sam@cross"].map((name) => ({
  uri: `file:///${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `https://example.com/${name}.png`,
}));

const CHARACTERS = `define mia as character with
  name = "MIA"
end

define sam as character with
  name = "SAM"
end
`;

const castLayout = (portrait: string) => `layout main {
  stage {
    cast {
      actor {
        ${portrait} { image }
      }
    }
  }
}
`;

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
      ...PICTURES,
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
}

function play(source: string) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const text = () => (game.story.currentText ?? "").trim();
  const entries = () => game.module.ui.casts.entries("main") as CastEntry[];
  const tapTo = (shown: string) => {
    for (let i = 0; i < 16 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  game.start();
  return { game, text, entries, tapTo };
}

const pictureOf = (entry: CastEntry): string[] => {
  const events = entry.image?.["portrait"] ?? [];
  const shown = events.findLast((e) => e.assets?.length);
  const hidden = events.findLast((e) => !e.assets?.length && e.control === "hide");
  return shown?.control === "show" && !hidden ? [...shown.assets!] : [];
};

const cast = (entries: CastEntry[]) =>
  entries.map((entry) => ({
    speaker: entry.speaker,
    picture: pictureOf(entry),
    ...(entry.variant ? { variant: entry.variant } : {}),
  }));

describe("a cast keeps one entry per character (#2746)", () => {
  const STORY = `${CHARACTERS}
${castLayout("portrait")}
scene start
  [[mia@happy]]
  MIA: Hello.
  [[sam@calm]]
  SAM: Hi.
  [[mia@sad]]
  MIA: Oh.
  The room is quiet.
  [[hide portrait]]
  MIA: Gone.
end
`;

  test("two characters' pictures make two entries that carry their speaker, and a later picture changes the same entry", () => {
    const h = play(STORY);
    h.tapTo("Hello.");
    expect(cast(h.entries())).toEqual([{ speaker: "mia", picture: ["mia@happy"] }]);
    const mia = h.entries()[0]!.id;
    h.tapTo("Hi.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@happy"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);
    h.tapTo("Oh.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@sad"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);
    expect(h.entries()[0]!.id).toBe(mia);
  });

  test("without #clear, both entries stay across lines until the script hides them", () => {
    const h = play(STORY);
    h.tapTo("The room is quiet.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@sad"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);
    h.tapTo("Gone.");
    expect(h.entries()).toEqual([]);
  });

  test("a picture shown on a line nobody speaks makes an entry too", () => {
    const h = play(`${CHARACTERS}
${castLayout("portrait")}
scene start
  [[sam@calm]]
  The door opens.
end
`);
    h.tapTo("The door opens.");
    expect(cast(h.entries())).toEqual([{ speaker: "sam", picture: ["sam@calm"] }]);
  });
});

describe("#clear on a cast's picture (#2746)", () => {
  test("in a dialogue box the picture lasts one line, a returning speaker reuses the entry and a newcomer replaces the emptied one", () => {
    const h = play(`${CHARACTERS}
${castLayout("portrait #clear")}
scene start
  [[mia@happy]]
  MIA: One.
  SAM: Two.
  [[mia@happy]]
  MIA: Three.
  Narration.
  [[mia@sad]]
  MIA: Four.
  [[sam@calm]]
  SAM: Five.
end
`);
    h.tapTo("One.");
    const mia = h.entries()[0]!.id;
    h.tapTo("Two.");
    expect(cast(h.entries())).toEqual([{ speaker: "mia", picture: [] }]);
    h.tapTo("Three.");
    expect(cast(h.entries())).toEqual([{ speaker: "mia", picture: ["mia@happy"] }]);
    expect(h.entries()[0]!.id).toBe(mia);
    h.tapTo("Narration.");
    expect(cast(h.entries())).toEqual([{ speaker: "mia", picture: [] }]);
    h.tapTo("Four.");
    expect(cast(h.entries())).toEqual([{ speaker: "mia", picture: ["mia@sad"] }]);
    expect(h.entries()[0]!.id).toBe(mia);
    h.tapTo("Five.");
    expect(cast(h.entries())).toEqual([{ speaker: "sam", picture: ["sam@calm"] }]);
  });

  test("the first speaker's picture empties when a second speaker's line follows in a dialogue box", () => {
    const h = play(`${CHARACTERS}
${castLayout("portrait #clear")}
scene start
  [[mia@happy]]
  MIA: One.
  [[sam@calm]]
  SAM: Two.
end
`);
    h.tapTo("Two.");
    expect(cast(h.entries())).toEqual([{ speaker: "sam", picture: ["sam@calm"] }]);
  });

  test("in a stream both speakers' pictures stay through the exchange, and empty when the stream is cleared", () => {
    const h = play(`${CHARACTERS}
${castLayout("portrait #clear")}
layout talk {
  stream {
    dialogue.line { text }
  }
}

scene start
  [[open talk]]
  [[mia@happy]]
  MIA: One.
  [[sam@calm]]
  SAM: Two.
  [[clear talk]]
  MIA: Three.
end
`);
    h.tapTo("Two.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@happy"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);
    h.tapTo("Three.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: [] },
      { speaker: "sam", picture: [] },
    ]);
  });
});

describe("an entry carries its character's newest variant (#2746)", () => {
  test("a speaker's entry is kept, with its variant cleared, when their unlabelled line follows an exchange", () => {
    const h = play(`${CHARACTERS}
${castLayout("portrait #clear")}
layout talk {
  stream {
    dialogue.line { text }
  }
}

scene start
  [[open talk]]
  [[mia@happy]]
  MIA [left]: One.
  [[sam@calm]]
  SAM [right]: Two.
  [[close talk]]
  [[mia@happy]]
  MIA: Three.
end
`);
    h.tapTo("Two.");
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@happy"], variant: "left" },
      { speaker: "sam", picture: ["sam@calm"], variant: "right" },
    ]);
    const mia = h.entries()[0]!.id;
    h.tapTo("Three.");
    expect(cast(h.entries())[0]).toEqual({ speaker: "mia", picture: ["mia@happy"] });
    expect(h.entries()[0]!.id).toBe(mia);
  });
});

describe("saves and checkpoints keep a cast's entries (#2746)", () => {
  const STORY = `${CHARACTERS}
${castLayout("portrait")}
scene start
  [[mia@happy]]
  MIA: Hello.
  [[sam@calm]]
  SAM: Hi.
  [[mia@sad]]
  MIA: Oh.
end
`;

  test("a checkpoint restores the entries at its line, and a save loads with them", () => {
    const h = play(STORY);
    h.tapTo("Hi.");
    const checkpointAt = h.game.checkpoints.length - 1;
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    h.tapTo("Oh.");
    expect(cast(h.entries())[0]!.picture).toEqual(["mia@sad"]);
    expect(h.game.restoreCheckpoint(checkpointAt)).toBe(true);
    expect(cast(h.entries())).toEqual([
      { speaker: "mia", picture: ["mia@happy"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);

    const loaded = new Game({
      now: () => 0,
      setTimeout: (() => 0) as never,
      resolve: (path: string) => path,
      fetch: async () => "",
      log: () => {},
      program: compile(STORY),
    } as never);
    expect(loaded.loadToResume(saved!.data)).toBe(true);
    loaded.start();
    expect(cast(loaded.module.ui.casts.entries("main") as CastEntry[])).toEqual([
      { speaker: "mia", picture: ["mia@happy"] },
      { speaker: "sam", picture: ["sam@calm"] },
    ]);
  });
});

describe("a cast's entries arrive and leave (#2746)", () => {
  const SOURCE = `${CHARACTERS}
${castLayout("portrait #clear")}
style actor {
  transition-property = translate
  transition-duration = 0.18s
  @initial { translate = 64px 0 }
}

style portrait {
  transition = opacity 0.26s
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

scene start
  Begin.
end
`;

  const wire = (messages: any[]): any[] =>
    messages.flatMap((m: any) =>
      (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
        ? wire(m.params.messages)
        : [m],
    );

  const motions = (h: ReturnType<typeof createHarness>) =>
    wire(h.messages)
      .filter((m: any) => m?.method === "ui/presence")
      .flatMap((m: any) => m.params.effects)
      .filter((effect: any) => effect.element.includes("-cast-"));

  const line = (speaker: string, text: string, picture?: string) => ({
    end: 0,
    speaker: { character: speaker },
    text: { character_name: [{ text: speaker.toUpperCase() }], dialogue: [{ text }] },
    ...(picture ? { image: { portrait: [{ control: "show", assets: [picture] }] } } : {}),
  });

  const narration = (text: string) => ({ end: 0, text: { action: [{ text }] } });

  async function show(h: ReturnType<typeof createHarness>, beat: Record<string, unknown>) {
    const coordinator = new Coordinator(h.game, beat as never);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
      (coordinator as any)._onTick?.(100);
    }
    await flushMicrotasks(20);
    h.releasePresence();
    await flushMicrotasks(30);
  }

  const parts = (h: ReturnType<typeof createHarness>) => {
    const ui: any = h.game.module.ui;
    return (ui.findElements("actor") as any[]).map((actor) => ({
      actor: actor.id,
      portrait: actor.children.find((child: any) => child.name === "portrait").id,
    }));
  };

  test("a newcomer's entry and its picture arrive, and a returning speaker's picture arrives in its kept entry", async () => {
    const h = createHarness(SOURCE, 0, {
      reactive: true,
      assets: PICTURES as never,
      holdPresence: true,
      beforeConnect: (game: Game) => {
        game.context.system.previewing = undefined;
        game.context.system.composeBeats = true;
      },
    });
    await h.ready;
    expect(h.errors).toEqual([]);
    h.reset();
    await show(h, line("mia", "One.", "mia@happy"));
    const [mia] = parts(h);
    expect(motions(h)).toEqual(
      expect.arrayContaining([
        { element: mia!.actor, presence: "show" },
        { element: mia!.portrait, presence: "show" },
      ]),
    );
    h.reset();
    await show(h, narration("The clock ticks."));
    expect(parts(h)).toEqual([mia]);
    expect(motions(h)).toEqual([{ element: mia!.portrait, presence: "hide" }]);
    h.reset();
    await show(h, line("mia", "Still here.", "mia@happy"));
    expect(parts(h)).toEqual([mia]);
    expect(motions(h)).toEqual([{ element: mia!.portrait, presence: "show" }]);
  });
});

describe("a cast's entries on screen (#2746)", () => {
  const STORY = `${CHARACTERS}
${castLayout("portrait")}
scene start
  [[mia@happy]]
  MIA [left]: Hello.
  [[sam@calm]]
  SAM: Hi.
  The room is quiet.
end
`;

  const attributesOf = (messages: any[], id: string): Record<string, string | null> => {
    const attributes: Record<string, string | null> = {};
    for (const m of flattenMessages(messages) as any[]) {
      if ((m?.method === "ui/create" || m?.method === "ui/update") && m.params?.element === id) {
        Object.assign(attributes, m.params.attributes ?? {});
      }
    }
    return attributes;
  };

  async function run() {
    const h = createHarness(STORY, 0, { reactive: true, assets: PICTURES as never });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    const actors = () => ui.findElements("actor") as { id: string; name: string }[];
    const marks = () =>
      actors().map((el) => {
        const a = attributesOf(h.messages, el.id);
        return {
          speaker: a["data-speaker"] ?? null,
          variant: a["data-variant"] ?? null,
          latest: a["data-latest"] === "",
        };
      });
    const steps: ReturnType<typeof marks>[] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      new Coordinator(h.game, beat);
      await flushMicrotasks(20);
      steps.push(marks());
    }
    return { h, ui, steps };
  }

  test("each entry is an element carrying #speaker and #variant, and @latest marks whoever is speaking now", async () => {
    const { steps } = await run();
    expect(steps).toEqual([
      [{ speaker: "mia", variant: "left", latest: true }],
      [
        { speaker: "mia", variant: "left", latest: false },
        { speaker: "sam", variant: null, latest: true },
      ],
      [
        { speaker: "mia", variant: "left", latest: false },
        { speaker: "sam", variant: null, latest: false },
      ],
    ]);
  });

  test("the preview on a line shows the cast the game would have at that line", async () => {
    const lineOf = (text: string) => STORY.split("\n").findIndex((line) => line.includes(text));
    const last = lineOf("The room is quiet.");
    const h = createHarness(STORY, last, {
      reactive: true,
      connect: false,
      assets: PICTURES as never,
    });
    h.game.setStartFrom({ file: MAIN_URI, line: last });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    const onScreen = () =>
      (ui.findElements("actor") as any[]).map((el) => {
        const portrait = el.children.find((child: any) => child.name === "portrait");
        const shown = flattenMessages(h.messages)
          .filter(
            (m: any) =>
              m?.method === "ui/write-image" && m.params?.elements?.includes(portrait.id),
          )
          .at(-1) as any;
        return {
          speaker: attributesOf(h.messages, el.id)["data-speaker"],
          picture: shown?.params.instructions.at(-1)?.content?.imageNames ?? null,
        };
      });
    await h.preview(lineOf("SAM: Hi."));
    await flushMicrotasks(30);
    expect(onScreen()).toEqual([
      { speaker: "mia", picture: "mia@happy" },
      { speaker: "sam", picture: "sam@calm" },
    ]);
    const first = lineOf("MIA [left]: Hello.");
    h.game.setStartFrom({ file: MAIN_URI, line: first });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.preview(first);
    await flushMicrotasks(30);
    expect(onScreen()).toEqual([{ speaker: "mia", picture: "mia@happy" }]);
  });

  test("a picture goes only to its character's entry", async () => {
    const { h, ui } = await run();
    const writes = flattenMessages(h.messages).filter(
      (m: any) => m?.method === "ui/write-image" && m.params?.target === "portrait",
    ) as any[];
    const portraitOf = (speaker: string) => {
      const actor = (ui.findElements("actor") as any[]).find(
        (el) => attributesOf(h.messages, el.id)["data-speaker"] === speaker,
      );
      return actor.children.find((child: any) => child.name === "portrait").id;
    };
    const shown = (asset: string) =>
      writes
        .filter((m) => m.params.instructions.some((i: any) => i.content?.imageNames === asset))
        .flatMap((m) => m.params.elements ?? ["(every portrait)"]);
    expect(shown("mia@happy")).toEqual([portraitOf("mia")]);
    expect(shown("sam@calm")).toEqual([portraitOf("sam")]);
  });

  async function playThrough(source: string) {
    const h = createHarness(source, 0, { reactive: true, assets: PICTURES as never });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      new Coordinator(h.game, beat);
      await flushMicrotasks(20);
    }
    const lastPicture = (portrait: { id: string }) =>
      (flattenMessages(h.messages) as any[])
        .filter((m) => m?.method === "ui/write-image" && m.params?.elements?.includes(portrait.id))
        .at(-1)
        ?.params.instructions.at(-1)?.content?.imageNames ?? null;
    const castsOn = () =>
      (ui.findElements("cast") as any[]).map((cast) =>
        cast.children.map((actor: any) => ({
          speaker: attributesOf(h.messages, actor.id)["data-speaker"],
          picture: lastPicture(actor.children.find((child: any) => child.name === "portrait")),
        })),
      );
    return { h, ui, castsOn };
  }

  test("two casts keep their own entries, and a picture for one cast's entry changes no entry of the other", async () => {
    const { castsOn } = await playThrough(`${CHARACTERS}
${castLayout("portrait")}
layout side {
  cast {
    actor {
      portrait { image }
    }
  }
}

scene start
  [[mia@happy]]
  MIA: One.
  [[open side]]
  [[sam@calm]]
  SAM: Two.
  [[mia@sad]]
  MIA: Three.
end
`);
    expect(castsOn()).toEqual([
      [
        { speaker: "mia", picture: "mia@sad" },
        { speaker: "sam", picture: "sam@calm" },
      ],
      [
        { speaker: "sam", picture: "sam@calm" },
        { speaker: "mia", picture: "mia@sad" },
      ],
    ]);
  });

  test("an entry copies every element written in the cast, so a name beside the picture goes to the speaker's entry", async () => {
    const source = `${CHARACTERS}
layout main {
  stage {
    cast {
      portrait { image }
      character_name { text }
    }
  }
}

scene start
  [[mia@happy]]
  MIA: Hello.
end
`;
    const h = play(source);
    h.tapTo("Hello.");
    const [entry] = h.entries();
    expect(entry).toMatchObject({ speaker: "mia" });
    expect(pictureOf(entry!)).toEqual(["mia@happy"]);
    expect(entry!.text?.["character_name"]?.map((e) => e.text).join("")).toBe("MIA");

    const { h: shown, ui } = await playThrough(source);
    const [cast] = ui.findElements("cast") as any[];
    expect(cast.children.map((el: any) => el.name)).toEqual(["portrait", "character_name"]);
    const name = cast.children[1];
    const names = (flattenMessages(shown.messages) as any[])
      .filter((m) => m?.method === "ui/write-text" && m.params?.elements?.includes(name.id))
      .map((m) => m.params.instructions.map((e: any) => e.text).join(""));
    expect(names).toContain("MIA");
    expect(cast.children.map((el: any) => attributesOf(shown.messages, el.id)["data-speaker"])).toEqual(["mia", "mia"]);
  });

  test("a name inside a cast leaves the built-in dialogue box to show the line", async () => {
    const { h, ui } = await playThrough(`${CHARACTERS}
layout main {
  stage {
    cast {
      portrait { image }
      character_name { text }
    }
  }
}

scene start
  [[mia@happy]]
  MIA: Hello.
end
`);
    const boxes: string[] = ui.findIds("dialogue");
    expect(boxes.length).toBeGreaterThan(0);
    const said = (flattenMessages(h.messages) as any[])
      .filter(
        (m) =>
          m?.method === "ui/write-text" &&
          m.params?.target === "dialogue" &&
          (m.params.elements ?? boxes).some((id: string) => boxes.includes(id)),
      )
      .map((m) => m.params.instructions.map((e: any) => e.text).join(""));
    expect(said).toContain("Hello.");
  });
});

describe("a cast through step back, a repeated display, the text page and a partly cleared target (#2746)", () => {
  const line = (speaker: string, text: string, picture?: string) => ({
    end: 0,
    speaker: { character: speaker },
    text: { character_name: [{ text: speaker.toUpperCase() }], dialogue: [{ text }] },
    ...(picture ? { image: { portrait: [{ control: "show", assets: [picture] }] } } : {}),
  });

  const narration = (text: string) => ({ end: 0, text: { action: [{ text }] } });

  async function harness(source: string) {
    const h = createHarness(source, 0, { reactive: true, assets: PICTURES as never });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    const show = async (beat: object) => {
      const coordinator = new Coordinator(h.game, beat as never);
      await flushMicrotasks(50);
      return coordinator;
    };
    const imageWrites = (id: string) =>
      (flattenMessages(h.messages) as any[]).filter(
        (m) => m?.method === "ui/write-image" && m.params?.elements?.includes(id),
      );
    return { h, ui, show, imageWrites };
  }

  const STORY = `${CHARACTERS}
${castLayout("portrait #clear")}
scene start
  [[mia@happy]]
  MIA: One.
  Narration.
  [[mia@sad]]
  MIA: Three.
end
`;

  test("a step back to a line that emptied a kept entry clears the picture it shows", async () => {
    const { h, ui, imageWrites } = await harness(STORY);
    h.game.context.system.previewing = undefined;
    h.game.start();
    const settle = async () => {
      for (let i = 0; i < 5; i += 1) {
        h.game.update({ deltaMS: 10000 } as never);
        await flushMicrotasks(30);
      }
    };
    const to = async (text: string) => {
      await settle();
      for (let i = 0; i < 16 && h.game.story.currentText?.trim() !== text; i += 1) {
        h.game.clickedToContinue();
        await settle();
      }
      expect(h.game.story.currentText?.trim()).toBe(text);
    };
    await to("Three.");
    const [actor] = ui.findElements("actor") as any[];
    const portrait = actor.children.find((child: any) => child.name === "portrait");
    expect(imageWrites(portrait.id).at(-1).params.instructions.at(-1).content.imageNames).toBe("mia@sad");
    h.reset();
    const back = await h.game.rollBack("beat");
    await flushMicrotasks(50);
    expect(back.moved).toBe(true);
    expect(ui.casts.entries("main")[0].image).toEqual({});
    expect((ui.findElements("actor") as any[]).map((el) => el.id)).toEqual([actor.id]);
    expect(imageWrites(portrait.id).some((m) => m.params.instructions.length === 0)).toBe(true);
  });

  test("displaying a beat again records it once", async () => {
    const { ui, show } = await harness(`${CHARACTERS}
${castLayout("portrait")}
scene start
  Begin.
end
`);
    await show(line("mia", "One.", "mia@happy"));
    const coordinator = await show({
      ...line("mia", "Two."),
      image: { portrait: [{ control: "animate", with: "shake" }] },
    });
    const before = structuredClone(ui.casts.entries("main"));
    (coordinator as any).display({ instant: true });
    await flushMicrotasks(50);
    expect(ui.casts.entries("main")).toEqual(before);
  });

  test("a #clear picture stays while its line stays on the text page", async () => {
    const { ui, show } = await harness(STORY);
    await show({
      ...line("mia", "Hello.", "mia@happy"),
      layout: { textstream: [{ name: "textstream", control: "open" }] },
    });
    await show(line("sam", "Two.", "sam@calm"));
    expect(
      ui.state.page.entries.some((e: any) => e.text?.some((t: any) => t.text === "Hello.")),
    ).toBe(true);
    expect((ui.casts.entries("main") as CastEntry[]).map(pictureOf)).toEqual([
      ["mia@happy"],
      ["sam@calm"],
    ]);
  });

  test("a #clear element empties while an unmarked element of the same name keeps the picture", async () => {
    const { h, ui, show, imageWrites } = await harness(`${CHARACTERS}
${castLayout("portrait.once #clear { image }; portrait.kept")}
scene start
  Begin.
end
`);
    await show(line("mia", "One.", "mia@happy"));
    const [actor] = ui.findElements("actor") as any[];
    const once = actor.children.find((child: any) => child.name.includes("once"));
    const kept = actor.children.find((child: any) => child.name.includes("kept"));
    h.reset();
    await show(narration("Narration."));
    expect(imageWrites(once.id).some((m) => m.params.instructions.length === 0)).toBe(true);
    expect(imageWrites(kept.id).some((m) => m.params.instructions.length === 0)).toBe(false);
    const [entry] = ui.casts.entries("main") as CastEntry[];
    expect(pictureOf(entry!)).toEqual(["mia@happy"]);
    expect(entry!.emptied).toEqual(["image|portrait"]);
  });

  test("an entry whose root a store replaces keeps its #speaker, #variant and @latest", async () => {
    const { h, ui, show, imageWrites } = await harness(`${CHARACTERS}
store swapped = false

component actor_template {
  if swapped then
    actor.replaced { portrait { image } }
  else
    actor.original { portrait { image } }
  end
}

layout main {
  stage {
    cast { actor_template }
  }
}

scene start
  Begin.
end
`);
    const marksOf = (id: string) => {
      const marks: Record<string, string | null> = {};
      for (const m of flattenMessages(h.messages) as any[]) {
        if ((m?.method === "ui/create" || m?.method === "ui/update") && m.params?.element === id) {
          for (const name of ["data-speaker", "data-variant", "data-latest"]) {
            if (m.params.attributes && name in m.params.attributes) {
              marks[name] = m.params.attributes[name];
            }
          }
        }
      }
      return marks;
    };
    await show({ ...line("mia", "One.", "mia@happy"), variant: "left" });
    const [before] = ui.findElements("actor") as any[];
    expect(marksOf(before.id)).toEqual({ "data-speaker": "mia", "data-variant": "left", "data-latest": "" });
    (h.game.story as any).variablesState.$("swapped", true);
    ui.refreshLayouts();
    await flushMicrotasks(60);
    const [after] = ui.findElements("actor") as any[];
    expect(after.id).not.toBe(before.id);
    const portrait = after.children.find((child: any) => child.name === "portrait");
    expect(imageWrites(portrait.id).at(-1)?.params.instructions.at(-1)?.content?.imageNames).toBe("mia@happy");
    expect(marksOf(after.id)).toEqual({ "data-speaker": "mia", "data-variant": "left", "data-latest": "" });
  });
});
