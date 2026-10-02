// Sparkdown-specific: the rules about conditions and loop ranges
// (DuplicateCondition, ForRange) read the Luau a script holds outside the
// units the type checker reads, in Sparkdown's own text and constructs: an
// interpolation in a line, a choice or a line inside a narrative `if`, and a
// property's value in a `define`. They also read the condition of a
// narrative `if` block and the Luau inside it, without comparing its arms'
// conditions (`LintDuplicateCondition.test.ts`). The rules are implemented
// in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";

const CONDITION_RULES = new Set(["DuplicateCondition", "ForRange"]);

/** The condition and range rules' warnings for a document, as `line:character code`. */
function conditionLints(source: string): string[] {
  return diagnoseDetailed(source)
    .filter((d) => CONDITION_RULES.has(String(d.code)))
    .map((d) => `${d.range!.start.line}:${d.range!.start.character} ${String(d.code)}`);
}

describe("Luau in Sparkdown's text", () => {
  test.each([
    ["an interpolation in a line", "store a = true\nHi {a and a}.\n", ["1:10 DuplicateCondition"]],
    ["an if expression in an interpolation", "store a = true\nHi {if a then 1 elseif a then 2 else 3}.\n", ["1:23 DuplicateCondition"]],
    ["an interpolation in a scene's line", "store a = true\nscene s\n  Hi {a and a}.\nend\n", ["2:12 DuplicateCondition"]],
    ["an interpolation in a line of dialogue", "store a = true\nHERO\nI see {a or a}.\n", ["2:12 DuplicateCondition"]],
    [
      "an interpolation in a choice",
      "store a = true\nscene s\n  choose\n    + [Go {a or a}] -> next\n  end\nend\nscene next\n  fin\nend\n",
      ["3:16 DuplicateCondition"],
    ],
    ["an interpolation in a line inside a narrative if", "store a = true\nif a then\n  Hi {a and a}.\nend\n", ["2:12 DuplicateCondition"]],
  ])("%s", (_name, source, expected) => {
    expect(conditionLints(source)).toEqual(expected);
  });
});

describe("Luau in a define", () => {
  test.each([
    ["an and chain", "store a = true\ndefine hero as character with\n  v = a and a\nend\nHi.\n", ["2:12 DuplicateCondition"]],
    ["an if expression", "store a = true\ndefine hero as character with\n  v = if a then 1 elseif a then 2 else 3\nend\nHi.\n", ["2:25 DuplicateCondition"]],
    ["a chain in a table", "store a = true\ndefine hero as character with\n  v = { x = a and a }\nend\nHi.\n", ["2:18 DuplicateCondition"]],
    [
      "a function value",
      "define hero as character with\n  cb = function()\n    for i = 10, 1 do print(i) end\n    if x then elseif x then end\n  end\nend\nHi.\n",
      ["2:12 ForRange", "3:21 DuplicateCondition"],
    ],
  ])("%s", (_name, source, expected) => {
    expect(conditionLints(source)).toEqual(expected);
  });
});

describe("a narrative if block", () => {
  test.each([
    ["its condition", "store a = true\nif a and a then\n  Hi.\nend\n", ["1:9 DuplicateCondition"]],
    ["its condition in a scene, its arms not compared", "store a = true\nscene s\n  if a or a then\n    Hi.\n  elseif a then\n    Ho.\n  elseif a then\n    Hu.\n  end\nend\n", ["2:10 DuplicateCondition"]],
    ["a chain in a Luau statement inside it", "store a = true\nstore x = 1\nif a then\n  Hi.\n  & x = a and a\nend\n", ["4:14 DuplicateCondition"]],
    ["a Luau if chain inside it", "store a = true\nif a then\n  Hi.\n  & if a then print(1) elseif a then print(2) end\nend\n", ["3:30 DuplicateCondition"]],
    ["a numeric for inside it", "store a = true\nif a then\n  Hi.\n  & for i = 10, 1 do print(i) end\nend\n", ["3:12 ForRange"]],
  ])("%s", (_name, source, expected) => {
    expect(conditionLints(source)).toEqual(expected);
  });
});
