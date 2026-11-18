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
      <span class="transport-icon" data-icon="run-again"></span>
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
      runAgain: color('.transport-icon[data-icon="run-again"]'),
      replayBeat: color('.transport-icon[data-icon="replay-beat"]'),
      error: color("#location-items.error"),
      toolbarBorder: getComputedStyle(document.querySelector("#toolbar")!).borderTopColor,
      runSeparator: getComputedStyle(document.querySelector("#run-button")!).borderRightColor,
    };
  });
  await page.close();
  return result;
};

const standalone = `<!DOCTYPE html><html><head></head><body><spark-web-player></spark-web-player></body></html>`;

describe("the Game Preview bar takes its Run, Stop and border colours from the VS Code theme (I-2520)", () => {
  it.each(Object.entries(THEMES))("in %s", async (_, theme) => {
    const bar = await paint(template, theme);
    const start = toRgb(theme["--vscode-debugIcon-startForeground"]);
    expect(bar.run).toBe(start);
    expect(bar.runAgain).toBe(start);
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
      runAgain: toRgb("#89d185"),
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

  it("puts no fixed dark theme class on the page", async () => {
    const bar = await paint(template, THEMES["Light Modern"]);
    expect(bar.htmlClasses).not.toContain("theme-dark");
  });
});
