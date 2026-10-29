import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { errorsOf, programCompiler } from "../program/programHarness";

const MAIN = "inmemory:///main.sd";

function compileWith(text: string, seedBuiltinsIntoStory: boolean): SparkProgram {
  return programCompiler({ [MAIN]: text }, { seedBuiltinsIntoStory }).compile()
    .program;
}

function play(program: SparkProgram): { output: string; errors: string[] } {
  expect(program.chunks, JSON.stringify(errorsOf(program))).toBeDefined();
  const story = new ProgramStory(program.chunks!);
  const errors: string[] = [];
  story.onError = (message: string) => errors.push(message);
  return { output: story.ContinueMaximally(), errors };
}

describe("a typed define overriding a builtin instance", () => {
  test.each([true, false])(
    "an authored computed key wins over the builtin's value (seeded: %s)",
    (seeded) => {
      const program = compileWith(
        `store k = "layouts_element_name"

define ui as config with
  [k] = "mine"
end

-> start
scene start
  {config.ui.layouts_element_name}
  fin

end
`,
        seeded,
      );
      expect(errorsOf(program)).toEqual([]);
      expect(play(program)).toEqual({ output: "mine\n", errors: [] });
    },
  );

  test.each([true, false])(
    "a computed key reaches the runtime table of a define no builtin names (seeded: %s)",
    (seeded) => {
      const program = compileWith(
        `store k = "z"

define foo as thing with
  [k .. "1"] = "mine"
end

-> start
scene start
  {thing.foo.z1}
  fin

end
`,
        seeded,
      );
      expect(errorsOf(program)).toEqual([]);
      expect(play(program)).toEqual({ output: "mine\n", errors: [] });
    },
  );

  test("a restated nested table keeps the builtin's other nested keys, as the context does", () => {
    const program = compileWith(
      `define ui as config with
  breakpoints = { xs = 1 }
end

-> start
scene start
  [{config.ui.breakpoints.xs}] [{config.ui.breakpoints.sm}]
  fin

end
`,
      true,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(program.context?.["config"]?.["ui"]?.["breakpoints"]?.["sm"]).toBe(
      640,
    );
    expect(play(program)).toEqual({ output: "[1] [640]\n", errors: [] });
  });

  test("the unseeded compile of a restated nested table plays the authored key", () => {
    const program = compileWith(
      `define ui as config with
  breakpoints = { xs = 1 }
end

-> start
scene start
  [{config.ui.breakpoints.xs}]
  fin

end
`,
      false,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({ output: "[1]\n", errors: [] });
  });
});
