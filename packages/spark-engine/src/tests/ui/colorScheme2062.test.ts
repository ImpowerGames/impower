import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import { UNKNOWN_COLOR_SCHEME_MESSAGE } from "../../game/modules/ui/classes/UIModule";
import type { PageEntry } from "../../game/modules/ui/types/PageState";
import { createHarness, flattenMessages, normalizeMessages } from "./harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const config = (colorScheme?: string, layouts = `{ "textstream" }`) =>
  `define ui as config with\n  layouts_initial = ${layouts}\n${colorScheme === undefined ? "" : `  color_scheme = "${colorScheme}"\n`}end\n`;

const STORY = `scene start
  One.
  Two.
  choose
    + [Left.]
      Three.
    + [Right.]
      Four.
  end
end
`;

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
}

function play(source: string) {
  const logged: { message: unknown; severity: string }[] = [];
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: (message: unknown, severity: string) => logged.push({ message, severity }),
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
  return { game, page, tapTo, logged };
}

const themeRequests = async (source: string) => {
  const h = createHarness(source);
  await h.ready;
  return flattenMessages(h.messages).filter((m: any) => m.method === "ui/theme");
};

describe("ui/theme carries the game's colour scheme setting (#2062)", () => {
  test.each([
    [undefined, "system"],
    ["system", "system"],
    ["light", "light"],
    ["dark", "dark"],
  ])("ui.color_scheme %s sends %s", async (setting, sent) => {
    const requests = await themeRequests(`${config(setting)}\n${STORY}`);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.params.color_scheme).toBe(sent);
    }
  });

  test("an unknown value acts as system, and the play log says so once per run", () => {
    const h = play(`${config("sepia")}\n${STORY}`);
    h.game.start();
    h.tapTo("Two.");
    h.game.module.ui.loadTheme({});
    const warnings = h.logged.filter((l) => l.message === UNKNOWN_COLOR_SCHEME_MESSAGE);
    expect(warnings).toEqual([{ message: "ui.color_scheme must be system, light or dark. Using system.", severity: "warning" }]);
  });

  test("a known value logs nothing", () => {
    const h = play(`${config("dark")}\n${STORY}`);
    h.game.start();
    h.tapTo("Two.");
    expect(h.logged.filter((l) => l.message === UNKNOWN_COLOR_SCHEME_MESSAGE)).toEqual([]);
  });
});

describe("the scheme is presentation, never game state (#2062)", () => {
  test("a save made under one scheme loads under the other with the same UI state and page, and neither save nor checkpoint holds a scheme", () => {
    const light = play(`${config("light")}\n${STORY}`);
    light.game.start();
    light.tapTo("Two.");
    const saved = light.game.saveHere();
    expect(saved).not.toBeNull();
    const loadUnder = (setting: string) => {
      const h = play(`${config(setting)}\n${STORY}`);
      expect(h.game.loadToResume(saved!.data)).toBe(true);
      h.game.start();
      return h;
    };
    const lightLoaded = loadUnder("light");
    const darkLoaded = loadUnder("dark");
    expect(darkLoaded.page()).toEqual(light.page());
    expect(darkLoaded.game.module.ui.state).toEqual(lightLoaded.game.module.ui.state);
    const checkpoints = Array.from({ length: light.game.checkpoints.length }, (_, i) => light.game.checkpoints.getJson(i) ?? "");
    for (const stored of [saved!.data, light.game.save(), ...checkpoints]) {
      expect(stored).not.toMatch(/color_scheme|colorScheme|color-scheme/);
    }
  });

  test("a Visual Novel pinned light and pinned dark gets the same UI stream, apart from ui/theme's setting", async () => {
    const stream = async (setting: string) => {
      const h = createHarness(`${config(setting, `{ "textbox" }`)}\n${STORY}`);
      await h.ready;
      return JSON.stringify(
        normalizeMessages(
          flattenMessages(h.messages).map((m: any) =>
            m.method === "ui/theme" ? { ...m, params: { ...m.params, color_scheme: undefined } } : m,
          ),
        ),
      );
    };
    expect(await stream("dark")).toBe(await stream("light"));
  });
});
