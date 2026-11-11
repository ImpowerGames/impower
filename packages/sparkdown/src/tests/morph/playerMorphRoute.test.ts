import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { MorphArtifact } from "../../morph/types";
import { blinkScript, portrait } from "./fixtures";

const listeners: Record<string, (event: any) => void> = {};
const stores = new Map<string, Map<string, Response>>();
let relays = 0;
let source = portrait();

const compileRef = (svg: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    stripImageData: true,
    files: [
      { uri: "file:///main.sd", type: "script", name: "main", ext: "sd", text: `${blinkScript()}\n[[bunny]]\n`, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", src: "/file:/local/bunny.svg?v=1-1", text: svg },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: "file:///main.sd" } }).program;
  return program.morphs!.variants["bunny"]![0]!;
};

const fetchThroughPlayer = async (src: string) => {
  let result!: Promise<Response>;
  listeners["fetch"]!({
    request: new Request(new URL(src, "https://player.example").href),
    clientId: "editor",
    respondWith: (response: Promise<Response>) => {
      result = response;
    },
  });
  return result;
};

beforeEach(async () => {
  vi.resetModules();
  stores.clear();
  relays = 0;
  source = portrait();
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      const entries = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, entries);
      return {
        match: async (key: string) => entries.get(new URL(key, "https://player.example").href)?.clone(),
        put: async (key: string, response: Response) => {
          entries.set(new URL(key, "https://player.example").href, response.clone());
        },
        keys: async () => [...entries.keys()].map((url) => ({ url })),
        delete: async (key: string | { url: string }) => entries.delete(new URL(typeof key === "string" ? key : key.url, "https://player.example").href),
      };
    },
  });
  vi.stubGlobal("self", {
    addEventListener: (name: string, listener: (event: any) => void) => {
      listeners[name] = listener;
    },
    clients: {
      get: async () => ({
        postMessage: (request: any) => {
          relays++;
          queueMicrotask(() => listeners["message"]!({ data: { ...request, result: { transfer: source ? [new TextEncoder().encode(source).buffer] : [] } } }));
        },
      }),
    },
  });
  await import("../../../../../sparkdown-player-app/src/workers/sw");
});

afterEach(() => vi.unstubAllGlobals());

describe("morph asset requests through the standalone player's service worker", () => {
  it("answers a compiled morph reference with its artifact, not the filtered SVG", async () => {
    const ref = compileRef(portrait());
    expect(ref.src).toContain("&morph=");
    const response = await fetchThroughPlayer(ref.src!);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const artifact = (await response.json()) as MorphArtifact;
    expect(artifact.key).toBe(ref.key);
    expect(artifact.morphs).toEqual(["blink"]);
    expect(artifact.status).toBe("live");
  });

  it("answers with the artifact even when a filtered SVG was cached under the morph URL", async () => {
    const ref = compileRef(portrait());
    const href = new URL(ref.src!, "https://player.example").href;
    const filtered = new Map<string, Response>([[href, new Response(portrait(), { headers: { "Content-Type": "image/svg+xml" } })]]);
    stores.set("filtered-svgs-attributes-v3", filtered);
    const response = await fetchThroughPlayer(ref.src!);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(((await response.json()) as MorphArtifact).key).toBe(ref.key);
  });

  it("a restarted worker serves a repeated morph request from Cache Storage instead of baking again", async () => {
    const ref = compileRef(portrait());
    const first = (await (await fetchThroughPlayer(ref.src!)).json()) as MorphArtifact;
    const store = stores.get("morph-artifacts")!;
    await vi.waitFor(() => expect([...store.keys()]).toHaveLength(1));
    const [cachedKey] = [...store.keys()];
    const stored = (await store.get(cachedKey!)!.clone().json()) as MorphArtifact;
    expect(stored.rest).toBe(first.rest);
    const sentinel = "<svg id='served-from-cache'/>";
    store.set(cachedKey!, new Response(JSON.stringify({ ...stored, rest: sentinel }), { headers: { "Content-Type": "application/json" } }));
    const relaysAfterBake = relays;
    vi.resetModules();
    await import("../../../../../sparkdown-player-app/src/workers/sw");
    const again = (await (await fetchThroughPlayer(ref.src!)).json()) as MorphArtifact;
    expect(again.rest).toBe(sentinel);
    expect(again.key).toBe(ref.key);
    expect(relays).toBe(relaysAfterBake + 1);
  });

  it("bakes the edited artwork rather than a stale artifact after the source changes", async () => {
    const ref = compileRef(portrait());
    const before = (await (await fetchThroughPlayer(ref.src!)).json()) as MorphArtifact;
    source = portrait({ dx: 22 });
    const edited = compileRef(source);
    const after = (await (await fetchThroughPlayer(edited.src!)).json()) as MorphArtifact;
    expect(after.key).toBe(edited.key);
    expect(after.rest).not.toBe(before.rest);
  });

  it("serves the rest render as an SVG image when asked for it", async () => {
    const ref = compileRef(portrait());
    const response = await fetchThroughPlayer(`${ref.src!}&morph_output=rest`);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect((await response.text()).startsWith("<svg")).toBe(true);
  });

  it("refuses an unreadable morph request instead of answering with the filtered SVG", async () => {
    const response = await fetchThroughPlayer("/file:/local/bunny.svg?v=1-1&attributes=%7B%7D&morph=%7Bnot%20json&key=k");
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).not.toContain("image/svg+xml");
  });

  it("answers a morph request whose source cannot be relayed with an error, not the filtered SVG", async () => {
    const ref = compileRef(portrait());
    source = "";
    const response = await fetchThroughPlayer(ref.src!);
    expect(response.ok).toBe(false);
    expect(response.headers.get("Content-Type")).not.toContain("image/svg+xml");
  });
});
