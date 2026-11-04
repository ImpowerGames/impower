import { describe, expect, test } from "vitest";
import { audioBuiltinDefinitions } from "../../game/modules/audio/audioBuiltinDefinitions";
import { preludeContext } from "../harness/compilePrelude";

const mixerName = (mixer: unknown) =>
  typeof mixer === "string" ? mixer : (mixer as any)?.$name;

describe("the builtin mixers and channels", () => {
  const prelude = preludeContext();
  const mirror = audioBuiltinDefinitions();
  const named = (record: Record<string, unknown> | undefined) =>
    Object.keys(record ?? {})
      .filter((k) => k !== "$default")
      .sort();

  test("the prelude and the mirror name the same mixers, at the same gain", () => {
    expect(named(prelude["mixer"])).toEqual(named(mirror.mixer));
    for (const name of named(mirror.mixer)) {
      const sd = prelude["mixer"]?.[name] as any;
      expect(sd.$name, name).toBe(name);
      expect(mirror.mixer[name]!.$name, name).toBe(name);
      expect(sd.gain, name).toBe(mirror.mixer[name]!.gain);
    }
  });

  test("the prelude and the mirror name the same channels, with the same mixer, loop and play behavior", () => {
    expect(named(prelude["channel"])).toEqual(named(mirror.channel));
    for (const name of named(mirror.channel)) {
      const sd = prelude["channel"]?.[name] as any;
      const ts = mirror.channel[name]!;
      expect(sd.$name, name).toBe(name);
      expect(ts.$name, name).toBe(name);
      expect(mixerName(sd.mixer), name).toBe(mixerName(ts.mixer));
      expect(sd.loop, name).toBe(ts.loop);
      expect(sd.play_behavior, name).toBe(ts.play_behavior);
    }
  });

  test("movie sound has its own mixer, which the `movie` channel plays through", () => {
    expect(prelude["mixer"]?.["movie"]).toMatchObject({ gain: 1 });
    expect(mixerName((prelude["channel"]?.["movie"] as any)?.mixer)).toBe(
      "movie",
    );
  });
});
