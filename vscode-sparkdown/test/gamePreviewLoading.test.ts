// What the Game Preview panel shows before its first preview (#1221). On a
// large project the player mounts and then compiles the whole project cold in
// its own worker, several seconds in which the panel keeps the player hidden.
// It hid the whole page, so the author saw a black rectangle with nothing to
// say the preview was coming.

import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

let manager: any;

// The manager pulls in the engine's definitions, a slow first import.
beforeAll(async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  manager = SparkdownPreviewGamePanelManager.instance;
}, 120000);

/** The panel's page as the webview first renders it, before its script runs. */
const panelPage = () => {
  const html: string = manager.getWebviewContent(
    { cspSource: "csp", asWebviewUri: (uri: string) => uri },
    { extensionUri: "ext" },
  );
  return new JSDOM(html).window;
};

/** Whether `element` is rendered visibly: neither it nor an ancestor is
 *  removed from layout or fully transparent. */
const shown = (window: Window, element: Element | null) => {
  expect(element).not.toBeNull();
  for (let e: Element | null = element; e; e = e.parentElement) {
    const style = window.getComputedStyle(e);
    if (style.display === "none" || style.opacity === "0") {
      return false;
    }
  }
  return true;
};

describe("the Game Preview panel before its first preview", () => {
  it("shows that the preview is loading while the player is hidden", () => {
    const window = panelPage();
    const document = window.document;
    const loading = document.querySelector('[role="progressbar"]');

    expect(shown(window as any, document.querySelector("spark-web-player"))).toBe(
      false,
    );
    expect(shown(window as any, loading)).toBe(true);
    expect(loading?.getAttribute("aria-label")).toBe("Loading Game Preview");
  });

  it("shows the player in place of the loading indicator once revealed", () => {
    const window = panelPage();
    const document = window.document;
    document.body.classList.add("ready");

    expect(shown(window as any, document.querySelector("spark-web-player"))).toBe(
      true,
    );
    expect(shown(window as any, document.querySelector('[role="progressbar"]'))).toBe(
      false,
    );
  });
});
