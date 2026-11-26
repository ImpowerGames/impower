import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromDirectory,
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Misc (ported from inkjs)", () => {
  test("hello world", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "hello-world");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello world\n");
  });

  test("end (-> END terminator)", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "end");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hello\n");
  });

  test("whitespace across diverts", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "whitespace");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello!\nWorld.\n");
  });

});

describe("Misc — multi-file fixtures", () => {
  test("cross-file var/knot references", () => {
    const ctx = makeRuntimeStoryFromDirectory("misc", "nested-include");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "The value of a variable in test file 2 is 5.\nThis is the main file\nThe value when accessed from knot_in_2 is 5.\n",
    );
  });
});

describe("Misc — ported from ink fixture rewrites", () => {
  test("an empty scene start compiles and produces empty output", () => {
    const ctx = makeRuntimeStoryFromSource("scene start\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("");
  });

  test("empty source reports the missing scene start", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "empty");
    expect(ctx.errorMessages).toEqual([
      "no scene named start; the story starts in a scene named start",
    ]);
  });

  test("escape characters inside alternator arms (rewrite of inkjs `escape_character.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "escape-character-in-arm");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("this is a '|' character\n");
  });

  test("alternator with TODO-like content emits no errors (rewrite of inkjs `author_warnings_inside_content_list_bug.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("misc", "author-warnings-no-error");
    expect(ctx.errorMessages).toEqual([]);
  });
});

describe.skip("Misc — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("comment eliminator (preprocessor)", () => {});
  test("comment eliminator with mixed newlines", () => {});

  test("end of content with/without -> END (validation disabled in sparkdown)", () => {});
  test("loose ends (validation disabled in sparkdown)", () => {});

  test("identifiers can start with numbers (Luau forbids)", () => {});
  test("quote character significance inside {...} (sparkdown semantics differ)", () => {});

  test("return text warning (~ return + trailing text — functions are expression-only)", () => {});
});
