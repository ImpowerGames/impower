// Ported from inkjs `src/tests/specs/ink/Tags.spec.ts`.
//
// Sparkdown supports tags — `story.globalTags`, `currentTags`,
// `TagsForContentAtPath`, and `# tag {expr}` interpolation all work
// and are validated by the choice-tag tests in `Choices.test.ts` plus
// the knot/stitch/sequence/dynamic-content tests below.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

// Sparkdown wraps each display line in `BeginTag` / `Text("<line-type>")`
// / `EndTag` line-type metadata before the body (`action` /
// `dialogue:Name` / `heading` / …). That metadata pair ends up in
// `currentTags` alongside the author-written tags. The inkjs spec
// asserts on author tags only, so we filter the line-type metadata
// out before comparing.
const LINE_TYPE_TAG =
  /^(?:action|dialogue|heading|title|transitional|write)(?::|$)/;
// Filter out line-type metadata tags and trim whitespace from each
// surviving tag. The multi-tag-on-one-line form (`# a # b`) leaves a
// trailing space on the first tag's text since the Tag rule's match
// includes the inter-tag whitespace — the trim normalizes this.
function userTagsOnly(tags: readonly string[]): string[] {
  return tags.filter((t) => !LINE_TYPE_TAG.test(t)).map((t) => t.trim());
}

describe("Tags (ported from inkjs)", () => {
  test("knot/stitch tags + globalTags + TagsForContentAtPath", () => {
    // Upstream ink fixture exercises three tag-API surfaces:
    //   - `globalTags`: tags above the first content line are returned
    //     by `story.globalTags` (file-level metadata).
    //   - `TagsForContentAtPath(path)`: static lookup of tags that
    //     appear at the top of a named container (knot or stitch),
    //     before any non-whitespace content.
    //   - `currentTags`: dynamic tags accumulated during evaluation.
    // Sparkdown rewrite uses `scene` for `=== knot` and `branch` for
    // `= stitch` (per docs/runtime/DIVERGENCES.md). The runtime API is unchanged —
    // inherited from inkjs.
    //
    // Two top-level `# tag` lines now both surface as global tags.
    // Previously only the first survived because each `# tag` line
    // was wrapped in its own InkParser-fallback chunk container, and
    // `Story.TagsAtStartOfFlowContainerWithPathString` broke its walk
    // as soon as it saw a non-control-command node (the second tag's
    // wrapping container). The walker now descends into single-Tag
    // containers at the front of the flow so subsequent tags are also
    // visible.
    const ctx = makeRuntimeStoryFromFile("tags", "knot-stitch-tags");
    expect(ctx.errorMessages).toEqual([]);

    expect(userTagsOnly(ctx.story.globalTags ?? [])).toEqual([
      "author: Joe",
      "version: 1.0",
    ]);
    expect(ctx.story.Continue()).toBe("This is the content\n");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual([
      "author: Joe",
      "version: 1.0",
    ]);

    expect(ctx.story.TagsForContentAtPath("knot")).toEqual(["knot tag"]);
    expect(ctx.story.TagsForContentAtPath("knot.stitch")).toEqual([
      "stitch tag",
    ]);

    ctx.story.ChoosePathString("knot", true, []);
    expect(ctx.story.Continue()).toBe("Knot content\n");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual(["knot tag"]);
    expect(ctx.story.Continue()).toBe("");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual([
      "end of knot tag",
    ]);
  });

  test("dynamic content in tags (`text # tag {var}{var2}.ext`)", () => {
    // Upstream ink fixture interpolates `{5+3}` and `{red|blue}`
    // inside the tag body to produce a dynamic filename
    // (`pic8red.jpg`). Sparkdown's `appendInterpolatedTagText`
    // supports `{var}` (single-identifier references) inside tag
    // bodies but not arbitrary expressions / inline alternators
    // (same constraint as the choice-tag interpolation path). We
    // rewrite using pre-computed stored values:
    //   store color = "red"
    //   store amount = 8
    //   tag # pic{amount}{color}.jpg
    // Same observable result — the tag substitutes to `pic8red.jpg`.
    const ctx = makeRuntimeStoryFromFile("tags", "dynamic-tags");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("tag\n");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual([
      "pic8red.jpg",
    ]);
  });

  test("tags in a sequence (per-arm `#tag` annotations)", () => {
    // Upstream ink fixture:
    //   -> knot -> knot ->
    //   == knot
    //   A {red #red|white #white|blue #blue|green #green} sequence.
    //   ->->
    // Sparkdown rewrite uses the inline-glued alternator
    // (`.. queue|... ..`) and each arm carries an `ArmTag`
    // annotation. The `ArmTag` grammar rule is bounded by `|` /
    // closing-`..` / `end` so it doesn't swallow the rest of the
    // alternator (the standard `Tag` rule's end-of-line termination
    // would). `lowerArmContent` in `alternatorArms.ts` emits
    // `Tag(start)` + `Text(content)` + `Tag(end)` for each `ArmTag`,
    // matching the runtime's tag-collection convention.
    const ctx = makeRuntimeStoryFromFile("tags", "tags-in-sequence");
    expect(ctx.errorMessages).toEqual([]);

    expect(ctx.story.Continue()).toBe("A red sequence.\n");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual(["red"]);

    expect(ctx.story.Continue()).toBe("A white sequence.\n");
    expect(userTagsOnly(ctx.story.currentTags ?? [])).toEqual(["white"]);
  });
});

