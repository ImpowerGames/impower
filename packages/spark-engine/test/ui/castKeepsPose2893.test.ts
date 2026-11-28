import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../src/game/core/classes/Game";
import type { CastEntry } from "../../src/game/modules/ui/types/CastState";
import { createHarness, flattenMessages, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const PICTURES = ["mia@happy", "mia@sad", "mia@angry", "sam@calm", "sam@cross", "bg@room"].map((name) => ({
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

animation crouch {
  keyframes {
    {
      transform = "translateY(5%)"
    }
  }
  timing {
    duration = "300ms"
  }
}

animation flip {
  keyframes {
    {
      transform = "scaleX(-1)"
    }
  }
  timing {
    duration = "200ms"
  }
}

animation bob {
  keyframes {
    {
      transform = "translateY(0%)"
    }
    {
      transform = "translateY(2%)"
    }
    {
      transform = "translateY(0%)"
    }
  }
  timing {
    duration = "1s"
  }
}
`;

const castLayout = (portrait: string) => `layout main {
  backdrop { image }
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

const posesOf = (ui: any) =>
  Object.fromEntries(
    (ui.casts.entries("main") as CastEntry[]).map((entry) => {
      const events = entry.image?.["portrait"] ?? [];
      const shown = ui.pictureShown(events)
        ? events.findLast((e) => e.control === "show" && e.assets?.length)
        : undefined;
      return [entry.speaker, shown?.with?.map((w) => w.name) ?? []];
    }),
  );

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
  return { game, ui, source, tapTo, poses: () => posesOf(ui) };
}

const portraitOf = (messages: any[], ui: any, speaker: string) => {
  const actor = (ui.findElements("actor") as any[]).find((el) =>
    (flattenMessages(messages) as any[]).some(
      (m) =>
        (m?.method === "ui/create" || m?.method === "ui/update") &&
        m.params?.element === el.id &&
        m.params?.attributes?.["data-speaker"] === speaker,
    ),
  );
  return actor?.children.find((child: any) => child.name === "portrait");
};

const sentContent = (messages: any[], ui: any, speaker: string) => {
  const portrait = portraitOf(messages, ui, speaker);
  const write = (flattenMessages(messages) as any[])
    .filter((m) => m?.method === "ui/write-image" && m.params?.elements?.includes(portrait?.id))
    .at(-1);
  return write?.params.instructions.findLast((i: any) => i.content)?.content;
};

const animationsOf = (content: any) =>
  [...(content?.enterAnimations ?? []), ...(content?.previousHideAnimations ?? [])].map((a: any) => ({
    name: a.$name,
    duration: a.timing.duration,
    delay: a.timing.delay,
  }));

const moves = (content: any) =>
  animationsOf(content).some((a) => a.duration !== "0s" && a.duration !== "0ms" && a.name !== "show" && a.name !== "hide");

describe("a cast entry keeps the pose a with leaves it in (#2893)", () => {
  test("a held pose outlives later pictures that write no with, and the other character's entry is untouched", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with crouch]]
  [[sam@calm]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[mia@angry]]
  [[sam@cross]]
  MIA: Three.
end
`,
    );
    h.tapTo("One.");
    expect(h.poses()).toEqual({ mia: ["crouch"], sam: [] });
    h.tapTo("Two.");
    expect(h.poses()).toEqual({ mia: ["crouch"], sam: [] });
    h.tapTo("Three.");
    expect(h.poses()).toEqual({ mia: ["crouch"], sam: [] });
  });

  test("a one-shot effect plays on the line that wrote it and is not kept", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with shake]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[mia@happy with crouch]]
  MIA: Three.
  [[mia@sad with whitepulse]]
  MIA: Four.
  [[mia@angry]]
  MIA: Five.
end
`,
    );
    h.tapTo("One.");
    expect(h.poses()).toEqual({ mia: ["shake"] });
    h.tapTo("Two.");
    expect(h.poses()).toEqual({ mia: [] });
    h.tapTo("Three.");
    expect(h.poses()).toEqual({ mia: ["crouch"] });
    h.tapTo("Five.");
    expect(h.poses()).toEqual({ mia: [] });
  });

  test("a later with that holds a different pose replaces the kept one", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with crouch]]
  MIA: One.
  [[mia@sad with flip]]
  MIA: Two.
  [[mia@angry]]
  MIA: Three.
end
`,
    );
    h.tapTo("Three.");
    expect(h.poses()).toEqual({ mia: ["flip"] });
  });

  test("a picture brought in with a transition keeps the pose", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with crouch]]
  MIA: One.
  [[mia@sad with fade]]
  MIA: Two.
  [[mia@angry]]
  MIA: Three.
end
`,
    );
    h.tapTo("Two.");
    expect(h.poses()).toEqual({ mia: ["fade", "crouch"] });
    h.tapTo("Three.");
    expect(h.poses()).toEqual({ mia: ["crouch"] });
  });

  test("a looping animation is kept like a pose", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with bob loop]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[mia@happy with bob once]]
  MIA: Three.
  [[mia@angry]]
  MIA: Four.
end
`,
    );
    h.tapTo("Two.");
    expect(h.poses()).toEqual({ mia: ["bob"] });
    h.tapTo("Four.");
    expect(h.poses()).toEqual({ mia: [] });
  });

  test("a narration line between pictures leaves the kept pose in place, with #clear and without", () => {
    for (const header of [PLAIN, CLEARED]) {
      const h = play(
        header,
        `scene start
  [[mia@happy with crouch]]
  MIA: One.
  Narration.
  [[sam@calm]]
  SAM: Hi.
  [[mia@sad]]
  MIA: Back.
end
`,
      );
      h.tapTo("Back.");
      expect(h.poses()["mia"]).toEqual(["crouch"]);
      expect(h.poses()["sam"] ?? []).toEqual([]);
    }
  });

  test("hiding the character or the layer ends the kept pose", () => {
    const h = play(
      PLAIN,
      `scene start
  [[mia@happy with crouch]]
  [[sam@calm with crouch]]
  MIA: One.
  [[hide mia]]
  SAM: Two.
  [[mia@sad]]
  MIA: Three.
  [[mia@happy with crouch]]
  MIA: Four.
  [[hide portrait]]
  Nobody.
  [[mia@sad]]
  [[sam@cross]]
  MIA: Five.
end
`,
    );
    h.tapTo("Three.");
    expect(h.poses()).toEqual({ sam: ["crouch"], mia: [] });
    h.tapTo("Five.");
    expect(h.poses()).toEqual({ mia: [], sam: [] });
  });

  test("hiding the character after their entry has gone ends the kept pose", () => {
    const h = play(
      CLEARED,
      `scene start
  [[mia@happy with crouch]]
  MIA: One.
  [[sam@calm]]
  SAM: Hi.
  [[hide mia]]
  SAM: Still me.
  [[mia@sad]]
  MIA: Back.
end
`,
    );
    h.tapTo("Back.");
    expect(h.poses()).toEqual({ mia: [] });
  });

  test("a plain layer outside the cast keeps no with", () => {
    const h = play(
      PLAIN,
      `scene start
  [[bg@room with crouch]]
  Narration.
  [[bg@room]]
  More.
end
`,
    );
    h.tapTo("More.");
    const events = h.ui._state.image?.["backdrop"] ?? [];
    expect(events.findLast((e: any) => e.assets?.length)?.with).toBeUndefined();
  });
});

describe("the kept pose is written at its end state, without its motion (#2893)", () => {
  const STORY = `scene start
  [[mia@happy with crouch]]
  [[sam@calm]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[sam@cross]]
  SAM: Three.
end
`;

  const live = async (source: string) => {
    const h = createHarness(source, 0, { reactive: true, assets: PICTURES as never });
    await h.ready;
    expect(h.errors).toEqual([]);
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
    return { h, ui: h.game.module.ui as any, to };
  };

  test("the next picture lands in the pose with no motion, and a one-shot effect is not sent again", async () => {
    const { h, ui, to } = await live(`${PLAIN}
scene start
  [[mia@happy with crouch]]
  MIA: One.
  [[mia@sad]]
  MIA: Two.
  [[mia@angry with shake]]
  MIA: Three.
  [[mia@happy]]
  MIA: Four.
end
`);
    await to("One.");
    expect(animationsOf(sentContent(h.messages, ui, "mia")).map((a) => a.name)).toContain("crouch");
    expect(moves(sentContent(h.messages, ui, "mia"))).toBe(true);
    await to("Two.");
    const kept = sentContent(h.messages, ui, "mia");
    expect(animationsOf(kept).filter((a) => a.name === "crouch")).not.toEqual([]);
    expect(moves(kept)).toBe(false);
    await to("Three.");
    expect(animationsOf(sentContent(h.messages, ui, "mia")).map((a) => a.name)).toContain("shake");
    await to("Four.");
    const after = sentContent(h.messages, ui, "mia");
    expect(after).toBeDefined();
    expect(animationsOf(after).map((a) => a.name)).not.toContain("shake");
    expect(animationsOf(after).map((a) => a.name)).not.toContain("crouch");
  });

  test("a save and a checkpoint restore carry the kept pose", () => {
    const h = play(PLAIN, STORY);
    h.tapTo("Two.");
    const checkpointAt = h.game.checkpoints.length - 1;
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    h.tapTo("Three.");
    expect(h.game.restoreCheckpoint(checkpointAt)).toBe(true);
    expect(h.poses()).toEqual({ mia: ["crouch"], sam: [] });
    const loaded = newGame(h.source);
    expect(loaded.loadToResume(saved!.data)).toBe(true);
    loaded.start();
    expect(posesOf(loaded.module.ui)).toEqual({ mia: ["crouch"], sam: [] });
    const fromSave = newGame(h.source);
    fromSave.load(h.game.save());
    expect(posesOf(fromSave.module.ui)).toEqual({ mia: ["crouch"], sam: [] });
  });

  test("a step back to a line shows the kept pose without its motion", async () => {
    const { h, ui, to } = await live(`${PLAIN}\n${STORY}`);
    await to("Three.");
    h.reset();
    const back = await h.game.rollBack("beat");
    await flushMicrotasks(50);
    expect(back.moved).toBe(true);
    expect(h.game.story.currentText?.trim()).toBe("Two.");
    expect(posesOf(ui)).toEqual({ mia: ["crouch"], sam: [] });
    const content = sentContent(h.messages, ui, "mia");
    expect(animationsOf(content).map((a) => a.name)).toContain("crouch");
    expect(moves(content)).toBe(false);
  });

  test("the preview on a line shows the kept pose without its motion", async () => {
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
    expect(posesOf(ui)).toEqual({ mia: ["crouch"], sam: [] });
    const content = sentContent(h.messages, ui, "mia");
    expect(animationsOf(content).map((a) => a.name)).toContain("crouch");
    expect(moves(content)).toBe(false);
  });
});
