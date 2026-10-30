// Ported from inkjs `src/tests/specs/ink/Misc.spec.ts`.
//
// Grab-bag regression coverage. The smoke-ish tests (hello world,
// end markers, basic knot flow) port cleanly. Tests that exercise
// inkjs's internal classes (`Path` construction, `CommentEliminator`,
// `StringParser`) are skipped — sparkdown's compiler/runtime have
// diverged enough at those layers that 1:1 ports have no value.
// Tests that depend on diagnostic-message strings or specific
// warning kinds are skipped because sparkdown's diagnostic surface
// is intentionally different.

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
    // `-> END` halts the story. The text before it is emitted, then
    // canContinue goes false.
    const ctx = makeRuntimeStoryFromFile("misc", "end");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hello\n");
  });

  test("whitespace across diverts", () => {
    // Two scenes (knots) chained by a divert. Whitespace at the join
    // is collapsed — no extra blank line between `Hello!` and `World.`.
    const ctx = makeRuntimeStoryFromFile("misc", "whitespace");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello!\nWorld.\n");
  });

});

describe("Misc — multi-file fixtures", () => {
  // Upstream ink's INCLUDE fixture, which spliced each included file's lines
  // in where it was included, has no port: a project's scripts are part of
  // the story with no include line, and only main's top level runs (#1387).
  // Multi-file fixtures live in `fixtures/<feature>/<name>/` with a `main.sd`
  // entry point; `makeRuntimeStoryFromDirectory` registers every `.sd` under
  // it in one in-memory project folder.
  test("cross-file var/knot references", () => {
    // Upstream ink fixture:
    //   - `nested_include.ink` includes `included_file_3.ink`
    //   - `included_file_3.ink` includes `included_file_4.ink`
    //   - `included_file_4.ink` declares `VAR t2 = 5`, prints the
    //     interpolation, and exposes `knot_in_2` (which `main` diverts
    //     to).
    //
    // A project folder makes every script under it part of the story with
    // no include line, and a script other than `main.sd` holds declarations
    // only (#1387), so the rewrite has no nested include and prints the
    // interpolation from `main`. The test covers:
    //   - Cross-file variable lookup (`t2` declared in file_4, read in
    //     `main`'s first line and in file_4's knot)
    //   - Cross-file divert (`-> knot_in_2` from main to file_4)
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
    // Upstream ink uses the inline conditional alternator with an
    // escaped `\|` inside one arm:
    //   {true:this is a '\|' character|this isn't}
    // The point: `\|` is an escape for `|` so the arm content isn't
    // split at the second pipe. Sparkdown rewrites this with the
    // single-line block-form `chain | … | … end` — same escape
    // semantics apply inside arm display text (LuauSparkdown
    // AlternatorArm includes `#Escape` in its patterns). The chain
    // type's first visit emits the first arm, which is what the
    // upstream `{true:…|…}` does for the true case.
    const ctx = makeRuntimeStoryFromFile("misc", "escape-character-in-arm");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("this is a '|' character\n");
  });

  test("alternator with TODO-like content emits no errors (rewrite of inkjs `author_warnings_inside_content_list_bug.ink`)", () => {
    // Upstream ink fixture historically tripped an over-eager
    // author-warning emission inside `{once: - a TODO: b}`. Sparkdown
    // doesn't share ink's `TODO:` author-warning mechanism (different
    // diagnostic surface), so the test's underlying property — the
    // alternator with a `TODO:` literal in an arm compiles without
    // errors — translates cleanly to the single-line block form.
    const ctx = makeRuntimeStoryFromFile("misc", "author-warnings-no-error");
    expect(ctx.errorMessages).toEqual([]);
  });
});

describe.skip("Misc — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  // `CommentEliminator` is an InkParser-only preprocessor — sparkdown's
  // textmate grammar handles comments via grammar rules, so the class
  // has no live consumer outside the soon-to-be-deleted `InkParser.ts`.
  test("comment eliminator (preprocessor)", () => {});
  test("comment eliminator with mixed newlines", () => {});

  test("end of content with/without -> END (validation disabled in sparkdown)", () => {});
  test("loose ends (validation disabled in sparkdown)", () => {});

  // Sparkdown-specific language choices.
  test("identifiers can start with numbers (Luau forbids)", () => {});
  test("quote character significance inside {...} (sparkdown semantics differ)", () => {});

  // Functions don't emit narrative — use scenes.
  test("return text warning (~ return + trailing text — functions are expression-only)", () => {});
});
