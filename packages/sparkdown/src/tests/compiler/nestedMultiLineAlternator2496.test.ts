import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const play = (lines: string[]) => {
  const ctx = makeRuntimeStoryFromSource([...lines, ""].join("\n"));
  return { errors: ctx.errorMessages, out: ctx.story.ContinueMaximally() };
};

describe("a multi-line alternator block inside an arm of another multi-line block", () => {
  test.each([
    [
      "a queue in the first arm of a cycle",
      ["scene start", "  Before.", "  cycle", "  | queue", "    | In A.", "    | In B.", "    end", "  | Out.", "  end", "  After.", "end"],
      "Before.\nIn A.\nAfter.\n",
    ],
    [
      "a queue in the last arm of a cycle",
      ["scene start", "  cycle", "  | Out.", "  | queue", "    | In A.", "    | In B.", "    end", "  end", "  After.", "end"],
      "Out.\nAfter.\n",
    ],
    [
      "a match(x) in an arm of a cycle",
      ["scene start", '  x = "a"', "  cycle", "  | match(x)", "    | a = In A.", "    | b = In B.", "    end", "  | Out.", "  end", "  After.", "end"],
      "In A.\nAfter.\n",
    ],
    [
      "a bare match x in an arm of a cycle",
      ["scene start", '  x = "a"', "  cycle", "  | match x", "    | a = In A.", "    | b = In B.", "    end", "  | Out.", "  end", "  After.", "end"],
      "In A.\nAfter.\n",
    ],
    [
      "a cycle in a keyed match arm",
      ["scene start", '  x = "a"', "  match x", "    | a = cycle", "      | One.", "      | Many.", "      end", "    | b = Other.", "  end", "  After.", "end"],
      "One.\nAfter.\n",
    ],
    [
      "a plural in a keyed match arm",
      ["scene start", '  x = "a"', "  match x", "    | a = plural(2)", "      | One.", "      | Many.", "      end", "    | b = Other.", "  end", "  After.", "end"],
      "Many.\nAfter.\n",
    ],
    [
      "blocks nested two deep",
      [
        "scene start",
        "  cycle",
        "  | cycle",
        "    | queue",
        "      | Deep.",
        "      | Deeper.",
        "      end",
        "    | Inner.",
        "    end",
        "  | Out.",
        "  end",
        "  After.",
        "end",
      ],
      "Deep.\nAfter.\n",
    ],
    [
      "a queue on the line below its arm's bar",
      ["scene start", "  cycle", "  |", "    queue", "    | In A.", "    | In B.", "    end", "  | Out.", "  end", "  After.", "end"],
      "In A.\nAfter.\n",
    ],
  ])("%s compiles without errors and plays", (_, lines, out) => {
    expect(play(lines)).toEqual({ errors: [], out });
  });

  test("a queue in a cycle arm inside a choice body compiles without errors and plays", () => {
    const source = [
      "scene start",
      "  choose",
      "  + [Pick]",
      "    cycle",
      "    | queue",
      "      | In A.",
      "      | In B.",
      "      end",
      "    | Out.",
      "    end",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");
    const ctx = makeRuntimeStoryFromSource(source);
    ctx.story.ContinueMaximally();
    ctx.story.ChooseChoiceIndex(0);
    expect({ errors: ctx.errorMessages, out: ctx.story.ContinueMaximally() }).toEqual({ errors: [], out: "In A.\nAfter.\n" });
  });

  test("a multi-line if in an arm stays clean", () => {
    expect(play(["scene start", "  x = 1", "  cycle", "  | if x == 1 then", "      In if.", "    end", "  | Out.", "  end", "  After.", "end"])).toEqual({
      errors: [],
      out: "In if.\nAfter.\n",
    });
  });
});
