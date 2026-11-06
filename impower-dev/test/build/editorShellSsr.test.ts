// @vitest-environment node
import preact from "@preact/preset-vite";
import { h, type ComponentType } from "preact";
import { renderToString } from "preact-render-to-string";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alias, dedupe, ssrNoExternal } from "../../vite.config";

let server: ViteDevServer;
let rootComponent: ComponentType;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias, dedupe },
    ssr: { noExternal: ssrNoExternal },
    plugins: [preact()],
  });
  ({ rootComponent } = await server.ssrLoadModule(
    "/src/modules/spark-editor/preact-registry.ts",
  ));
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("the editor shell's server render", () => {
  it("leaves the bottom navigation's selected screen to the client", () => {
    const html = renderToString(h(rootComponent, null));
    expect(html).toContain("data-bottom-navigation");
    for (const screen of ["logic", "assets", "share"]) {
      expect(html).not.toMatch(new RegExp(`id="[^"]*-trigger-${screen}"`));
    }
  });
});
