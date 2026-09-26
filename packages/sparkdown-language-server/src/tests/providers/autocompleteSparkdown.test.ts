import { describe, expect, test } from "vitest";
import { BUG } from "./autocompleteBugs";
import {
  compileProject,
  complete,
  labelsAt,
  sparkdownBug,
} from "./completionHarness";

// Completion surfaces sparkdown has and Luau does not: divert targets, scene,
// branch and label names, `define` fields and values, asset names in `[[ ]]`
// and `(( ))` commands, Sparkle `#prop` and `@event` attributes, and names
// inside a narrative line's interpolation.

const STORY = [
  "scene intro",
  "  Hello.",
  "  label start",
  "  Still here.",
  "  branch inner",
  "    label deep",
  "    Deeper.",
  "  end",
  "  -> @1",
  "end",
  "",
  "scene outro",
  "  label finale",
  "  Bye.",
  "  -> intro.@2",
  "end",
  "",
  "-> @3",
  "",
].join("\n");

describe("autocomplete · sparkdown surfaces", () => {
  describe("divert targets", () => {
    test("a divert offers the scenes, the enclosing scene's branches and labels, and the terminators", () => {
      const at = complete(STORY, { at: "1" });
      expect(at.labels).toEqual(
        expect.arrayContaining(["DONE", "END", "intro", "outro", "inner", "start"]),
      );
      expect(at.detail("intro")).toBe("scene");
      expect(at.detail("inner")).toBe("branch");
      expect(at.detail("start")).toBe("label");
      expect(at.detail("END")).toBe("terminator");
    });

    test("a divert does not offer another scene's labels", () => {
      expect(labelsAt(STORY, { at: "1" })).not.toContain("finale");
    });

    test("a divert at the top level offers the scenes and not a scene's labels", () => {
      const labels = labelsAt(STORY, { at: "3" });
      expect(labels).toEqual(expect.arrayContaining(["intro", "outro"]));
      expect(labels).not.toContain("start");
    });

    test("a divert with a typed prefix still offers the targets for the client to filter", () => {
      expect(labelsAt("scene intro\n  -> o@1\nend\n\nscene outro\n  Bye.\nend\n")).toEqual(
        expect.arrayContaining(["intro", "outro"]),
      );
    });

    test("a divert inside a choice offers the scenes", () => {
      expect(
        labelsAt("scene intro\n  choose\n  + Yes\n    -> @1\n  end\nend\n\nscene outro\n  Bye.\nend\n"),
      ).toEqual(expect.arrayContaining(["intro", "outro"]));
    });

    test("a dotted divert offers the named scene's branches and labels", () => {
      const labels = labelsAt(STORY, { at: "2" });
      expect(labels).toEqual(expect.arrayContaining(["start", "inner"]));
      expect(labels).not.toContain("finale");
    });

    test("a divert works in a script that declares a define", () => {
      const labels = labelsAt(
        "define hero with\n  strength = 1\nend\n\nscene intro\n  -> @1\nend\n",
      );
      expect(labels).toContain("intro");
    });

    sparkdownBug(BUG.labelAfterBranch, "a divert offers a label the scene declares after a branch closes", () => {
      const labels = labelsAt(
        [
          "scene A",
          "  -> @1",
          "  branch x",
          "    label inside",
          "    Inside the branch.",
          "  end",
          "  label after",
          "  After the branch.",
          "end",
          "",
        ].join("\n"),
      );
      expect(labels).toContain("after");
      expect(labels).not.toContain("inside");
    });
  });

  describe("define fields and values", () => {
    // The type slot after `as` is defineCompletions.test.ts's.
    const program = compileProject("");

    sparkdownBug(BUG.defineFields, "a define body offers its type's fields", () => {
      const labels = labelsAt("define hero as character with\n  @1\nend\n", { program });
      expect(labels).toContain("name");
    });

    sparkdownBug(BUG.defineFields, "a partly typed field name in a define body offers the matching fields", () => {
      const labels = labelsAt("define hero as character with\n  na@1\nend\n", { program });
      expect(labels).toContain("name");
    });

    sparkdownBug(BUG.defineFields, "a struct-reference field's value offers the structs of that type", () => {
      // The builtin animation's `target` defaults to `layer.self`.
      const labels = labelsAt("define fade as animation with\n  target = @1\nend\n", { program });
      expect(labels).toContain("self");
    });

    test("identifier completion works in a script that declares a define", () => {
      const source =
        'define hero as character with\n  name = "Hero"\nend\n\nstore gold = 5\nfunction main()\n  return g@1\nend\n';
      expect(labelsAt(source, { program })).toContain("gold");
    });

    test("identifier completion works in a script that declares a layout", () => {
      // A structural declaration names its struct through the same node as a
      // `define`, so a script with only a `layout` crashes the same way.
      const source =
        'layout main with\n  column:\n    text "hi"\nend\n\nstore hp = 100\nfunction main()\n  return h@1\nend\n';
      expect(labelsAt(source, { program })).toContain("hp");
    });
  });

  describe("asset commands", () => {
    const program = compileProject("", [
      { name: "hero", ext: "png", type: "image" },
      { name: "villain", ext: "png", type: "image" },
      { name: "theme", ext: "mp3", type: "audio" },
    ]);

    test("an empty image command offers the controls and the images", () => {
      const at = complete("[[@1]]", { program });
      expect(at.labels).toEqual(
        expect.arrayContaining(["show", "hide", "animate", "hero", "villain"]),
      );
      expect(at.labels).not.toContain("theme");
      expect(at.detail("show")).toBe("control");
      expect(at.detail("hero")).toBe("image");
    });

    test("an image's highlighted item resolves to its preview", async () => {
      const resolved = await complete("[[@1]]", { program }).resolve("hero");
      expect(resolved?.documentation).toBeDefined();
    });

    test("an image command after a control offers the layers", () => {
      expect(labelsAt("[[show @1]]", { program })).toEqual(
        expect.arrayContaining(["backdrop", "portrait"]),
      );
    });

    test("an image command after its image offers the clauses and more images", () => {
      const labels = labelsAt("[[show portrait hero @1]]", { program });
      expect(labels).toEqual(expect.arrayContaining(["with", "after", "over", "hero"]));
    });

    test("an empty audio command offers the controls and the audio", () => {
      const at = complete("((@1))", { program });
      expect(at.labels).toEqual(
        expect.arrayContaining(["play", "stop", "fade", "theme"]),
      );
      expect(at.labels).not.toContain("hero");
      expect(at.detail("theme")).toBe("audio");
    });

    test("an audio command after a control offers the channels", () => {
      expect(labelsAt("((play @1))", { program })).toEqual(
        expect.arrayContaining(["music", "sound"]),
      );
    });

    test("an audio command after its audio offers the clauses", () => {
      expect(labelsAt("((play music theme @1))", { program })).toEqual(
        expect.arrayContaining(["loop", "after", "to"]),
      );
    });
  });

  describe("Sparkle attributes", () => {
    const program = compileProject("");

    sparkdownBug(BUG.sparkleAttributes, "a `#` after an element offers its props", () => {
      // `child-gap` is the row prop the Sparkle control-flow guide uses.
      const labels = labelsAt("layout hud with\n  row #@1\nend\n", { program });
      expect(labels).toContain("child-gap");
    });

    sparkdownBug(BUG.sparkleAttributes, "an `@` after an element offers its events", () => {
      const labels = labelsAt('layout hud with\n  button "Go" @@1\nend\n', { program });
      expect(labels).toContain("click");
    });
  });

  describe("names in narrative", () => {
    test("an interpolation in a narrative line offers the stored names", () => {
      const at = complete("store gold = 5\nYou have {g@1} gold.\n");
      expect(at.labels).toContain("gold");
      expect(at.detail("gold")).toBe("var");
    });

    test("a line starting like a known character offers the character", () => {
      const at = complete("HERO: Hi.\nH@1");
      expect(at.labels).toContain("HERO");
      expect(at.detail("HERO")).toBe("character");
    });
  });
});
