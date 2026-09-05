// #437 — a scene may take a name the builtins prelude also uses, unless that
// name is a real runtime global.
//
// An unseeded compile (this harness, and the editor's diagnostics compiler)
// declares marker globals for the builtins so references such as
// `game.loading.percent` resolve. A marker captures every `-> name` divert as
// a divert through a variable, so the marker set must hold only names the
// seeded runtime really has. The prelude's context is wider than that: it
// also lists every layout, style, and instance define under its bare name
// (`main` is a layout, a style, and a mixer; `red` a color; `title` a
// typewriter). Declaring those made `-> main` in every story that opens with
// `scene main` bind to a variable that never exists, and the story failed at
// its first step with "Tried to divert using a target from a variable that
// could not be found (main)" while the compile reported nothing.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

const storyOpeningWith = (name: string) => `-> ${name}
scene ${name}
  Hello from ${name}.
  fin

end
`;

describe("scenes named after prelude entries that are not runtime globals", () => {
  // Each name is a prelude context entry: the `main` layout, mixer, and style;
  // the `loading` layout; the `red` color; the `title` typewriter; the `text`
  // style; the `assets` config instance. None is a bare runtime global (the
  // instances live on scoped `$<type>_<name>` keys), so a scene may use it.
  test.each(["main", "loading", "red", "title", "text", "assets"])(
    "`-> %s` reaches the scene of that name",
    (name) => {
      const ctx = makeRuntimeStoryFromSource(storyOpeningWith(name));
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe(`Hello from ${name}.\n`);
    },
  );

  test("the divert is emitted as a direct path, not a variable divert", () => {
    const ctx = makeRuntimeStoryFromSource(storyOpeningWith("main"));
    const json = JSON.stringify(ctx.compiledJson);
    expect(json).toContain('{"->":"main"}');
    expect(json).not.toContain('{"->":"main","var":true}');
  });

  test("a scene may still be reached from a later divert, not only the opening one", () => {
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  First.
  -> main

end
scene main
  Second.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("First.\nSecond.\n");
  });
});

describe("scenes named after real builtin globals", () => {
  // `game`, `config`, and `mixer` are type roots: the seeded runtime holds a
  // table under each bare name, so `-> game` binds to that table in every
  // compile and can never reach a scene. The unseeded compile says so instead
  // of failing silently at runtime.
  test.each(["game", "config", "mixer"])(
    "`scene %s` is reported as colliding with a builtin global",
    (name) => {
      const { errorMessages } = collectDiagnostics(storyOpeningWith(name));
      expect(
        errorMessages.some(
          (m) =>
            m.includes(`\`${name}\` is a builtin global`) &&
            m.includes("scene or function"),
        ),
      ).toBe(true);
    },
  );

  test("a scene with an unrelated name draws no such diagnostic", () => {
    const { errorMessages } = collectDiagnostics(storyOpeningWith("start"));
    expect(errorMessages).toEqual([]);
  });
});
