// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { FilteredSvgFile } from "../../../packages/sparkdown/src/filters/filteredSvg";
import { parseMorphAssetRequest, serveMorphAsset } from "../../../packages/sparkdown/src/morph/assetService";
import { serializeMorphRecipe } from "../../../packages/sparkdown/src/morph/recipe";
import { MorphBakeService, type MorphCacheEvent } from "../../../packages/sparkdown/src/morph/service";
import type { MorphArtifact } from "../../../packages/sparkdown/src/morph/types";
import { blink, portrait } from "../../../packages/sparkdown/src/tests/morph/fixtures";
import { viteStaticallyRenderedPagesPlugin } from "../../vite.config";

vi.mock("chokidar", () => {
  const watcher = { on: () => watcher };
  return { watch: () => watcher };
});

const client = "morph-mirror-test";
let dir: string;
type Middleware = (req: unknown, res: unknown, next: () => void) => Promise<void> | void;
let mirror: Middleware;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "morph-mirror-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  const middlewares: Middleware[] = [];
  const plugin = viteStaticallyRenderedPagesPlugin();
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: { use: (fn: Middleware) => middlewares.push(fn) },
    ws: { send: () => {} },
  });
  cwd.mockRestore();
  mirror = middlewares[0]!;
  const file = path.join(dir, "out", ".dev", "asset-mirror", client, "local", "bunny.svg");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, portrait());
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const query = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ attributes: "{}", morph: serializeMorphRecipe(blink()), key: "ref-key", ...extra }).toString();

const get = (url: string) =>
  new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 0,
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = String(value);
      },
      end: (body?: string | Buffer) => resolve({ status: res.statusCode, headers, body: String(body ?? "") }),
    };
    const req = { url, method: "GET", headers: { cookie: `devAssetMirrorClient=${client}` }, on: () => {} };
    Promise.resolve(mirror(req, res, () => reject(new Error(`not served: ${url}`)))).catch(reject);
  });

const recordBakes = () => {
  const identities: string[] = [];
  const request = MorphBakeService.prototype.request;
  vi.spyOn(MorphBakeService.prototype, "request").mockImplementation(function (this: MorphBakeService, identity, ...rest) {
    identities.push(identity);
    return request.call(this, identity, ...rest);
  });
  return identities;
};

describe("dev server asset mirror morph route", () => {
  test("it serves the baked artifact for a mirrored SVG under the request's key", async () => {
    const response = await get(`/file:/local/bunny.svg?${query()}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    const artifact = JSON.parse(response.body) as MorphArtifact;
    expect(artifact.key).toBe("ref-key");
    expect(artifact.status).toBe("live");
  });

  test("it serves the rest render as an SVG image", async () => {
    const response = await get(`/file:/local/bunny.svg?${query({ morph_output: "rest" })}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/svg+xml");
    const artifact = await get(`/file:/local/bunny.svg?${query()}`);
    expect(response.body).toBe((JSON.parse(artifact.body) as MorphArtifact).rest);
  });

  test("it refuses an unreadable request without reaching the service", async () => {
    const identities = recordBakes();
    for (const bad of [query({ key: "" }), query({ morph: "{not json" }), query({ attributes: "{not json" })]) {
      const response = await get(`/file:/local/bunny.svg?${bad}`);
      expect(response.status).toBe(400);
      expect(response.body).toBe("Unreadable morph request");
    }
    expect(identities).toHaveLength(0);
  });

  test("it bakes under the worker route's identity, and a differently spelled URL reuses the entry", async () => {
    const identities = recordBakes();
    const emit = vi.spyOn(MorphBakeService.prototype as unknown as { emit: (e: MorphCacheEvent) => void }, "emit");
    const recipe = serializeMorphRecipe(
      blink({
        keyframes: [
          { offset: 0, eyes: { state: "open" } },
          { offset: 0.5, eyes: { state: "closed" } },
          { offset: 1, eyes: { state: "open" } },
        ],
      }),
    );
    await get(`/file:/local/bunny.svg?${query({ morph: recipe })}`);
    expect(identities).toHaveLength(1);
    const request = parseMorphAssetRequest(new URLSearchParams(query({ morph: recipe })));
    if (!request || request === "invalid") throw new Error("unreadable request");
    const file = new File([portrait()], "bunny.svg", { type: "image/svg+xml", lastModified: 1 }) as FilteredSvgFile;
    await serveMorphAsset({ service: new MorphBakeService(), path: "/file:/other/bunny.svg", file, request, keyPrefix: "file:" });
    expect(identities).toHaveLength(2);
    expect(identities[1]).toBe(identities[0]);
    const respelled = new URLSearchParams({ v: "99", key: "other-key", morph: recipe, attributes: "{}" }).toString();
    const again = await get(`/file:/local/./bunny.svg?${respelled}`);
    expect((JSON.parse(again.body) as MorphArtifact).key).toBe("other-key");
    expect(identities).toHaveLength(3);
    expect(identities[2]).toBe(identities[0]);
    expect(emit.mock.calls.filter(([e]) => e.type === "baked")).toHaveLength(2);
  });

  test("a plain request for the same file is left to the rest of the mirror", async () => {
    const response = await get(`/file:/local/bunny.svg`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/svg+xml");
    expect(response.body).toBe(portrait());
  });
});
