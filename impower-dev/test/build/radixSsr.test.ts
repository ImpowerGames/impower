// @vitest-environment node
// Every Radix primitive impower-ui depends on must load and render through the
// dev server's ssrLoadModule, the path that pre-renders the editor's page root
// (vite.config.ts's SSG plugin). With only @radix-ui/* in ssr.noExternal, their
// CommonJS and ESM helpers (react-remove-scroll, @floating-ui/react-dom) are
// externalized, import "react" through Node and fail with "Cannot find module
// 'react'" (#1585).
import preact from "@preact/preset-vite";
import { h, type ComponentType } from "preact";
import { renderToString } from "preact-render-to-string";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alias, dedupe, ssrNoExternal } from "../../vite.config";

const FIXTURE = "/test/build/fixtures/RadixPrimitives.tsx";

let server: ViteDevServer;
let fixture: Record<string, ComponentType>;

const render = (name: string) => renderToString(h(fixture[name]!, null));

beforeAll(async () => {
  // The dev server's resolve and ssr configuration (build.ts serve()), with
  // nothing listening.
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias, dedupe },
    ssr: { noExternal: ssrNoExternal },
    plugins: [preact()],
  });
  fixture = await server.ssrLoadModule(FIXTURE);
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("Radix primitives under the dev server's ssrLoadModule", () => {
  it("renders a portal-mounted Dialog's trigger", () => {
    const html = render("PortalDialog");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(">Open dialog</button>");
    // Radix mounts a portal only on the client.
    expect(html).not.toContain("Portal dialog body");
  });

  it("renders an open Dialog's content in place", () => {
    const html = render("OpenDialog");
    expect(html).toMatch(/<div role="dialog"[^>]*data-state="open"/);
    expect(html).toContain("<h2");
    expect(html).toContain("Open dialog title</h2>");
    expect(html).toContain("Open dialog body</p>");
  });

  it("renders a DropdownMenu trigger", () => {
    const html = render("Menu");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain(">Menu</button>");
  });

  it("renders a Select trigger and its native select", () => {
    const html = render("Choice");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Choice"');
    expect(html).toContain('<select aria-hidden="true"');
  });

  it("renders Tabs with the default panel active", () => {
    const html = render("TabStrip");
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Tab one</);
    expect(html).toMatch(/data-state="active"[^>]*role="tabpanel"[^>]*>Panel one</);
  });

  it("renders a Tooltip trigger", () => {
    const html = render("Hint");
    expect(html).toContain('data-state="closed"');
    expect(html).toContain(">Hover me</button>");
  });
});
