import { describe, expect, test } from "vitest";
import { preludeContext } from "../harness/compilePrelude";

const mixerName = (mixer: unknown) =>
  typeof mixer === "string" ? mixer : (mixer as any)?.$name;

describe("the builtin movie mixer", () => {
  test("movie sound has its own mixer, which the `movie` channel plays through", () => {
    const prelude = preludeContext();
    expect(prelude["mixer"]?.["movie"]).toMatchObject({ gain: 1 });
    expect(mixerName((prelude["channel"]?.["movie"] as any)?.mixer)).toBe(
      "movie",
    );
  });
});
