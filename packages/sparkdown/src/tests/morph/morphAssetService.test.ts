import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { FilteredSvgCache, FilteredSvgFile } from "../../filters/filteredSvg";
import { parseMorphAssetRequest, serveMorphAsset } from "../../morph/assetService";
import { serializeMorphRecipe } from "../../morph/recipe";
import { MorphBakeService, type MorphCacheEvent } from "../../morph/service";
import type { MorphArtifact } from "../../morph/types";
import { blink, blinkScript, portrait } from "./fixtures";

const memoryCache = () => {
  const store = new Map<string, string>();
  const cache: FilteredSvgCache & { store: Map<string, string> } = {
    store,
    match: async (key) => (store.has(key) ? new Response(store.get(key)!) : undefined),
    put: async (key, response) => {
      store.set(key, await response.text());
    },
    delete: async (key) => store.delete(key),
    keys: async () => [...store.keys()].map((url) => ({ url })),
  };
  return cache;
};

const file = (svg: string, lastModified = 1): FilteredSvgFile =>
  new File([svg], "bunny.svg", { type: "image/svg+xml", lastModified }) as FilteredSvgFile;

const params = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ attributes: "{}", morph: serializeMorphRecipe(blink()), key: "ref-key", ...extra });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("asset service morph endpoint", () => {
  test("a compiled reference's URL is a request the endpoint reads back exactly", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      stripImageData: true,
      files: [
        { uri: "file:///main.sd", type: "script", name: "main", ext: "sd", text: `${blinkScript()}\n[[bunny]]\n`, version: 1, languageId: "sparkdown" },
        { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", src: "/file:/local/bunny.svg?v=1-1", text: portrait() },
      ],
    } as any);
    const program = compiler.compile({ textDocument: { uri: "file:///main.sd" } }).program;
    const ref = program.morphs!.variants["bunny"]![0]!;
    const request = parseMorphAssetRequest(new URL(ref.src!, "https://host.invalid").searchParams);
    expect(request).not.toBe("invalid");
    expect(request && request !== "invalid" && serializeMorphRecipe(request.recipe)).toBe(program.morphs!.recipes["blink"]);
    expect(request && request !== "invalid" && request.key).toBe(ref.key);
  });

  test("a request that is not a morph is left to the filter, and an unreadable one is refused", () => {
    expect(parseMorphAssetRequest(new URLSearchParams({ attributes: "{}" }))).toBeUndefined();
    expect(parseMorphAssetRequest(params({ morph: "{not json" }))).toBe("invalid");
    expect(parseMorphAssetRequest(params({ key: "" }))).toBe("invalid");
  });

  test("it serves the baked artifact under the reference's key, then serves it again from Cache Storage", async () => {
    const service = new MorphBakeService();
    const baked: MorphCacheEvent[] = [];
    service.onEvent((e) => e.type === "baked" && baked.push(e));
    const cache = memoryCache();
    const request = parseMorphAssetRequest(params());
    if (!request || request === "invalid") throw new Error("unreadable request");
    const svg = portrait();
    const first = await serveMorphAsset({ service, cache, path: "local/bunny.svg", file: file(svg), request });
    expect(first.headers.get("Content-Type")).toBe("application/json");
    const artifact = (await first.json()) as MorphArtifact;
    expect(artifact.key).toBe("ref-key");
    expect(artifact.status).toBe("live");
    await flush();
    expect(cache.store.size).toBe(1);
    // A fresh service (a restarted worker) still finds it in the cache.
    const restarted = new MorphBakeService();
    restarted.onEvent((e) => e.type === "baked" && baked.push(e));
    const again = await serveMorphAsset({ service: restarted, cache, path: "local/bunny.svg", file: file(svg), request });
    expect(((await again.json()) as MorphArtifact).rest).toBe(artifact.rest);
    expect(baked).toHaveLength(1);
  });

  test("the rest render is served as an SVG image", async () => {
    const request = parseMorphAssetRequest(params({ morph_output: "rest" }));
    if (!request || request === "invalid") throw new Error("unreadable request");
    const response = await serveMorphAsset({ service: new MorphBakeService(), path: "local/bunny.svg", file: file(portrait()), request });
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    const text = await response.text();
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).toContain("<clipPath");
  });

  test("an edited file bakes again and prunes the superseded entry", async () => {
    const cache = memoryCache();
    const request = parseMorphAssetRequest(params());
    if (!request || request === "invalid") throw new Error("unreadable request");
    const service = new MorphBakeService();
    await serveMorphAsset({ service, cache, path: "local/bunny.svg", file: file(portrait(), 1), request });
    await flush();
    const before = [...cache.store.keys()];
    await serveMorphAsset({ service, cache, path: "local/bunny.svg", file: file(portrait({ dx: 22 }), 2), request });
    await flush();
    await flush();
    const after = [...cache.store.keys()];
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);
  });

  test("a bake that throws answers the rest render with the plain filtered image", async () => {
    const request = parseMorphAssetRequest(params({ morph_output: "rest" }));
    if (!request || request === "invalid") throw new Error("unreadable request");
    const service = new MorphBakeService({ bake: () => Promise.reject(new Error("boom")) });
    const response = await serveMorphAsset({ service, path: "local/bunny.svg", file: file(portrait()), request });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("<clipPath");
    expect(text).toContain("eyeball-white-left");
  });
});
