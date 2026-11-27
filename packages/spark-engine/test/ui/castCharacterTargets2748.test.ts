import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { Game } from "../../src/game/core/classes/Game";
import type { CastEntry } from "../../src/game/modules/ui/types/CastState";
import { createHarness, flattenMessages, flushMicrotasks } from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const PICTURES = ["mia@happy", "mia@sad", "sam@calm"].map((name) => ({
  uri: `file:///${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `https://example.com/${name}.png`,
}));

const HEADER = `define mia as character with
  name = "MIA"
end

define sam as character with
  name = "SAM"
end

layout main {
  stage {
    cast {
      actor {
        portrait { image }
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

function play(story: string) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(`${HEADER}\n${story}`),
  } as never);
  const ui: any = game.module.ui;
  const text = () => (game.story.currentText ?? "").trim();
  const entries = () => ui.casts.entries("main") as CastEntry[];
  const tapTo = (shown: string) => {
    for (let i = 0; i < 16 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  const framings = () =>
    Object.fromEntries(
      entries().map((entry) => [
        entry.speaker,
        ui.image.viewAfter(entry.image?.["portrait"] ?? []).framing ?? null,
      ]),
    );
  game.start();
  return { game, ui, entries, tapTo, framings };
}

const speakers = (entries: CastEntry[]) => entries.map((entry) => entry.speaker);

describe("hide names one character in a cast (#2748)", () => {
  const STORY = `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: You came.
  [[hide mia]]
  SAM: Fine. Go.
  [[mia@happy]]
  MIA: Back.
  [[hide portrait]]
  Nobody.
end
`;

  test("hiding a character removes their entry and leaves the other", () => {
    const h = play(STORY);
    h.tapTo("You came.");
    expect(speakers(h.entries())).toEqual(["mia", "sam"]);
    h.tapTo("Fine. Go.");
    expect(speakers(h.entries())).toEqual(["sam"]);
  });

  test("hiding the layer removes every entry", () => {
    const h = play(STORY);
    h.tapTo("Back.");
    expect(speakers(h.entries())).toEqual(["sam", "mia"]);
    h.tapTo("Nobody.");
    expect(h.entries()).toEqual([]);
  });
});

describe("each cast entry holds its own framing (#2748)", () => {
  const STORY = `scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: You came.
  [[animate mia to center over 1s]]
  SAM: I said I would.
  [[mia@sad]]
  MIA: Oh.
end
`;

  test("two entries hold different framings, and animate on a character moves only theirs", () => {
    const h = play(STORY);
    h.tapTo("You came.");
    const left = h.ui.getFraming("left");
    const right = h.ui.getFraming("right");
    const center = h.ui.getFraming("center") ?? null;
    expect(left).not.toEqual(right);
    expect(h.framings()).toEqual({ mia: left, sam: right });
    h.tapTo("I said I would.");
    expect(h.framings()).toEqual({ mia: center, sam: right });
  });

  test("a new picture with no at returns only that entry to the default framing", () => {
    const h = play(`scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: You came.
  [[mia@sad]]
  MIA: Oh.
end
`);
    const left = h.ui.getFraming("left");
    const right = h.ui.getFraming("right");
    h.tapTo("You came.");
    expect(left).not.toBeUndefined();
    expect(h.framings()).toEqual({ mia: left, sam: right });
    h.tapTo("Oh.");
    expect(h.ui.getFraming(undefined)).toBeUndefined();
    expect(h.framings()).toEqual({ mia: null, sam: right });
  });
});

describe("a name that is both a layer and a character (#2748)", () => {
  test("hide and animate use the layer and leave the character's entry", () => {
    const h = play(`layout mia {
  image
}

scene start
  [[mia@happy at left]]
  [[sam@calm at right]]
  MIA: You came.
  [[animate mia to right over 1s]]
  [[hide mia]]
  SAM: Still here.
end
`);
    h.tapTo("You came.");
    expect(speakers(h.entries())).toEqual(["mia", "sam"]);
    h.tapTo("Still here.");
    expect(speakers(h.entries())).toEqual(["mia", "sam"]);
    expect(h.framings()).toEqual({ mia: h.ui.getFraming("left"), sam: h.ui.getFraming("right") });
  });
});

describe("animate names one character in a cast (#2748)", () => {
  test("an animation on a character plays only on their entry, and one on the layer plays on every entry", async () => {
    const h = createHarness(
      `${HEADER}
scene start
  [[mia@happy]]
  [[sam@calm]]
  MIA: One.
  [[animate mia with shake]]
  SAM: Two.
  [[animate portrait with shake]]
  MIA: Three.
end
`,
      0,
      { reactive: true, assets: PICTURES as never },
    );
    await h.ready;
    expect(h.errors).toEqual([]);
    const ui: any = h.game.module.ui;
    h.jumpToFlow("start");
    const animated: string[][] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      h.reset();
      new Coordinator(h.game, beat);
      await flushMicrotasks(20);
      const portraits = new Map<string, string>(
        (ui.findElements("actor") as any[]).map((actor) => [
          actor.children.find((child: any) => child.name === "portrait").id,
          ui.casts.entries("main").find((entry: CastEntry) =>
            (ui.findElements("actor") as any[]).indexOf(actor) === ui.casts.entries("main").indexOf(entry),
          )?.speaker,
        ]),
      );
      animated.push(
        (flattenMessages(h.messages) as any[])
          .filter(
            (m) =>
              m?.method === "ui/write-image" &&
              m.params.instructions.some((i: any) => i.control === "animate"),
          )
          .flatMap((m) => (m.params.elements ?? []).map((id: string) => portraits.get(id) ?? id))
          .toSorted(),
      );
    }
    expect(animated).toEqual([[], ["mia"], ["mia", "sam"]]);
  });
});
