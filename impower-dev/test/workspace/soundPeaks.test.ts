import { describe, expect, it } from "vitest";
import SoundPeaks, { peaksOf } from "../../src/modules/spark-editor/workspace/SoundPeaks";

const setup = (options?: { limit?: number; maxBytes?: number }) => {
  const reads: string[] = [];
  const peaks = new SoundPeaks(
    {
      read: async (src) => {
        reads.push(src);
        if (src.includes("broken")) {
          return new ArrayBuffer(4);
        }
        return new Float32Array([0, 0.5, -1, 0.25]).buffer;
      },
      decode: async (bytes) => {
        if (bytes.byteLength === 4) {
          throw new DOMException("bad", "EncodingError");
        }
        return { channels: [new Float32Array(bytes)], duration: 2 };
      },
    },
    { limit: options?.limit ?? 8, maxBytes: options?.maxBytes ?? 1000, count: 4 },
  );
  return { peaks, reads };
};

describe("a sound's waveform peaks", () => {
  it("takes the loudest sample of each stretch across every channel, as a percentage", () => {
    const left = new Float32Array([0.1, -0.2, 0, 0, 0.5, 0.4, 1, 0]);
    const right = new Float32Array([0, 0, -0.3, 0, 0, 0, 0, -0.9]);
    expect(peaksOf([left, right], 4)).toEqual([20, 30, 50, 100]);
    expect(peaksOf([], 4)).toEqual([]);
  });

  it("decodes a file once and serves its peaks from the cache by source and size", async () => {
    const { peaks, reads } = setup();
    const file = { src: "blob:door", size: 16 };
    const [first, second] = await Promise.all([peaks.load(file), peaks.load(file)]);
    expect(first).toEqual({ ok: true, peaks: [0, 50, 100, 25], duration: 2 });
    expect(second).toBe(first);
    expect(peaks.peek(file)).toBe(first);
    expect(await peaks.load(file)).toBe(first);
    expect(reads).toEqual(["blob:door"]);
    await peaks.load({ src: "blob:door", size: 20 });
    expect(reads).toEqual(["blob:door", "blob:door"]);
  });

  it("forgets the least recently used file past its bound", async () => {
    const { peaks, reads } = setup({ limit: 2 });
    await peaks.load({ src: "blob:a", size: 16 });
    await peaks.load({ src: "blob:b", size: 16 });
    await peaks.load({ src: "blob:a", size: 16 });
    await peaks.load({ src: "blob:c", size: 16 });
    expect(peaks.peek({ src: "blob:b", size: 16 })).toBeUndefined();
    expect(peaks.peek({ src: "blob:a", size: 16 })).toBeDefined();
    expect(reads).toEqual(["blob:a", "blob:b", "blob:c"]);
  });

  it("types a file the browser cannot decode as unreadable and a file past the size limit as too large", async () => {
    const { peaks, reads } = setup({ maxBytes: 100 });
    expect(await peaks.load({ src: "blob:broken", size: 4 })).toEqual({ ok: false, failure: "unreadable" });
    expect(await peaks.load({ src: "blob:huge", size: 101 })).toEqual({ ok: false, failure: "too_large" });
    expect(reads).toEqual(["blob:broken"]);
  });
});
