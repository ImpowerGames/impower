import { describe, expect, it } from "vitest";
import {
  HOP_BY_HOP_HEADERS,
  shouldProxyToPlayer,
  stripHopByHopHeaders,
} from "../../src/build/devPreviewProxy";

const BASE = "/__player";

describe("shouldProxyToPlayer (boundary match)", () => {
  it("matches the exact base (the iframe's bare request)", () => {
    expect(shouldProxyToPlayer("/__player", BASE)).toBe(true);
  });

  it("matches the base with a trailing slash (the iframe src)", () => {
    expect(shouldProxyToPlayer("/__player/", BASE)).toBe(true);
  });

  it("matches nested player assets", () => {
    expect(shouldProxyToPlayer("/__player/@vite/client", BASE)).toBe(true);
    expect(shouldProxyToPlayer("/__player/src/main.ts", BASE)).toBe(true);
  });

  it("does NOT hijack sibling paths sharing the prefix", () => {
    expect(shouldProxyToPlayer("/__playerfoo", BASE)).toBe(false);
    expect(shouldProxyToPlayer("/__player2/x", BASE)).toBe(false);
    expect(shouldProxyToPlayer("/__player-stuff", BASE)).toBe(false);
  });

  it("does NOT match unrelated editor routes", () => {
    expect(shouldProxyToPlayer("/", BASE)).toBe(false);
    expect(shouldProxyToPlayer("/sw.js", BASE)).toBe(false);
    expect(shouldProxyToPlayer("/@vite/client", BASE)).toBe(false);
  });

  it("handles a missing/empty url", () => {
    expect(shouldProxyToPlayer(undefined, BASE)).toBe(false);
    expect(shouldProxyToPlayer("", BASE)).toBe(false);
  });
});

describe("stripHopByHopHeaders", () => {
  it("removes hop-by-hop headers that break HTTP/2 re-emit", () => {
    const out = stripHopByHopHeaders({
      "content-type": "text/html",
      "content-length": "420",
      connection: "keep-alive",
      "keep-alive": "timeout=5",
      "transfer-encoding": "chunked",
      etag: 'W/"abc"',
    });
    expect(out).toEqual({
      "content-type": "text/html",
      "content-length": "420",
      etag: 'W/"abc"',
    });
    expect(out).not.toHaveProperty("connection");
    expect(out).not.toHaveProperty("transfer-encoding");
  });

  it("is case-insensitive on header names", () => {
    const out = stripHopByHopHeaders({
      "Content-Type": "text/javascript",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
      Upgrade: "h2c",
    });
    expect(out).toEqual({ "Content-Type": "text/javascript" });
  });

  it("strips every documented hop-by-hop header", () => {
    const headers = Object.fromEntries(
      [...HOP_BY_HOP_HEADERS].map((h) => [h, "x"]),
    );
    expect(stripHopByHopHeaders(headers)).toEqual({});
  });

  it("returns a copy and does not mutate the input", () => {
    const input = { "content-type": "text/css", connection: "close" };
    const out = stripHopByHopHeaders(input);
    expect(out).not.toBe(input);
    expect(input).toHaveProperty("connection", "close");
  });

  it("preserves array-valued headers (e.g. set-cookie)", () => {
    const out = stripHopByHopHeaders({
      "set-cookie": ["a=1", "b=2"],
      connection: "keep-alive",
    });
    expect(out).toEqual({ "set-cookie": ["a=1", "b=2"] });
  });
});
