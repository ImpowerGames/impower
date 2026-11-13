import { describe, expect, it } from "vitest";
import SoundLengths from "../../src/modules/spark-editor/workspace/SoundLengths";

const setup = (options?: { limit?: number; concurrency?: number }) => {
  const probes: string[] = [];
  const pending = new Map<string, { resolve: (seconds: number) => void; reject: (error: unknown) => void }>();
  const lengths = new SoundLengths(
    {
      probe: (src) =>
        new Promise<number>((resolve, reject) => {
          probes.push(src);
          pending.set(src, { resolve, reject });
        }),
    },
    { limit: options?.limit ?? 8, concurrency: options?.concurrency ?? 2 },
  );
  const answer = async (src: string, seconds: number | Error) => {
    const waiting = pending.get(src)!;
    pending.delete(src);
    if (seconds instanceof Error) waiting.reject(seconds);
    else waiting.resolve(seconds);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { lengths, probes, answer };
};

describe("a sound's length for its row", () => {
  it("reads a file's length once and serves it from the cache by source and size", async () => {
    const { lengths, probes, answer } = setup();
    const file = { src: "blob:door", size: 16 };
    lengths.request(file);
    lengths.request(file);
    expect(lengths.peek(file)).toBeUndefined();
    await answer("blob:door", 1.5);
    expect(lengths.peek(file)).toBe(1.5);
    expect(lengths.settled.value).toBe(1);
    lengths.request(file);
    expect(probes).toEqual(["blob:door"]);
    lengths.request({ src: "blob:door", size: 20 });
    expect(probes).toEqual(["blob:door", "blob:door"]);
  });

  it("reads no more files at once than its bound, and starts the next as one finishes", async () => {
    const { lengths, probes, answer } = setup({ concurrency: 2 });
    for (const name of ["a", "b", "c", "d"]) lengths.request({ src: `blob:${name}`, size: 1 });
    expect(probes).toEqual(["blob:a", "blob:b"]);
    await answer("blob:b", 2);
    expect(probes).toEqual(["blob:a", "blob:b", "blob:c"]);
    await answer("blob:a", 1);
    expect(probes).toEqual(["blob:a", "blob:b", "blob:c", "blob:d"]);
  });

  it("drops a waiting request whose row left the screen, and reads it when the row comes back", async () => {
    const { lengths, probes, answer } = setup({ concurrency: 1 });
    lengths.request({ src: "blob:a", size: 1 });
    const leave = lengths.request({ src: "blob:b", size: 1 });
    lengths.request({ src: "blob:c", size: 1 });
    leave();
    await answer("blob:a", 1);
    expect(probes).toEqual(["blob:a", "blob:c"]);
    lengths.request({ src: "blob:b", size: 1 });
    await answer("blob:c", 3);
    expect(probes).toEqual(["blob:a", "blob:c", "blob:b"]);
  });

  it("keeps no length for a file it cannot read or whose length is not finite, and asks again only for a new version", async () => {
    const { lengths, probes, answer } = setup();
    lengths.request({ src: "blob:bad", size: 1 });
    lengths.request({ src: "blob:stream", size: 1 });
    await answer("blob:bad", new Error("unreadable"));
    await answer("blob:stream", Number.POSITIVE_INFINITY);
    expect(lengths.peek({ src: "blob:bad", size: 1 })).toBeNull();
    expect(lengths.peek({ src: "blob:stream", size: 1 })).toBeNull();
    lengths.request({ src: "blob:bad", size: 1 });
    expect(probes).toEqual(["blob:bad", "blob:stream"]);
  });

  it("forgets the least recently read file past its bound", async () => {
    const { lengths, answer } = setup({ limit: 2, concurrency: 1 });
    for (const name of ["a", "b", "c"]) {
      lengths.request({ src: `blob:${name}`, size: 1 });
      await answer(`blob:${name}`, 1);
    }
    expect(lengths.peek({ src: "blob:a", size: 1 })).toBeUndefined();
    expect(lengths.peek({ src: "blob:c", size: 1 })).toBe(1);
  });
});
