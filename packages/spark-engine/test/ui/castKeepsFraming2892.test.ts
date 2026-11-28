import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
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

const PLAIN = `${CHARACTERS}\n${castLayout("portrait")}`;
const CLEARED = `${CHARACTERS}\n${castLayout("portrait #clear")}`;

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

function newGame(source: string) {
  return new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
}

function play(header: string, story: string) {
  const source = `${header}\n${story}`;
  const game = newGame(source);
  const ui: any = game.module.ui;
  const text = () => (game.story.currentText ?? "").trim();
  const tapTo = (shown: string) => {
    for (let i = 0; i < 16 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  game.start();
  return { game, ui, source, tapTo, framings: () => framingsOf(ui) };
}

const framingsOf = (ui: any) =>
  Object.fromEntries(
    (ui.casts.entries("main") as CastEntry[]).map((entry) => [
      entry.speaker,
      ui.image.viewAfter(entry.image?.["portrait"] ?? []).framing ?? null,
    ]),
  );

describe("a cast entry keeps its framing through later pictures that write no at (#2892)", () => {
  test("a new picture with no at keeps the character's side, and the other character keeps theirs", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[sam@cross]]
  SAM: Three.
end
`,
    );
    const left = h.ui.getFraming("left");
    const right = h.ui.getFraming("right");
    expect(left).not.toEqual(right);
    h.tapTo("Two.");
    expect(h.framings()).toEqual({ mia: left, sam: right });
    h.tapTo("Three.");
    expect(h.framings()).toEqual({ mia: left, sam: right });
  });

  test("with #clear, the side outlasts a narration line, the other speaker's lines and the entry being made again", () => {
    const h = play(
      CLEARED,
      `scene start
  [[mia@happy at left]]
  MIA: One.
  Narration.
  [[sam@calm at right]]
  SAM: Hi.
  [[sam@cross]]
  SAM: Still me.
  [[mia@sad]]
  MIA: Back.
  More narration.
  [[sam@calm]]
  SAM: Again.
end
`,
    );
    const left = h.ui.getFraming("left");
    const right = h.ui.getFraming("right");
    h.tapTo("Narration.");
    expect(h.ui.casts.entries("main").map((e: CastEntry) => e.speaker)).toEqual(["mia"]);
    h.tapTo("Hi.");
    expect(h.ui.casts.entries("main").map((e: CastEntry) => e.speaker)).toEqual(["sam"]);
    h.tapTo("Still me.");
    expect(h.framings()).toEqual({ sam: right });
    h.tapTo("Back.");
    expect(h.framings()).toEqual({ mia: left });
    h.tapTo("Again.");
    expect(h.framings()).toEqual({ sam: right });
  });

  test("a later at, or a travel, replaces the kept framing for that character only", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: One.
  [[mia@sad at center]]
  MIA: Two.
  [[mia@happy]]
  MIA: Three.
  [[animate mia to right over 1s]]
  MIA: Four.
  [[mia@sad]]
  [[sam@cross]]
  MIA: Five.
end
`,
    );
    const center = h.ui.getFraming("center") ?? null;
    const right = h.ui.getFraming("right");
    h.tapTo("Two.");
    expect(h.framings()).toEqual({ mia: center, sam: right });
    h.tapTo("Three.");
    expect(h.framings()).toEqual({ mia: center, sam: right });
    h.tapTo("Four.");
    expect(h.framings()).toEqual({ mia: right, sam: right });
    h.tapTo("Five.");
    expect(h.framings()).toEqual({ mia: right, sam: right });
  });

  test("hiding the character or the layer ends the kept framing", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: One.
  [[hide mia]]
  SAM: Two.
  [[mia@sad]]
  MIA: Three.
  [[mia@happy at left]]
  MIA: Four.
  [[hide portrait]]
  Nobody.
  [[mia@sad]]
  [[sam@cross]]
  MIA: Five.
end
`,
    );
    const right = h.ui.getFraming("right");
    h.tapTo("Three.");
    expect(h.framings()).toEqual({ sam: right, mia: null });
    h.tapTo("Five.");
    expect(h.framings()).toEqual({ mia: null, sam: null });
  });

  test("hiding the character after their entry has gone ends the kept framing", () => {
    const h = play(
      CLEARED,
      `scene start
  [[mia@happy at left]]
  MIA: One.
  [[sam@calm at right]]
  SAM: Hi.
  [[hide mia]]
  SAM: Still me.
  [[mia@sad]]
  MIA: Back.
end
`,
    );
    h.tapTo("Back.");
    expect(h.framings()).toEqual({ mia: null });
  });
});

describe("the kept framing through saves, checkpoints, a step back and a preview (#2892)", () => {
  const STORY = `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[sam@cross]]
  SAM: Three.
end
`;

  test("a save and a checkpoint restore carry the kept framing", () => {
    const h = play(PLAIN, STORY);
    const left = h.ui.getFraming("left");
    const right = h.ui.getFraming("right");
    h.tapTo("Two.");
    const checkpointAt = h.game.checkpoints.length - 1;
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    h.tapTo("Three.");
    expect(h.game.restoreCheckpoint(checkpointAt)).toBe(true);
    expect(h.framings()).toEqual({ mia: left, sam: right });
    const loaded = newGame(h.source);
    expect(loaded.loadToResume(saved!.data)).toBe(true);
    loaded.start();
    expect(framingsOf(loaded.module.ui)).toEqual({ mia: left, sam: right });
    const fromSave = newGame(h.source);
    fromSave.load(h.game.save());
    expect(framingsOf(fromSave.module.ui)).toEqual({ mia: left, sam: right });
  });

  const sentFraming = (messages: any[], ui: any, speaker: string) => {
    const actor = (ui.findElements("actor") as any[]).find((el) =>
      (flattenMessages(messages) as any[]).some(
        (m) =>
          (m?.method === "ui/create" || m?.method === "ui/update") &&
          m.params?.element === el.id &&
          m.params?.attributes?.["data-speaker"] === speaker,
      ),
    );
    const portrait = actor?.children.find((child: any) => child.name === "portrait");
    const write = (flattenMessages(messages) as any[])
      .filter((m) => m?.method === "ui/write-image" && m.params?.elements?.includes(portrait?.id))
      .at(-1);
    return write?.params.instructions.findLast((i: any) => i.content)?.framing ?? null;
  };

  test("a step back to a line shows the kept framing", async () => {
    const h = createHarness(`${PLAIN}\n${STORY}`, 0, { reactive: true, assets: PICTURES as never });
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
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
    h.reset();
    const back = await h.game.rollBack("beat");
    await flushMicrotasks(50);
    expect(back.moved).toBe(true);
    expect(h.game.story.currentText?.trim()).toBe("Two.");
    expect(framingsOf(ui)).toEqual({ mia: ui.getFraming("left"), sam: ui.getFraming("right") });
    expect(sentFraming(h.messages, ui, "mia")).toEqual(ui.getFraming("left"));
  });

  test("the preview on a line shows the kept framing", async () => {
    const source = `${PLAIN}\n${STORY}`;
    const lineOf = (text: string) => source.split("\n").findIndex((line) => line.includes(text));
    const line = lineOf("MIA: Two.");
    const h = createHarness(source, line, { reactive: true, connect: false, assets: PICTURES as never });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    await h.preview(line);
    await flushMicrotasks(30);
    expect(framingsOf(ui)).toEqual({ mia: ui.getFraming("left"), sam: ui.getFraming("right") });
    expect(sentFraming(h.messages, ui, "mia")).toEqual(ui.getFraming("left"));
  });
});
