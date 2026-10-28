import { describe, expect, test } from "vitest";
import { bakeMorphArtifactAsync, type MorphBakeInput, type MorphGeometryCache } from "../../morph/bake";
import { MorphArtifactSlot, type MorphHost } from "../../morph/hosts";
import { MorphBakeService, type MorphCacheEvent, type MorphLoad } from "../../morph/service";
import { MORPH_BAKE_FORMAT, type MorphArtifact, type MorphRef } from "../../morph/types";
import { blink, portrait } from "./fixtures";

const artifactFor = (key: string): MorphArtifact => ({
  format: MORPH_BAKE_FORMAT,
  key,
  morph: "blink",
  status: "static",
  rest: `<svg data-key='${key}'/>`,
  idPrefix: "_m0_",
  parts: [{ kind: "static", svg: "<svg/>" }],
  visibility: {},
  schedules: {},
  segments: [],
  frames: [],
  apertures: [],
  apertureEdges: [],
  clipTargets: [],
  diagnostics: [],
});

const input = (key: string): MorphBakeInput => ({ source: "<svg/>", selection: {}, recipe: blink(), key });
const bakeLoad = (key: string, source = "s1") => async (): Promise<MorphLoad> => ({ kind: "bake", input: input(key), source });

/** A bake that waits until the test lets it finish, and counts its runs. */
function controlledService(options: ConstructorParameters<typeof MorphBakeService>[0] = {}) {
  const runs: { key: string; signal: AbortSignal; finish: () => void }[] = [];
  const service = new MorphBakeService({
    ...options,
    bake: (bakeInput, { signal }) =>
      new Promise<MorphArtifact>((resolve, reject) => {
        runs.push({ key: bakeInput.key, signal, finish: () => resolve(artifactFor(bakeInput.key)) });
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  });
  return { service, runs };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("morph bake service", () => {
  test("concurrent requests for one key share one bake, and a finished key is served from cache", async () => {
    const { service, runs } = controlledService();
    const a = service.request("k", bakeLoad("k"));
    const b = service.request("k", bakeLoad("k"));
    await settle();
    expect(runs).toHaveLength(1);
    runs[0]!.finish();
    const [ha, hb] = await Promise.all([a, b]);
    expect(ha.artifact).toBe(hb.artifact);
    const hc = await service.request("k", bakeLoad("k"));
    expect(runs).toHaveLength(1);
    expect(hc.artifact).toBe(ha.artifact);
    expect(service.stats()).toMatchObject({ artifacts: 1, referenced: 1, inFlight: 0 });
  });

  test("one consumer cancelling leaves the shared bake running for the others", async () => {
    const { service, runs } = controlledService();
    const leaving = new AbortController();
    const a = service.request("k", bakeLoad("k"), { signal: leaving.signal });
    const b = service.request("k", bakeLoad("k"));
    await settle();
    leaving.abort();
    await expect(a).rejects.toBeDefined();
    expect(runs[0]!.signal.aborted).toBe(false);
    runs[0]!.finish();
    expect((await b).artifact.key).toBe("k");
  });

  test("the bake is cancelled once every consumer has gone, and a later request starts afresh", async () => {
    const { service, runs } = controlledService();
    const one = new AbortController();
    const two = new AbortController();
    const a = service.request("k", bakeLoad("k"), { signal: one.signal });
    const b = service.request("k", bakeLoad("k"), { signal: two.signal });
    await settle();
    one.abort();
    two.abort();
    await expect(a).rejects.toBeDefined();
    await expect(b).rejects.toBeDefined();
    expect(runs[0]!.signal.aborted).toBe(true);
    const c = service.request("k", bakeLoad("k"));
    await settle();
    expect(runs).toHaveLength(2);
    expect(runs[1]!.signal.aborted).toBe(false);
    runs[1]!.finish();
    expect((await c).artifact.key).toBe("k");
  });

  test("unreferenced artifacts are evicted oldest first within the bounds, with their object URLs revoked", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const events: MorphCacheEvent[] = [];
    const { service, runs } = controlledService({
      limits: { maxArtifacts: 1 },
      createObjectURL: () => {
        created.push(`blob:${created.length}`);
        return created[created.length - 1]!;
      },
      revokeObjectURL: (url) => revoked.push(url),
    });
    service.onEvent((e) => events.push(e));
    const first = service.request("a", bakeLoad("a"));
    await settle();
    runs[0]!.finish();
    const ha = await first;
    const url = ha.url("rest");
    expect(ha.url("rest")).toBe(url);
    const second = service.request("b", bakeLoad("b"));
    await settle();
    runs[1]!.finish();
    const hb = await second;
    // Still referenced, so it stays even over the bound.
    expect(service.stats().artifacts).toBe(2);
    expect(revoked).toEqual([]);
    ha.release();
    expect(service.stats().artifacts).toBe(1);
    expect(revoked).toEqual([url]);
    expect(events.filter((e) => e.type === "evict")).toEqual([{ type: "evict", key: "a", reason: "limit" }]);
    hb.release();
    expect(service.stats().artifacts).toBe(1);
  });

  test("invalidating an edited source drops its artifacts; one still shown goes when released", async () => {
    const { service, runs } = controlledService();
    const pending = service.request("k", async () => ({ kind: "bake", input: input("k"), source: "s1", uri: "file:///bunny.svg" }));
    await settle();
    runs[0]!.finish();
    const handle = await pending;
    service.invalidate((entry) => entry.uri === "file:///bunny.svg");
    expect(service.stats().artifacts).toBe(1);
    const again = service.request("k", bakeLoad("k"));
    await settle();
    expect(runs).toHaveLength(2);
    runs[1]!.finish();
    const fresh = await again;
    expect(fresh.artifact).not.toBe(handle.artifact);
    handle.release();
    fresh.release();
  });

  test("bakes beyond the concurrency bound wait their turn, and a cancelled waiter gives its turn up", async () => {
    const { service, runs } = controlledService({ limits: { maxConcurrentBakes: 2 } });
    const leaving = new AbortController();
    const requests = ["a", "b", "c", "d"].map((key) =>
      service.request(key, bakeLoad(key), key === "c" ? { signal: leaving.signal } : {}),
    );
    await settle();
    expect(runs.map((r) => r.key)).toEqual(["a", "b"]);
    leaving.abort();
    await expect(requests[2]).rejects.toBeDefined();
    runs[0]!.finish();
    await settle();
    // `c` left the queue, so `d` takes the freed turn.
    expect(runs.map((r) => r.key)).toEqual(["a", "b", "d"]);
    runs[1]!.finish();
    runs[2]!.finish();
    expect((await Promise.all([requests[0], requests[1], requests[3]])).map((h) => h!.key)).toEqual(["a", "b", "d"]);
  });

  test("a failed load rejects every waiter and caches nothing", async () => {
    const service = new MorphBakeService();
    const load = async (): Promise<MorphLoad> => {
      throw new Error("unreadable");
    };
    await expect(Promise.all([service.request("k", load), service.request("k", load)])).rejects.toThrow("unreadable");
    expect(service.stats()).toMatchObject({ artifacts: 0, inFlight: 0 });
  });

  test("variants of one artwork reuse each other's geometry", async () => {
    const writes: number[] = [];
    const service = new MorphBakeService({
      bake: (bakeInput, { signal, geometry }) => {
        let count = 0;
        const counting: MorphGeometryCache = {
          get: (key) => geometry.get(key),
          set: (key, morph) => {
            count += 1;
            geometry.set(key, morph);
          },
        };
        return bakeMorphArtifactAsync(bakeInput, { signal, geometry: counting }).finally(() => writes.push(count));
      },
    });
    const svg = portrait();
    const load = (key: string, selection: Record<string, string>) => async (): Promise<MorphLoad> => ({
      kind: "bake",
      input: { source: svg, selection, recipe: blink(), key },
      source: "bunny",
    });
    (await service.request("plain", load("plain", {}))).release();
    (await service.request("explicit", load("explicit", { eyes: "open" }))).release();
    expect(writes[0]).toBeGreaterThan(0);
    expect(writes[1]).toBe(0);
  });
});

describe("morph artifact slot", () => {
  const ref = (key: string): MorphRef => ({ morph: "blink", key, image: "bunny", selection: "{}", groups: ["eyes"] });

  test("a result for a reference the slot has moved on from is released unseen", async () => {
    const { service, runs } = controlledService();
    const host: MorphHost = { resolve: (r, o) => service.request(r.key, bakeLoad(r.key), o) };
    const states: string[] = [];
    const slot = new MorphArtifactSlot(host, (s) => states.push(`${s.state}:${s.artifact?.key ?? ""}`));
    slot.set(ref("old"));
    await settle();
    slot.set(ref("new"));
    await settle();
    // The old request was abandoned, so its bake is cancelled.
    expect(runs[0]!.signal.aborted).toBe(true);
    runs[1]!.finish();
    await settle();
    expect(slot.state).toBe("ready");
    expect(slot.artifact?.key).toBe("new");
    expect(states).toEqual(["pending:", "pending:", "ready:new"]);
    slot.dispose();
    expect(service.stats().referenced).toBe(0);
  });

  test("a failure leaves the slot failed, so the consumer keeps its static render", async () => {
    const host: MorphHost = { resolve: () => Promise.reject(new Error("no source")) };
    const slot = new MorphArtifactSlot(host);
    slot.set(ref("k"));
    await settle();
    expect(slot.state).toBe("failed");
    expect(slot.artifact).toBeUndefined();
  });
});
