// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { resolveConfig, type IndexHtmlTransformContext } from "vite";
import { describe, expect, it } from "vitest";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetPreviewThemeMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetPreviewThemeMessage";
import { followPreviewTheme } from "../../../sparkdown-player-app/src/previewTheme";

const PLAYER_ROOT = resolve("../sparkdown-player-app");
const PLAYER_HTML = resolve(PLAYER_ROOT, "index.html");

const servedPlayerHtml = async (): Promise<string> => {
  const config = await resolveConfig(
    {
      root: PLAYER_ROOT,
      configFile: resolve(PLAYER_ROOT, "vite.config.ts"),
      logLevel: "silent",
    },
    "serve",
    "development",
  );
  const context = {
    path: "/index.html",
    filename: PLAYER_HTML,
  } as IndexHtmlTransformContext;
  let html = readFileSync(PLAYER_HTML, "utf8");
  for (const plugin of config.plugins) {
    const hook = plugin.transformIndexHtml;
    if (!hook || typeof hook === "function" || hook.order !== "pre") {
      continue;
    }
    const result = await hook.handler.call({} as never, html, context);
    if (typeof result !== "string") {
      throw new Error(`${plugin.name} returned tags; this test reads strings`);
    }
    html = result;
  }
  return html;
};

const rgba = (color: string, win: Window) => {
  const probe = win.document.createElement("div");
  probe.style.color = color;
  win.document.body.append(probe);
  const resolved = win.getComputedStyle(probe).color;
  probe.remove();
  const parts = resolved.match(/[\d.]+/g)?.map(Number) ?? [];
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1, resolved };
};

const substituteVariable = (value: string, element: Element, win: Window) => {
  const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return reference
    ? win.getComputedStyle(element).getPropertyValue(reference[1]!).trim()
    : value;
};

describe("the player's document before its stylesheet and script run", () => {
  it("paints an opaque dark background on its root", async () => {
    const dom = new JSDOM(await servedPlayerHtml());
    const win = dom.window as unknown as Window;
    const root = win.document.documentElement;
    const background = substituteVariable(
      win.getComputedStyle(root).backgroundColor,
      root,
      win,
    );
    expect(background).not.toBe("");
    const { r, g, b, a, resolved } = rgba(background, win);
    expect(resolved).toMatch(/^rgba?\(/);
    expect(a).toBe(1);
    expect((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255).toBeLessThan(0.2);
  });

  for (const theme of ["charcoal", "chalk"]) {
    it(`paints the game's black on its root when the host asks for the game backdrop in ${theme}`, async () => {
      const dom = new JSDOM(await servedPlayerHtml(), {
        url: `http://localhost/#theme=${theme}&backdrop=game`,
        runScripts: "dangerously",
      });
      const win = dom.window as unknown as Window;
      const root = win.document.documentElement;
      expect(root.dataset["backdrop"]).toBe("game");
      const background = substituteVariable(
        win.getComputedStyle(root).backgroundColor,
        root,
        win,
      );
      const { r, g, b, a } = rgba(background, win);
      expect([r, g, b, a]).toEqual([0, 0, 0, 1]);
    });

    it(`paints the theme's panel on its root when the host names no backdrop in ${theme}`, async () => {
      const dom = new JSDOM(await servedPlayerHtml(), {
        url: `http://localhost/#theme=${theme}`,
        runScripts: "dangerously",
      });
      const win = dom.window as unknown as Window;
      const root = win.document.documentElement;
      expect(root.dataset["backdrop"]).toBeUndefined();
      expect(win.getComputedStyle(root).backgroundColor).toBe("var(--panel)");
    });
  }
});

describe("the player's viewport before the game paints", () => {
  const CSS = [
    readFileSync(resolve("../packages/spark-web-player/src/spark-web-player.css"), "utf8"),
    readFileSync(resolve("../sparkdown-player-app/src/style.css"), "utf8"),
  ].join("\n");

  const viewportBackground = (backdrop: string | undefined) => {
    const attribute = backdrop ? ` data-backdrop="${backdrop}"` : "";
    const dom = new JSDOM(
      `<!doctype html><html${attribute}><head><style>${CSS}</style></head><body><spark-web-player><div id="viewport"></div></spark-web-player></body></html>`,
    );
    const viewport = dom.window.document.getElementById("viewport")!;
    return dom.window.getComputedStyle(viewport).backgroundColor;
  };

  it("shows the game's background under the game backdrop", () => {
    expect(viewportBackground("game")).toBe(
      "var(--swp-game-background-color)",
    );
  });

  it("shows the player's background otherwise", () => {
    expect(viewportBackground(undefined)).toBe("var(--swp-background-color)");
  });
});

describe("the player's theme", () => {
  it("is the one its URL names before its stylesheet and script run", async () => {
    const dom = new JSDOM(await servedPlayerHtml(), {
      url: "http://localhost/#theme=chalk",
      runScripts: "dangerously",
    });
    const win = dom.window as unknown as Window;
    const root = win.document.documentElement;
    expect(root.dataset["theme"]).toBe("chalk");
    const background = substituteVariable(
      win.getComputedStyle(root).backgroundColor,
      root,
      win,
    );
    const { r, g, b } = rgba(background, win);
    expect((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255).toBeGreaterThan(
      0.8,
    );
  });

  it("stays Midnight when its URL names none", async () => {
    const dom = new JSDOM(await servedPlayerHtml(), {
      url: "http://localhost/",
      runScripts: "dangerously",
    });
    expect(
      dom.window.document.documentElement.dataset["theme"],
    ).toBeUndefined();
  });

  it("follows the editor's theme messages until it stops listening", () => {
    const dom = new JSDOM("<!doctype html><html></html>");
    const root = dom.window.document.documentElement;
    const target = new EventTarget();
    const stop = followPreviewTheme(root, target);
    sendProtocolMessage(
      SetPreviewThemeMessage.type.notification({ theme: "charcoal" }),
      target,
    );
    expect(root.dataset["theme"]).toBe("charcoal");
    stop();
    sendProtocolMessage(
      SetPreviewThemeMessage.type.notification({ theme: "chalk" }),
      target,
    );
    expect(root.dataset["theme"]).toBe("charcoal");
  });
});

describe("the player's fullscreen bar", () => {
  const stylesheet = (path: string) => readFileSync(resolve(path), "utf8");
  const CSS = [
    stylesheet("../packages/impower-ui/src/theme.css"),
    stylesheet("../packages/spark-web-player/src/spark-web-player.css"),
    stylesheet("../sparkdown-player-app/src/style.css"),
  ].join("\n");

  const STAGES: Record<string, string> = {
    chalk: "#e6e6e8",
    charcoal: "#0a0a0b",
    midnight: "",
  };

  for (const theme of ["chalk", "charcoal", "midnight"]) {
    it(`draws the fullscreen bar in the theme's ink over a fade into the theme's stage in ${theme}`, () => {
      const dom = new JSDOM(
        `<!doctype html><html data-theme="${theme}"><head><style>${CSS}</style></head><body><spark-web-player><div id="viewport" class="fullscreen"><div id="toolbar"><span id="ending-status">Story ran out</span></div></div></spark-web-player></body></html>`,
      );
      const win = dom.window as unknown as Window;
      const root = win.document.documentElement;
      const host = win.document.querySelector("spark-web-player")!;
      const viewport = win.document.getElementById("viewport")!;
      const toolbar = win.document.getElementById("toolbar")!;
      const resolveVar = (value: string) =>
        value.replace(/^var\((--[\w-]+)\)$/, (_, name: string) =>
          win.getComputedStyle(host).getPropertyValue(name).trim(),
        );
      const toolbarStyle = win.getComputedStyle(toolbar);
      expect(resolveVar(toolbarStyle.color)).toBe(
        "color-mix(in srgb, var(--ink) 87%, transparent)",
      );
      expect(
        resolveVar(toolbarStyle.getPropertyValue("--swp-toolbar-color").trim()),
      ).toBe("var(--ink)");
      expect(toolbarStyle.backgroundImage).toBe(
        "var(--swp-toolbar-fullscreen-gradient)",
      );
      const gradient = win
        .getComputedStyle(host)
        .getPropertyValue("--swp-toolbar-fullscreen-gradient");
      expect(gradient).toMatch(/var\(--stage\) 100%/);
      expect(gradient).not.toMatch(/rgba?\(0, ?0, ?0/);
      expect(
        win.getComputedStyle(viewport).getPropertyValue("--swp-game-background-color").trim(),
      ).toBe("var(--stage)");
      expect(win.getComputedStyle(root).getPropertyValue("--stage").trim()).toBe(
        "var(--stage-full, rgb(0 0 0))",
      );
      expect(win.getComputedStyle(root).getPropertyValue("--stage-full").trim()).toBe(
        STAGES[theme],
      );
      const chip = win.document.getElementById("ending-status")!;
      expect(win.getComputedStyle(chip).backgroundColor).toBe(
        "var(--swp-background-color)",
      );
      expect(win.getComputedStyle(chip).color).toMatch(/var\(--ink\)/);
    });
  }
});
