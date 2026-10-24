// @vitest-environment node
// The dev server's asset mirror answers morph requests on mirrored SVGs when
// no service worker controls the page. It must answer them the way the
// worker's route does: the baked artifact under the reference's key, the rest
// render as an SVG, a refusal for an unreadable request, and the same
// content-derived identity, so both routes bake and reuse one artifact.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { FilteredSvgFile } from "../../../packages/sparkdown/src/filters/filteredSvg";
import { parseMorphAssetRequest, serveMorphAsset } from "../../../packages/sparkdown/src/morph/assetService";
import { serializeMorphRecipe } from "../../../packages/sparkdown/src/morph/recipe";
import { MorphBakeService, type MorphCacheEvent } from "../../../packages/sparkdown/src/morph/service";
import type { MorphArtifact } from "../../../packages/sparkdown/src/morph/types";
import { blink, portrait } from "../../../packages/sparkdown/src/tests/morph/fixtures";
import { serveMirroredMorphAsset } from "../../vite.config";

let dir: string;
let abs: string;
const rel = "local/bunny.svg";

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "morph-mirror-"));
  abs = path.join(dir, "bunny.svg");
  fs.writeFileSync(abs, portrait());
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const params = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ attributes: "{}", morph: serializeMorphRecipe(blink()), key: "ref-key", ...extra });

// Records the identity each bake request is made under.
const recordingService = () => {
  const service = new MorphBakeService();
  const identities: string[] = [];
  const request = service.request.bind(service);
  vi.spyOn(service, "request").mockImplementation((identity, ...rest) => {
    identities.push(identity);
    return request(identity, ...rest);
  });
  const baked: MorphCacheEvent[] = [];
  service.onEvent((e) => e.type === "baked" && baked.push(e));
  return { service, identities, baked };
};

describe("dev server asset mirror morph route", () => {
  test("it serves the baked artifact for a mirrored SVG under the request's key", async () => {
    const { service } = recordingService();
    const response = await serveMirroredMorphAsset({ service, rel, abs, params: params() });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("application/json");
    const artifact = (await response!.json()) as MorphArtifact;
    expect(artifact.key).toBe("ref-key");
    expect(artifact.status).toBe("live");
  });

  test("it serves the rest render as an SVG image", async () => {
    const { service } = recordingService();
    const response = await serveMirroredMorphAsset({ service, rel, abs, params: params({ morph_output: "rest" }) });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await response!.text()).toMatch(/^<svg/);
  });

  test("it refuses an unreadable request without reaching the service", async () => {
    const { service, identities } = recordingService();
    for (const bad of [params({ key: "" }), params({ morph: "{not json" }), params({ attributes: "{not json" })]) {
      const response = await serveMirroredMorphAsset({ service, rel, abs, params: bad });
      expect(response?.status).toBe(400);
    }
    expect(identities).toHaveLength(0);
  });

  test("it leaves requests that are not morphs on SVGs to the rest of the mirror", async () => {
    const { service } = recordingService();
    expect(await serveMirroredMorphAsset({ service, rel, abs, params: new URLSearchParams({ attributes: "{}" }) })).toBeUndefined();
    expect(await serveMirroredMorphAsset({ service, rel: "local/bunny.png", abs: path.join(dir, "bunny.png"), params: params() })).toBeUndefined();
  });

  test("it bakes under the worker route's identity, and a differently spelled URL reuses the entry", async () => {
    const { service, identities, baked } = recordingService();
    await serveMirroredMorphAsset({ service, rel, abs, params: params() });
    // The worker's route: the same content from OPFS under its own path,
    // key prefix and Cache Storage-less fallback.
    const worker = recordingService();
    const request = parseMorphAssetRequest(params());
    if (!request || request === "invalid") throw new Error("unreadable request");
    const file = new File([portrait()], "bunny.svg", { type: "image/svg+xml", lastModified: 1 }) as FilteredSvgFile;
    await serveMorphAsset({ service: worker.service, path: "/file:/other/bunny.svg", file, request, keyPrefix: "file:" });
    expect(identities).toHaveLength(1);
    expect(worker.identities).toEqual(identities);
    // Same content, selection and recipe, spelled with another key, a
    // cache-buster and reordered parameters.
    const respelled = new URLSearchParams({ v: "99", key: "other-key", morph: serializeMorphRecipe(blink()), attributes: "{}" });
    const again = await serveMirroredMorphAsset({ service, rel: "local/./bunny.svg", abs, params: respelled });
    expect(((await again!.json()) as MorphArtifact).key).toBe("other-key");
    expect(identities).toEqual([identities[0], identities[0]]);
    expect(baked).toHaveLength(1);
  });
});
