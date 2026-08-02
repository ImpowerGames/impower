// #344: warming is only useful if it (a) keys on the url the renderer will
// request and (b) does not queue every asset behind every other one. The
// previous per-file warm-up fired one request per asset at project open — 261
// on the real project — so the asset the user reached first arrived no sooner
// than the last.

import { describe, expect, it } from "vitest";
import {
  ImagePreloader,
  MAX_PRELOAD_ATTEMPTS,
  type PreloadTarget,
} from "./ImagePreloader";

class FakeImage implements PreloadTarget {
  static created: FakeImage[] = [];

  onload: ((this: any, ev: any) => any) | null = null;

  onerror: ((this: any, ev: any) => any) | null = null;

  protected _src = "";

  constructor() {
    FakeImage.created.push(this);
  }

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
  }

  finishLoad() {
    this.onload?.call(this, {});
  }

  fail() {
    this.onerror?.call(this, {});
  }
}

const makePreloader = (maxConcurrent?: number) => {
  const created: FakeImage[] = [];
  const preloader = new ImagePreloader(() => {
    const img = new FakeImage();
    created.push(img);
    return img;
  }, maxConcurrent);
  return { preloader, created };
};

describe("ImagePreloader", () => {
  it("holds concurrency at the cap and drains the queue as loads finish", () => {
    const { preloader, created } = makePreloader(2);
    preloader.warmAll(["a", "b", "c", "d", "e"]);

    expect(created.map((i) => i.src)).toEqual(["a", "b"]);
    expect(preloader.inFlightCount).toBe(2);
    expect(preloader.pendingCount).toBe(3);

    created[0]!.finishLoad();
    expect(created.map((i) => i.src)).toEqual(["a", "b", "c"]);

    created[1]!.finishLoad();
    created[2]!.finishLoad();
    expect(created.map((i) => i.src)).toEqual(["a", "b", "c", "d", "e"]);
    expect(preloader.pendingCount).toBe(0);
  });

  it("preserves warm order, so the urls that matter go first", () => {
    const { preloader, created } = makePreloader(1);
    preloader.warmAll(["variant", "root"]);
    expect(created.map((i) => i.src)).toEqual(["variant"]);
    created[0]!.finishLoad();
    expect(created.map((i) => i.src)).toEqual(["variant", "root"]);
  });

  it("keys on src, so two urls of one asset are both warmed", () => {
    const { preloader, created } = makePreloader(4);
    const root = "/file:/a/bunny.svg?v=1-2";
    const variant = `${root}&filters=%7B%22i%22%3A%5B%5D%7D`;
    preloader.warmAll([variant, root]);
    expect(created.map((i) => i.src)).toEqual([variant, root]);
    expect(preloader.isWarm(variant)).toBe(true);
    expect(preloader.isWarm(root)).toBe(true);
  });

  it("never requests the same src twice", () => {
    const { preloader, created } = makePreloader(4);
    preloader.warm("a");
    preloader.warm("a");
    created[0]!.finishLoad();
    preloader.warm("a");
    expect(created).toHaveLength(1);
  });

  it("does not dedupe a queued src into oblivion", () => {
    const { preloader, created } = makePreloader(1);
    preloader.warmAll(["a", "b", "b"]);
    expect(preloader.pendingCount).toBe(1);
    created[0]!.finishLoad();
    expect(created.map((i) => i.src)).toEqual(["a", "b"]);
    expect(preloader.pendingCount).toBe(0);
  });

  it("ignores data: srcs — there is no fetch to get ahead of", () => {
    const { preloader, created } = makePreloader(4);
    preloader.warmAll(["data:image/svg+xml,<svg/>", null, undefined, ""]);
    expect(created).toHaveLength(0);
    expect(preloader.warmedCount).toBe(0);
  });

  it("does not report a failed src as warm", () => {
    const { preloader, created } = makePreloader(4);
    preloader.warm("a");
    created[0]!.fail();
    expect(preloader.isWarm("a")).toBe(false);
    expect(preloader.warmedCount).toBe(0);
  });

  it("evicts every url of an asset when its bytes change", () => {
    const { preloader } = makePreloader(8);
    const root = "/file:/a/bunny.svg?v=1-2";
    const variant = `${root}&filters=x`;
    const other = "/file:/a/room.png?v=1-2";
    preloader.warmAll([variant, root, other]);

    preloader.evict("/file:/a/bunny.svg?v=9-9");

    expect(preloader.isWarm(variant)).toBe(false);
    expect(preloader.isWarm(root)).toBe(false);
    expect(preloader.isWarm(other)).toBe(true);
  });

  it("evicts urls still waiting in the queue", () => {
    const { preloader, created } = makePreloader(1);
    preloader.warmAll(["/file:/a/x.png?v=1", "/file:/a/y.png?v=1"]);
    expect(preloader.pendingCount).toBe(1);

    preloader.evict("/file:/a/y.png?v=1");
    expect(preloader.pendingCount).toBe(0);

    created[0]!.finishLoad();
    expect(created.map((i) => i.src)).toEqual(["/file:/a/x.png?v=1"]);
  });

  it("does not let a stale failure un-warm a url that is genuinely resident", () => {
    // evict() drops the map entry but cannot cancel the request already in
    // flight, so an edited asset can have an old, doomed target running
    // alongside a new, good one. The old one's onerror must not delete the new
    // one's entry — that map is the only thing keeping the image resident, so
    // dropping it makes the next display pop in cold all over again.
    const { preloader, created } = makePreloader(4);
    const src = "/file:/a/bunny.svg?v=1-2";
    preloader.warm(src);
    preloader.evict(src);
    preloader.warm(src);
    expect(created).toHaveLength(2);

    created[1]!.finishLoad();
    created[0]!.fail();

    expect(preloader.isWarm(src)).toBe(true);
    expect(preloader.warmedCount).toBe(1);
  });

  it("releases the slot when creating a target throws", () => {
    let fail = true;
    const created: FakeImage[] = [];
    const preloader = new ImagePreloader(() => {
      if (fail) {
        throw new Error("no Image in this realm");
      }
      const img = new FakeImage();
      created.push(img);
      return img;
    }, 2);

    preloader.warmAll(["a", "b", "c"]);
    // Incrementing _inFlight before the create and never releasing it would
    // pin the pump at its cap and nothing would ever warm again.
    expect(preloader.inFlightCount).toBe(0);

    fail = false;
    preloader.warmAll(["d", "e"]);
    expect(created.map((i) => i.src)).toEqual(["d", "e"]);
  });

  it("clamps a nonsense concurrency cap instead of stalling forever", () => {
    for (const cap of [0, -3, Number.NaN]) {
      const created: FakeImage[] = [];
      const preloader = new ImagePreloader(() => {
        const img = new FakeImage();
        created.push(img);
        return img;
      }, cap);
      preloader.warm("a");
      expect(created.map((i) => i.src)).toEqual(["a"]);
      expect(preloader.pendingCount).toBe(0);
    }
  });

  it("gives up on a src after a bounded number of failures", () => {
    // Warming re-runs whenever the program changes. A src that cannot be
    // served (missing file, offline remote) would otherwise be re-issued
    // forever AND, being re-queued ahead of anything new, would permanently
    // occupy the concurrency window. But giving up on the FIRST failure is
    // just as wrong: on a first visit the service worker may not control the
    // page yet, so an early sweep can 404 across the board.
    const { preloader, created } = makePreloader(4);
    const src = "/file:/a/gone.png?v=1";
    for (let i = 0; i < MAX_PRELOAD_ATTEMPTS + 4; i += 1) {
      preloader.warm(src);
      created[created.length - 1]?.fail();
    }
    expect(created).toHaveLength(MAX_PRELOAD_ATTEMPTS);
    expect(preloader.failedCount).toBe(1);
  });

  it("retries a failed src once the file behind it changes", () => {
    const { preloader, created } = makePreloader(4);
    preloader.warm("/file:/a/gone.png?v=1");
    created[0]!.fail();
    preloader.evict("/file:/a/gone.png?v=2");
    preloader.warm("/file:/a/gone.png?v=2");
    expect(created.map((i) => i.src)).toEqual([
      "/file:/a/gone.png?v=1",
      "/file:/a/gone.png?v=2",
    ]);
  });

  it("warmOnly forgets urls the current program no longer renders", () => {
    // Every authored filter combination mints a new variant url. Without this,
    // a session spent trying `~happy`, `~sad`, `~angry` keeps all of them
    // decoded and resident forever, and so does switching projects.
    const { preloader, created } = makePreloader(8);
    preloader.warmOnly(["a", "b"]);
    created.forEach((i) => i.finishLoad());
    expect(preloader.warmedCount).toBe(2);

    preloader.warmOnly(["b", "c"]);
    expect(preloader.isWarm("a")).toBe(false);
    expect(preloader.isWarm("b")).toBe(true);
    expect(preloader.isWarm("c")).toBe(true);
    // `b` was already resident and must NOT have been re-requested.
    expect(created.map((i) => i.src)).toEqual(["a", "b", "c"]);
  });

  it("survives a target that loads synchronously", () => {
    const created: FakeImage[] = [];
    const preloader = new ImagePreloader(() => {
      const img = new FakeImage();
      created.push(img);
      // Assigning src fires onload in the same tick — a cache hit's worst case.
      Object.defineProperty(img, "src", {
        get() {
          return (this as any)._src;
        },
        set(value: string) {
          (this as any)._src = value;
          this.onload?.call(this, {});
        },
      });
      return img;
    }, 2);
    preloader.warmAll(["a", "b", "c", "d"]);
    expect(created.map((i) => i.src)).toEqual(["a", "b", "c", "d"]);
    expect(preloader.inFlightCount).toBe(0);
    expect(preloader.pendingCount).toBe(0);
  });
});
