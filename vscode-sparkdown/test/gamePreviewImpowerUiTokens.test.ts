// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RouteList } from "../../packages/spark-web-player/src/route/RouteViews";
import { StartingValuesTab } from "../../packages/spark-web-player/src/route/StartingValuesViews";
import { SavesMenu } from "../../packages/spark-web-player/src/saves/SavesViews";

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  return {
    ...fakeVscode(),
    ViewColumn: { Two: 2 },
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: string, ...parts: string[]) => [base, ...parts].join("/"),
    },
  };
});

const PLAYER = join(__dirname, "..", "..", "packages", "spark-web-player", "src");
const read = (...parts: string[]) => readFileSync(join(PLAYER, ...parts), "utf8");

const THEMES = {
  "Dark Modern": {
    "--vscode-font-size": "13px",
    "--vscode-foreground": "#cccccc",
    "--vscode-descriptionForeground": "#9d9d9d",
    "--vscode-editor-background": "#1f1f1f",
    "--vscode-panel-border": "#2b2b2b",
    "--vscode-widget-border": "#313131",
    "--vscode-list-activeSelectionBackground": "#04395e",
    "--vscode-toolbar-hoverBackground": "rgba(90, 93, 94, 0.31)",
    "--vscode-focusBorder": "#0078d4",
    "--vscode-errorForeground": "#f85149",
    "--vscode-editorWarning-foreground": "#cca700",
    "--vscode-widget-shadow": "rgba(0, 0, 0, 0.36)",
  },
  "Light Modern": {
    "--vscode-font-size": "13px",
    "--vscode-foreground": "#3b3b3b",
    "--vscode-descriptionForeground": "#717171",
    "--vscode-editor-background": "#ffffff",
    "--vscode-panel-border": "#e5e5e5",
    "--vscode-widget-border": "#e5e5e5",
    "--vscode-list-activeSelectionBackground": "#e8e8e8",
    "--vscode-toolbar-hoverBackground": "rgba(184, 184, 184, 0.31)",
    "--vscode-focusBorder": "#005fb8",
    "--vscode-errorForeground": "#f85149",
    "--vscode-editorWarning-foreground": "#bf8803",
    "--vscode-widget-shadow": "rgba(0, 0, 0, 0.16)",
  },
} as const;

const URI = "file://proj/main.sd";
const at = (line: number) => ({
  uri: URI,
  range: { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 0 } },
});

const ROUTE_LIST = renderToString(
  h(RouteList, {
    state: {
      open: true,
      tab: "route",
      pins: [],
      toggles: { pinned: true, auto: true, forced: true, clipped: true },
      route: {
        start: { scene: "garden", location: at(14) },
        target: at(18),
        decisions: [
          {
            kind: "auto",
            location: at(17),
            text: "Smell the roses",
            meeting: 1,
            menu: at(16),
            options: [
              { location: at(17), text: "Smell the roses", offer: 0 },
              { location: at(19), text: "Walk on", offer: 1 },
            ],
          },
          { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
        ],
      },
    },
    nameOf: () => "main",
    onClose: () => {},
    onToggle: () => {},
    onShowLine: () => {},
    onChangePins: () => {},
    onPinLastRun: () => {},
  } as any),
);

const SAVES_MENU = renderToString(
  h(SavesMenu, {
    state: {
      open: true,
      playing: true,
      saves: [
        {
          id: "a",
          name: "garden, line 18",
          kind: "saved",
          scene: "garden",
          line: 18,
          time: "03:00 PM",
          savedAt: 0,
        },
      ],
    },
    events: {},
  } as any),
);

let browser: Browser;
let template: string;
let entryCss: string;

beforeAll(async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const manager: any = SparkdownPreviewGamePanelManager.instance;
  template = manager.getWebviewContent(
    { cspSource: "csp", asWebviewUri: (uri: string) => uri },
    { extensionUri: "ext" },
  );
  const entry = join(PLAYER, "impower-ui.css");
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: dirname(entry),
    onDependency: () => {},
  });
  entryCss = compiler.build(new Scanner({ sources: compiler.sources }).scan());
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (theme: Record<string, string>, markup: string): Promise<Page> => {
  const page = await browser.newPage();
  const vars = Object.entries(theme)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  await page.setContent(
    template
      .replace(/<html([^>]*)>/, `<html$1 style="${vars}">`)
      .replace("<body>", `<body class="ready">`)
      .replace(
        "</head>",
        `<style>${read("spark-web-player.css")}</style><style>${entryCss}</style><style>${read("route", "route-list.css")}</style><style>${read("saves", "saves.css")}</style></head>`,
      )
      .replace(/<spark-web-player([^>]*)><\/spark-web-player>/, `<spark-web-player$1><div id="game"><div id="saves-menu"></div></div><div id="route-list">${markup}</div></spark-web-player>`),
  );
  return page;
};

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("the Game Preview styles the impower-ui route list and Saves menu from the VS Code theme", () => {
  it.each(Object.entries(THEMES))("sizes and colours the route list in %s", async (_, theme) => {
    const page = await open(theme, ROUTE_LIST);
    const read = await page.evaluate(() => {
      const box = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
      };
      const head = document.querySelector(".route-list [data-panel-head]")!;
      const tab = document.querySelector(".route-list [role=tab]")!;
      const close = document.querySelector(".route-list [aria-label='Close the route']")!;
      return {
        head: box(head),
        headBackground: getComputedStyle(head).backgroundColor,
        tab: box(tab),
        tabColor: getComputedStyle(tab).color,
        close: box(close),
        closeRadius: getComputedStyle(close).borderTopLeftRadius,
        rows: [...document.querySelectorAll(".route-list-entries > li")].map((li) => box(li).h),
      };
    });
    await page.close();
    expect(read.head.h).toBe(35);
    expect(read.headBackground).toBe(toRgb(theme["--vscode-editor-background"]));
    expect(read.tab.h).toBe(35);
    expect(read.tabColor).toBe(toRgb(theme["--vscode-foreground"]));
    expect(read.close).toEqual({ w: 22, h: 22 });
    expect(read.closeRadius).toBe("4px");
    expect(read.rows).toEqual([22, 22, 22]);
  });

  it.each(Object.entries(THEMES))("rings a keyboard-focused route tab and row with the focus border in %s", async (_, theme) => {
    const page = await open(theme, ROUTE_LIST);
    const ring = (selector: string) =>
      page.evaluate((s) => {
        const style = getComputedStyle(document.activeElement!);
        return {
          matches: document.activeElement!.matches(s),
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        };
      }, selector);
    await page.keyboard.press("Shift");
    await page.focus(".route-list [role=tab]");
    const tab = await ring("[role=tab]:focus-visible");
    await page.keyboard.press("Shift");
    await page.focus("button[data-route-text]");
    const row = await ring("button[data-route-text]:focus-visible");
    await page.close();
    const focus = `solid 1px ${toRgb(theme["--vscode-focusBorder"])}`;
    expect(tab).toEqual({ matches: true, outline: focus });
    expect(row).toEqual({ matches: true, outline: focus });
  });

  it.each(Object.entries(THEMES))("draws the Saves menu and its rows in the theme's panel and text colours in %s", async (_, theme) => {
    const page = await open(theme, "");
    await page.evaluate((markup) => {
      document.querySelector("#saves-menu")!.innerHTML = markup;
    }, SAVES_MENU);
    const read = await page.evaluate(() => {
      const menu = document.querySelector(".saves-menu")!;
      const name = document.querySelector("[data-save-name]")!;
      return {
        menu: getComputedStyle(menu).backgroundColor,
        menuBorder: getComputedStyle(menu).borderTopColor,
        name: getComputedStyle(name).color,
        play: getComputedStyle(document.querySelector(".saves-play")!).color,
      };
    });
    await page.close();
    expect(read.menu).toBe(toRgb(theme["--vscode-editor-background"]));
    expect(read.menuBorder).toBe(toRgb(theme["--vscode-panel-border"]));
    expect(read.name).toBe(toRgb(theme["--vscode-foreground"]));
    expect(read.play).toBe(toRgb(theme["--vscode-focusBorder"]));
  });
});

const VALUES_TAB = renderToString(
  h(StartingValuesTab, {
    state: {
      values: {},
      drafts: {},
      unsaved: { "store:score": "0" },
      search: "",
      listing: {
        items: [
          { key: "param:trust", name: "trust", group: "parameters", first: "nil" },
          { key: "store:score", name: "score", group: "stores", first: "0" },
        ],
      },
    },
    events: {},
  } as any),
);

describe("the Game Preview keeps the player's views readable in other VS Code themes", () => {
  it("keeps a hover wash on route controls in Dark High Contrast, which sets no toolbar hover colour", async () => {
    const page = await open(
      {
        "--vscode-font-size": "13px",
        "--vscode-foreground": "#ffffff",
        "--vscode-descriptionForeground": "#ffffff",
        "--vscode-editor-background": "#000000",
        "--vscode-panel-border": "#6fc3df",
        "--vscode-focusBorder": "#f38518",
      },
      ROUTE_LIST,
    );
    await page.hover("button[data-route-text]");
    const wash = await page.evaluate(
      () => getComputedStyle(document.querySelector("button[data-route-text]")!, "::before").backgroundColor,
    );
    await page.close();
    expect(wash).toBe("color(srgb 1 1 1 / 0.12)");
  });

  it("draws an open More button on a fill its dots read on in Light (Visual Studio)", async () => {
    const page = await open(
      {
        "--vscode-font-size": "13px",
        "--vscode-foreground": "#616161",
        "--vscode-editor-background": "#ffffff",
        "--vscode-panel-border": "#cccccc",
        "--vscode-focusBorder": "#0090f1",
        "--vscode-list-activeSelectionBackground": "#0060c0",
        "--vscode-list-activeSelectionForeground": "#ffffff",
        "--vscode-list-inactiveSelectionBackground": "#e4e6f1",
      },
      "",
    );
    const read = await page.evaluate((markup) => {
      document.querySelector("#saves-menu")!.innerHTML = markup;
      const more = document.querySelector("[data-save-more]")!;
      more.setAttribute("aria-expanded", "true");
      return { fill: getComputedStyle(more).backgroundColor, dots: getComputedStyle(more).color };
    }, SAVES_MENU);
    await page.close();
    expect(read).toEqual({ fill: "rgb(228, 230, 241)", dots: "rgb(97, 97, 97)" });
  });

  it("colours Starting values badges and fields from the theme", async () => {
    const page = await open(
      {
        "--vscode-font-size": "13px",
        "--vscode-foreground": "#3b3b3b",
        "--vscode-editor-background": "#ffffff",
        "--vscode-panel-border": "#e5e5e5",
        "--vscode-focusBorder": "#005fb8",
        "--vscode-editorWarning-foreground": "#bf8803",
        "--vscode-errorForeground": "#a1260d",
        "--vscode-input-background": "#ffffff",
        "--vscode-input-border": "#cecece",
      },
      VALUES_TAB,
    );
    const read = await page.evaluate(() => ({
      badges: [...document.querySelectorAll(".sv-badge")].map((el) => [
        el.getAttribute("data-status"),
        getComputedStyle(el).color,
      ]),
      field: getComputedStyle(document.querySelector(".sv-search")!).borderTopColor,
    }));
    await page.close();
    expect(read.badges).toEqual([
      ["warning", "rgb(191, 136, 3)"],
      ["error", "rgb(161, 38, 13)"],
    ]);
    expect(read.field).toBe("rgb(206, 206, 206)");
  });
});
