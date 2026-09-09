import { afterEach, expect, it, vi } from "vitest";
import { buildFilteredSrc } from "../../filters/filteredSvg";

afterEach(() => vi.unstubAllGlobals());

it.each(["data-name", "serif:id"])("serves %s attribute variants through the standalone player fetch event", async (label) => {
  vi.resetModules();
  const listeners: Record<string, (event: any) => void> = {};
  const entries = new Map<string, Response>();
  let relays = 0;
  let emptyTransfer = false;
  const raw = '<svg><g id="on" LABEL="hat.on"><path/></g><g id="off" LABEL="hat.off:default"><path/></g><g id="body"/></svg>'.replaceAll('LABEL', label);
  vi.stubGlobal("caches", {open: async () => ({
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, response: Response) => {entries.set(key, response.clone());},
    keys: async () => [...entries.keys()].map(url => ({url})),
    delete: async (request: {url: string}) => entries.delete(request.url),
  })});
  vi.stubGlobal("self", {
    addEventListener: (name: string, listener: (event: any) => void) => {listeners[name] = listener;},
    clients: {get: async () => ({postMessage: (request: any) => {
      relays++;
      queueMicrotask(() => listeners["message"]!({data: {...request, result: {transfer: emptyTransfer ? [] : [new TextEncoder().encode(raw).buffer]}}}));
    }})},
  });
  await import("../../../../../sparkdown-player-app/src/workers/sw");
  const fetchVariant = async (source: string, attributes: Record<string, string>) => {
    const url = new URL(buildFilteredSrc({src: source, ext: "svg"}, attributes)!, "https://player.example").href;
    let result!: Promise<Response>;
    listeners["fetch"]!({request: new Request(url), clientId: "editor", respondWith: (response: Promise<Response>) => {result = response;}});
    return {url, response: await result};
  };
  const root = "/file:/assets/portrait.SVG?v=1";
  const selected = await fetchVariant(root, {hat: "on"});
  expect(selected.response.headers.get("content-type")).toContain("image/svg+xml");
  const text = await selected.response.text();
  expect(text).toMatch(/id=['"]on['"]/);
  expect(text).not.toMatch(/id=['"]off['"]/);
  expect(text).toMatch(/id=['"]body['"]/);
  await fetchVariant(root, {hat: "on"});
  expect(relays).toBe(1);
  const resting = await fetchVariant(root, {});
  const restingText = await resting.response.text();
  expect(restingText).toMatch(/id=['"]off['"]/);
  expect(restingText).not.toMatch(/id=['"]on['"]/);
  const updated = await fetchVariant(root.replace("v=1", "v=2"), {hat: "on"});
  await vi.waitFor(() => expect(entries.has(selected.url)).toBe(false));
  expect(entries.has(updated.url)).toBe(true);
  expect(entries.has(resting.url)).toBe(true);
  emptyTransfer = true;
  const missing = await new Promise<Response>(resolve => listeners["fetch"]!({
    request: new Request("https://player.example/file:/assets/missing.png"), clientId: "editor",
    respondWith: (response: Promise<Response>) => { void response.then(resolve); },
  }));
  expect(missing.status).toBe(404);
});
