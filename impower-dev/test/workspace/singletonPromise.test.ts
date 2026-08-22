import { describe, expect, it, vi } from "vitest";
import SingletonPromise from "../../src/modules/spark-editor/workspace/SingletonPromise";

/** A deferred whose settlement we drive by hand, so races are deterministic. */
const deferred = <V>() => {
  let resolve!: (v: V) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<V>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("SingletonPromise", () => {
  describe("memoization", () => {
    it("invokes the function only once across many gets", async () => {
      const func = vi.fn(async () => "value");
      const ref = new SingletonPromise(func);

      expect(await ref.get()).toBe("value");
      expect(await ref.get()).toBe("value");
      expect(await ref.get()).toBe("value");

      expect(func).toHaveBeenCalledTimes(1);
    });

    it("shares a single in-flight attempt between concurrent callers", async () => {
      const d = deferred<string>();
      const func = vi.fn(() => d.promise);
      const ref = new SingletonPromise(func);

      const all = Promise.all([ref.get(), ref.get(), ref.get()]);
      d.resolve("value");

      expect(await all).toEqual(["value", "value", "value"]);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("passes through the arguments of the first caller", async () => {
      const func = vi.fn(async (a: string, b: number) => `${a}:${b}`);
      const ref = new SingletonPromise(func);

      expect(await ref.get("x", 1)).toBe("x:1");
      // Later args are ignored — that is the point of memoizing.
      expect(await ref.get("y", 2)).toBe("x:1");
      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith("x", 1);
    });

    it("exposes the resolved value synchronously via `value`", async () => {
      const ref = new SingletonPromise(async () => "value");

      expect(ref.value).toBeUndefined();
      await ref.get();
      expect(ref.value).toBe("value");
    });
  });

  describe("rejection recovery (#224)", () => {
    it("retries after a failure instead of caching the rejection forever", async () => {
      // The bug: `_promise` stayed pointed at the rejected promise, so every
      // later `get()` re-awaited the same rejection and the memoized thing was
      // permanently dead for the session.
      const func = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce("recovered");
      const ref = new SingletonPromise(func);

      await expect(ref.get()).rejects.toThrow("transient");
      expect(await ref.get()).toBe("recovered");
      expect(func).toHaveBeenCalledTimes(2);
    });

    it("keeps retrying across repeated failures", async () => {
      const func = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("first"))
        .mockRejectedValueOnce(new Error("second"))
        .mockResolvedValueOnce("third time lucky");
      const ref = new SingletonPromise(func);

      await expect(ref.get()).rejects.toThrow("first");
      await expect(ref.get()).rejects.toThrow("second");
      expect(await ref.get()).toBe("third time lucky");
      expect(func).toHaveBeenCalledTimes(3);
    });

    it("rejects every concurrent caller of a failing attempt, but only runs it once", async () => {
      const d = deferred<string>();
      const func = vi.fn(() => d.promise);
      const ref = new SingletonPromise(func);

      const results = Promise.allSettled([ref.get(), ref.get(), ref.get()]);
      d.reject(new Error("boom"));

      const settled = await results;
      expect(settled.map((r) => r.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("leaves `value` unset after a failure", async () => {
      const ref = new SingletonPromise(async () => {
        throw new Error("nope");
      });

      await expect(ref.get()).rejects.toThrow("nope");
      expect(ref.value).toBeUndefined();
    });

    it("lets later callers join the retry rather than starting more attempts", async () => {
      const first = deferred<string>();
      const second = deferred<string>();
      const func = vi
        .fn<() => Promise<string>>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      const ref = new SingletonPromise(func);

      const firstGet = ref.get();
      first.reject(new Error("first"));
      await expect(firstGet).rejects.toThrow("first");

      // Second attempt starts and is still pending.
      const secondGet = ref.get();
      expect(func).toHaveBeenCalledTimes(2);

      // A third caller must join the pending second attempt, not start a third.
      const thirdGet = ref.get();
      expect(func).toHaveBeenCalledTimes(2);

      second.resolve("value");
      expect(await secondGet).toBe("value");
      expect(await thirdGet).toBe("value");
    });

    it("a stale rejection does not evict the attempt that replaced it", async () => {
      // Covers the `this._promise === attempt` identity check. `reset()` is
      // the one way an attempt can be replaced while it is still in flight;
      // when that abandoned attempt later fails, it must not clear the
      // *current* one, or the retry already running gets orphaned and a
      // redundant duplicate is fired off behind it.
      const first = deferred<string>();
      const second = deferred<string>();
      const func = vi
        .fn<() => Promise<string>>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      const ref = new SingletonPromise(func);

      const firstGet = ref.get();
      ref.reset(); // abandon the in-flight attempt
      const secondGet = ref.get();
      expect(func).toHaveBeenCalledTimes(2);

      // The abandoned attempt fails, late — after its replacement is cached.
      first.reject(new Error("stale"));
      await expect(firstGet).rejects.toThrow("stale");

      // The second attempt must still be cached, so a new caller joins it.
      const thirdGet = ref.get();
      expect(func).toHaveBeenCalledTimes(2);

      second.resolve("value");
      expect(await secondGet).toBe("value");
      expect(await thirdGet).toBe("value");
    });
  });

  describe("reset", () => {
    it("forces the function to run again", async () => {
      let n = 0;
      const func = vi.fn(async () => `run ${++n}`);
      const ref = new SingletonPromise(func);

      expect(await ref.get()).toBe("run 1");
      ref.reset();
      expect(await ref.get()).toBe("run 2");
      expect(func).toHaveBeenCalledTimes(2);
    });

    it("clears the cached value", async () => {
      const ref = new SingletonPromise(async () => "value");

      await ref.get();
      expect(ref.value).toBe("value");
      ref.reset();
      expect(ref.value).toBeUndefined();
    });
  });
});
