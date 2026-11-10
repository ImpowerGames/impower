import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Clock } from "../../game/core/classes/Clock";
import { Game } from "../../game/core/classes/Game";
import { startingLayouts } from "../../game/core/classes/presenters/textLayouts";
import type { StartingDisplayMode } from "../../game/core/classes/messages/SetStartingDisplayModeMessage";
import type { PageEntry } from "../../game/modules/ui/types/PageState";

const MAIN = "file:///local/main.sd";

const HUD = `layout hud {
  stat {
    text
  }
}
`;

const WITH_HUD = `define ui as config with
  layouts_initial = { "textbox", "hud" }
end
`;

const STORY = `define MARA as character with
  name = "MARA"
end

scene subway
  The train rattles on.
  MARA: Did you hear that?
  MARA: Something is wrong.
  choose
    + [Run.]
      You run.
    + [Wait.]
      You wait.
  end
  Cold air.
end
`;

const OPENS_PAGE = `scene subway
  The train rattles on.
  [[open textstream]]
  Now it reads as a page.
  Still a page.
end
`;

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
  return compiler.compile({ textDocument: { uri: MAIN } })
    .program as SparkProgram;
}

function play(source: string, startingDisplayMode?: StartingDisplayMode) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
    startingDisplayMode,
  } as never);
  const text = () => (game.story.currentText ?? "").trim();
  const page = () => game.module.ui.page.entries as PageEntry[];
  const open = () => game.module.ui.openedLayoutsAfter([]);
  const tapTo = (shown: string) => {
    for (let i = 0; i < 12 && text() !== shown; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(shown);
  };
  return { game, text, page, open, tapTo };
}

const words = (entry: PageEntry | undefined) =>
  (entry?.text ?? []).map((event) => event.text).join("");

describe("the starting display mode chooses the text layout a game opens with (#1992)", () => {
  test("Interactive Fiction puts textstream in place of textbox and leaves every other initial layout alone", () => {
    expect(startingLayouts(["textbox", "hud"], "textstream")).toEqual([
      "textstream",
      "hud",
    ]);
    expect(startingLayouts(["hud", "textbox"], "textstream")).toEqual([
      "hud",
      "textstream",
    ]);
    expect(startingLayouts(["textbox", "textstream"], "textstream")).toEqual([
      "textstream",
    ]);
    expect(startingLayouts(["textbox", "hud"], "textbox")).toEqual([
      "textbox",
      "hud",
    ]);
    expect(startingLayouts(["textstream"], "textbox")).toEqual(["textstream"]);
  });

  test("a game started in Visual Novel opens textbox, as the story configures", () => {
    const h = play(`${WITH_HUD}\n${HUD}\n${STORY}`);
    h.game.start();
    expect(h.open()).toEqual(["main", "textbox", "hud"]);
    expect(h.page()).toEqual([]);
  });

  test("a game started in Interactive Fiction opens textstream and the other initial layouts, and writes each beat to the page", () => {
    const h = play(`${WITH_HUD}\n${HUD}\n${STORY}`, "textstream");
    h.game.start();
    expect(h.open()).toEqual(["main", "textstream", "hud"]);
    h.tapTo("Did you hear that?");
    expect(h.page().map(words)).toEqual([
      "The train rattles on.",
      "Did you hear that?",
    ]);
  });

  test("in Visual Novel, a script that opens textstream still switches to the page", () => {
    const h = play(OPENS_PAGE);
    h.game.start();
    expect(h.open()).toEqual(["main", "textbox"]);
    h.tapTo("Now it reads as a page.");
    expect(h.open()).toContain("textstream");
    expect(h.page().map(words)).toEqual(["Now it reads as a page."]);
  });

  test("switching mid-run closes one layout, opens the other and keeps the run on the same beat", () => {
    const h = play(STORY);
    h.game.start();
    h.tapTo("Did you hear that?");
    const checkpoints = h.game.checkpoints.length;

    h.game.setStartingDisplayMode("textstream");
    expect(h.open()).toEqual(["main", "textstream"]);
    expect(h.text()).toBe("Did you hear that?");
    expect(h.game.checkpoints.length).toBe(checkpoints);
    expect(h.page().map(words)).toEqual(["Did you hear that?"]);

    h.tapTo("Something is wrong.");
    expect(h.page().map(words)).toEqual([
      "Did you hear that?",
      "Something is wrong.",
    ]);

    h.game.setStartingDisplayMode("textbox");
    expect(h.open()).toEqual(["main", "textbox"]);
    expect(h.text()).toBe("Something is wrong.");
    h.game.clickedToContinue();
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 0 } as Clock);
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual([
      "Run.",
      "Wait.",
    ]);
  });

  test("Skip back across a mid-run switch keeps the chosen mode on screen", async () => {
    const h = play(STORY);
    h.game.start();
    h.tapTo("Did you hear that?");
    h.game.setStartingDisplayMode("textstream");
    h.tapTo("Something is wrong.");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(h.text()).toBe("Did you hear that?");
    expect(h.open()).toEqual(["main", "textstream"]);
    expect(h.page().map(words).at(-1)).toBe("Did you hear that?");

    h.game.setStartingDisplayMode("textbox");
    h.tapTo("Something is wrong.");
    const again = await h.game.rollBack("beat");
    expect(again.moved).toBe(true);
    expect(h.open()).toEqual(["main", "textbox"]);
  });

  test("Skip back in Visual Novel keeps the page a script opened", async () => {
    const h = play(OPENS_PAGE);
    h.game.start();
    h.tapTo("Still a page.");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(h.text()).toBe("Now it reads as a page.");
    expect(h.open()).toContain("textstream");
  });

  test("a save made in Visual Novel resumes on the page in Interactive Fiction", () => {
    const h = play(STORY);
    h.game.start();
    h.tapTo("Did you hear that?");
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const resumed = play(STORY, "textstream");
    expect(resumed.game.loadToResume(saved!.data)).toBe(true);
    resumed.game.start();
    expect(resumed.text()).toBe("Did you hear that?");
    expect(resumed.open()).toEqual(["main", "textstream"]);
  });

  test("the mode chosen mid-run is the one the next game starts in", () => {
    const h = play(STORY);
    h.game.start();
    h.game.setStartingDisplayMode("textstream");
    expect(h.game.startingDisplayMode).toBe("textstream");
    h.game.reset();
    h.game.start();
    expect(h.open()).toEqual(["main", "textstream"]);
  });

  test("a game that has not opened its layouts yet only records the mode", () => {
    const h = play(STORY);
    h.game.setStartingDisplayMode("textstream");
    expect(h.game.module.ui.initialLayoutsOpened).toBe(false);
    h.game.start();
    expect(h.open()).toEqual(["main", "textstream"]);
  });
});
