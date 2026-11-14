// @vitest-environment node
import preact from "@preact/preset-vite";
import { JSDOM, VirtualConsole } from "jsdom";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { markdownHtmlPlugin } from "../../src/build/markdownHtml";
import { alias, dedupe, renderDevPage, ssrNoExternal } from "../../vite.config";

let server: ViteDevServer;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias, dedupe },
    ssr: { noExternal: ssrNoExternal },
    plugins: [markdownHtmlPlugin(), preact()],
  });
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("the editor page the dev server serves", () => {
  it("ships the root empty, so no control shows before the client attaches its handlers", async () => {
    const html = await renderDevPage(server, "/");
    expect(html).toBeDefined();
    const { document } = new JSDOM(html!, {
      virtualConsole: new VirtualConsole(),
    }).window;
    const root = document.getElementById("root");
    expect(root).not.toBeNull();
    expect(root!.innerHTML).toBe("");
    expect(document.querySelectorAll("button, input, a[href]")).toHaveLength(0);
    expect(document.getElementById("ssg-css")).not.toBeNull();
    expect(
      document.querySelector('script[type="module"][src="/src/pages/index.ts"]'),
    ).not.toBeNull();
  }, 120_000);

  it("leaves a route with no page to the next handler", async () => {
    expect(await renderDevPage(server, "/no-such-page")).toBeUndefined();
  });
});
