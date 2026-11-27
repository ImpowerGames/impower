// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

const PLAYER_CSS = readFileSync(
  join(__dirname, "..", "..", "packages", "spark-web-player", "src", "spark-web-player.css"),
  "utf8",
);

const BAR = `
  <div id="toolbar">
    <div id="location-items" class="error">no scene named start</div>
    <button type="button" id="run-button" class="toolbar-button transport-button">
      <span class="transport-icon" data-icon="run"></span>
    </button>
    <button type="button" class="toolbar-button transport-button">
      <span class="transport-icon" data-icon="stop"></span>
    </button>
    <button type="button" class="toolbar-button transport-button">
      <span class="transport-icon" data-icon="restart"></span>
    </button>
    <button type="button" id="replay-beat-button" class="toolbar-button transport-button">
      <span class="transport-icon" data-icon="replay-beat"></span>
    </button>
  </div>
`;

const THEMES = {
  "Light Modern": {
    "--vscode-debugIcon-startForeground": "#388a34",
    "--vscode-debugIcon-stopForeground": "#a1260d",
    "--vscode-panel-border": "#e5e5e5",
    "--vscode-editor-background": "#ffffff",
    "--vscode-foreground": "#3b3b3b",
  },
  "Dark Modern": {
    "--vscode-debugIcon-startForeground": "#89d185",
    "--vscode-debugIcon-stopForeground": "#f48771",
    "--vscode-panel-border": "#2b2b2b",
    "--vscode-editor-background": "#1f1f1f",
    "--vscode-foreground": "#cccccc",
  },
  "Dark High Contrast": {
    "--vscode-debugIcon-startForeground": "#89d185",
    "--vscode-debugIcon-stopForeground": "#f48771",
    "--vscode-panel-border": "#6fc3df",
    "--vscode-editor-background": "#000000",
    "--vscode-foreground": "#ffffff",
  },
} as const;

const HOVER_THEMES = {
  "Light Modern": {
    vars: {
      "--vscode-toolbar-hoverBackground": "rgba(184, 184, 184, 0.31)",
      "--vscode-toolbar-activeBackground": "rgba(166, 166, 166, 0.31)",
      "--vscode-editor-background": "#ffffff",
      "--vscode-foreground": "#3b3b3b",
    },
    hover: "rgba(184, 184, 184, 0.31)",
    active: "rgba(166, 166, 166, 0.31)",
  },
  "Dark Modern": {
    vars: {
      "--vscode-toolbar-hoverBackground": "rgba(90, 93, 94, 0.31)",
      "--vscode-toolbar-activeBackground": "rgba(99, 102, 103, 0.31)",
      "--vscode-editor-background": "#1f1f1f",
      "--vscode-foreground": "#cccccc",
    },
    hover: "rgba(90, 93, 94, 0.31)",
    active: "rgba(99, 102, 103, 0.31)",
  },
  "Dark High Contrast": {
    vars: {
      "--vscode-editor-background": "#000000",
      "--vscode-foreground": "#ffffff",
    },
    hover: "color(srgb 1 1 1 / 0.12)",
    active: "color(srgb 1 1 1 / 0.18)",
  },
  "Light High Contrast": {
    vars: {
      "--vscode-editor-background": "#ffffff",
      "--vscode-foreground": "#292929",
    },
    hover: "color(srgb 0.160784 0.160784 0.160784 / 0.12)",
    active: "color(srgb 0.160784 0.160784 0.160784 / 0.18)",
  },
} as const;

type Theme = Record<string, string>;

let browser: Browser;
let template: string;

beforeAll(async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const manager: any = SparkdownPreviewGamePanelManager.instance;
  template = manager.getWebviewContent(
    { cspSource: "csp", asWebviewUri: (uri: string) => uri },
    { extensionUri: "ext" },
  );
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const paint = async (html: string, theme: Theme | null) => {
  const page = await browser.newPage();
  const vars = theme
    ? Object.entries(theme)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ")
    : "";
  const withTheme = html
    .replace(/<html([^>]*)>/, `<html$1 style="${vars}">`)
    .replace("</head>", `<style>${PLAYER_CSS}</style></head>`)
    .replace(/<spark-web-player([^>]*)><\/spark-web-player>/, `<spark-web-player$1>${BAR}</spark-web-player>`);
  await page.setContent(withTheme);
  const result = await page.evaluate(() => {
    const color = (selector: string) =>
      getComputedStyle(document.querySelector(selector)!).color;
    return {
      htmlClasses: [...document.documentElement.classList],
      run: color('.transport-icon[data-icon="run"]'),
      stop: color('.transport-icon[data-icon="stop"]'),
      restart: color('.transport-icon[data-icon="restart"]'),
      replayBeat: color('.transport-icon[data-icon="replay-beat"]'),
      error: color("#location-items.error"),
      toolbarBorder: getComputedStyle(document.querySelector("#toolbar")!).borderTopColor,
      runSeparator: getComputedStyle(document.querySelector("#run-button")!).borderRightColor,
    };
  });
  await page.close();
  return result;
};

const pointAt = async (html: string, theme: Theme | null) => {
  const page = await browser.newPage();
  const vars = theme
    ? Object.entries(theme)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ")
    : "";
  await page.setContent(
    html
      .replace(/<html([^>]*)>/, `<html$1 style="${vars}">`)
      .replace("</head>", `<style>${PLAYER_CSS}</style></head>`)
      .replace(/<spark-web-player([^>]*)><\/spark-web-player>/, `<spark-web-player$1>${BAR}</spark-web-player>`),
  );
  const background = () =>
    page.evaluate(() => getComputedStyle(document.querySelector("#replay-beat-button")!).backgroundColor);
  await page.hover("#replay-beat-button");
  const hover = await background();
  await page.mouse.down();
  const active = await background();
  await page.mouse.up();
  await page.close();
  return { hover, active };
};

const standalone = `<!DOCTYPE html><html><head></head><body><spark-web-player></spark-web-player></body></html>`;

describe("the Game Preview bar takes its Run, Stop and border colours from the VS Code theme (I-2520)", () => {
  it.each(Object.entries(THEMES))("in %s", async (_, theme) => {
    const bar = await paint(template, theme);
    const start = toRgb(theme["--vscode-debugIcon-startForeground"]);
    expect(bar.run).toBe(start);
    expect(bar.restart).toBe(start);
    expect(bar.replayBeat).toBe(start);
    expect(bar.stop).toBe(toRgb(theme["--vscode-debugIcon-stopForeground"]));
    const border = toRgb(theme["--vscode-panel-border"]);
    expect(bar.toolbarBorder).toBe(border);
    expect(bar.runSeparator).toBe(border);
  });

  it("leaves the bar's error text on the player's error colour", async () => {
    const bar = await paint(template, THEMES["Light Modern"]);
    expect(bar.error).toBe(toRgb("#f14c4c"));
  });

  it("keeps the player's own colours where a host supplies none", async () => {
    const bar = await paint(standalone, null);
    expect(bar).toMatchObject({
      run: toRgb("#89d185"),
      restart: toRgb("#89d185"),
      replayBeat: toRgb("#89d185"),
      stop: toRgb("#f14c4c"),
      error: toRgb("#f14c4c"),
      toolbarBorder: "rgba(255, 255, 255, 0.15)",
      runSeparator: "rgba(255, 255, 255, 0.15)",
    });
  });

  it("colours Stop from a host's error colour when it sets no stop colour", async () => {
    const page = await browser.newPage();
    await page.setContent(
      `<html><head><style>${PLAYER_CSS}</style><style>spark-web-player { --swp-error-color: #123456; }</style></head><body><spark-web-player>${BAR}</spark-web-player></body></html>`,
    );
    const stop = await page.evaluate(
      () => getComputedStyle(document.querySelector('.transport-icon[data-icon="stop"]')!).color,
    );
    await page.close();
    expect(stop).toBe(toRgb("#123456"));
  });

  it.each(Object.entries(HOVER_THEMES))(
    "highlights a hovered and a pressed bar button with the toolbar colours of %s",
    async (_, theme) => {
      expect(await pointAt(template, theme.vars)).toEqual({
        hover: theme.hover,
        active: theme.active,
      });
    },
  );

  it("keeps the player's own hover and pressed colours where a host supplies none", async () => {
    expect(await pointAt(standalone, null)).toEqual({
      hover: "rgba(255, 255, 255, 0.12)",
      active: "rgba(255, 255, 255, 0.18)",
    });
  });

  it("puts no fixed dark theme class on the page", async () => {
    const bar = await paint(template, THEMES["Light Modern"]);
    expect(bar.htmlClasses).not.toContain("theme-dark");
  });
});

const FOCUS_BORDERS = {
  "Light Modern": "#005fb8",
  "Dark Modern": "#0078d4",
  "Dark High Contrast": "#f38518",
  "Light High Contrast": "#006bbd",
} as const;

const tabThroughBar = async (html: string, theme: Theme | null) => {
  const page = await browser.newPage();
  const vars = theme
    ? Object.entries(theme)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ")
    : "";
  await page.setContent(
    html
      .replace(/<html([^>]*)>/, `<html$1 style="${vars}">`)
      .replace("</head>", `<style>${PLAYER_CSS}</style></head>`)
      .replace(/<spark-web-player([^>]*)><\/spark-web-player>/, `<spark-web-player$1>${BAR}</spark-web-player>`),
  );
  const rings = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    rings.push(
      await page.evaluate(() => {
        const element = document.activeElement!;
        const style = getComputedStyle(element);
        return {
          focusVisible: element.matches(":focus-visible"),
          style: style.outlineStyle,
          width: style.outlineWidth,
          color: style.outlineColor,
          offset: style.outlineOffset,
        };
      }),
    );
  }
  await page.close();
  return rings;
};

describe("a bar button focused from the keyboard shows a focus ring (I-2532)", () => {
  it.each(Object.entries(FOCUS_BORDERS))("in the Game Preview under %s", async (_, focusBorder) => {
    const rings = await tabThroughBar(template, { "--vscode-focusBorder": focusBorder });
    for (const ring of rings) {
      expect(ring).toEqual({
        focusVisible: true,
        style: "solid",
        width: "2px",
        color: toRgb(focusBorder),
        offset: "-2px",
      });
    }
  });

  it("in the player's own accent colour where a host supplies none", async () => {
    const rings = await tabThroughBar(standalone, null);
    for (const ring of rings) {
      expect(ring).toEqual({
        focusVisible: true,
        style: "solid",
        width: "2px",
        color: toRgb("#66baff"),
        offset: "-2px",
      });
    }
  });
});
