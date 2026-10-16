// #454 — a root define named after a builtin type root (`define game with
// ... end`) overrides the prelude's table in a seeded compile, the player's
// mode, as it already compiles in the unseeded editor compile.
//
// The builtins prelude declares every type root with its own root define, and
// a seeded compile parses that prelude ahead of the project. The prelude's
// root defines were never marked as prelude declarations, so the authored
// root define reached `FlowBase.AddNewVariableDeclaration` as a plain
// collision: the compile failed with "Duplicate identifier `game`. A var
// named `game` already exists on null" and made no program. An override takes
// the slot, keeps the prelude's values for the keys it does not restate, and
// keeps every builtin instance registered in the type's table.

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  errorsOf,
  programCompiler,
  programSession,
} from "../program/programHarness";

const MAIN = "inmemory:///main.sd";

const scriptOverriding = (root: string) => `define ${root} with
  probe_field = 1
end

-> start
scene start
  choose
    * A
      -> a
  end
end

scene a
  Chose A.
  fin

end
`;

function compileWith(
  texts: Record<string, string>,
  seedBuiltinsIntoStory: boolean,
): SparkProgram {
  return programCompiler(texts, { seedBuiltinsIntoStory }).compile().program;
}

/** What a compiled story shows when the reader picks its first choice. */
function playFirstChoice(program: SparkProgram): string {
  const story = new ProgramStory(program.chunks!);
  const runtimeErrors: string[] = [];
  story.onError = (message: string) => runtimeErrors.push(message);
  story.ContinueMaximally();
  expect(story.currentChoices.map((c) => c.text)).toEqual(["A"]);
  story.ChooseChoiceIndex(0);
  const output = story.ContinueMaximally();
  expect(runtimeErrors).toEqual([]);
  return output;
}

/** What a compiled story shows from its start, and the errors it reports. */
function play(program: SparkProgram): { output: string; errors: string[] } {
  expect(program.chunks, JSON.stringify(errorsOf(program))).toBeDefined();
  const story = new ProgramStory(program.chunks!);
  const errors: string[] = [];
  story.onError = (message: string) => errors.push(message);
  return { output: story.ContinueMaximally(), errors };
}

describe("a root define named after a builtin type root", () => {
  test.each(["game", "config", "color", "world", "image", "mixer", "character"])(
    "`define %s with ... end` compiles and plays in a seeded compile",
    (root) => {
      const program = compileWith({ [MAIN]: scriptOverriding(root) }, true);
      expect(errorsOf(program)).toEqual([]);
      expect(program.chunks).toBeDefined();
      expect(playFirstChoice(program)).toBe("A\nChose A.\n");
    },
  );

  test.each(["game", "config", "color", "world"])(
    "the unseeded compile of `define %s with ... end` agrees",
    (root) => {
      const texts = { [MAIN]: scriptOverriding(root) };
      const seeded = compileWith(texts, true);
      const unseeded = compileWith(texts, false);
      expect(errorsOf(unseeded)).toEqual(errorsOf(seeded));
      expect(playFirstChoice(unseeded)).toBe(playFirstChoice(seeded));
    },
  );

  test("the authored table takes the slot and keeps the builtin's other values and instances", () => {
    // `game.loading` is a prelude default the author does not restate;
    // `color.red` and `config.ui` are prelude instances registered into
    // their type's table; `color.mine` is an authored instance of the
    // overridden type.
    const program = compileWith(
      {
        [MAIN]: `define game with
  probe_field = 1
end

define color with
  probe_field = 2
end

define config with
  probe_field = 3
end

define mine as color with
  value = "rgb(1,2,3)"
end

-> start
scene start
  G {game.probe_field} {game.loading.percent}
  C {color.probe_field} {color.red.value} {color.mine.value}
  K {config.probe_field} {config.ui.layouts_element_name}
  fin

end
`,
      },
      true,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({
      output: "G 1 0\nC 2 rgb(220,38,38) rgb(1,2,3)\nK 3 layouts\n",
      errors: [],
    });
  });

  test("a key the author restates takes the authored value", () => {
    const program = compileWith(
      {
        [MAIN]: `define game with
  loading = { percent = 5 }
end

-> start
scene start
  {game.loading.percent}
  fin

end
`,
      },
      true,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({ output: "5\n", errors: [] });
  });

  test("an override in an included script applies too", () => {
    const program = compileWith(
      {
        [MAIN]: `include theme.sd

-> start
scene start
  {game.probe_field} {game.loading.percent}
  fin

end
`,
        "inmemory:///theme.sd": `define game with
  probe_field = 7
end
`,
      },
      true,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({ output: "7 0\n", errors: [] });
  });

  test("later compiles of an edited override agree with a cold compile", () => {
    const text = `define game with
  probe_field = 1
end

-> start
scene start
  {game.probe_field} {game.loading.percent} {type(color.red)}
  fin

end
`;
    const s = programSession(text, (compiler) =>
      compiler.configure({ seedBuiltinsIntoStory: true }),
    );
    const output = (root: ProgramRoot) => {
      expect(errorsOf(s.program)).toEqual([]);
      const story = new ProgramStory(root);
      const errors: string[] = [];
      story.onError = (message: string) => errors.push(message);
      return { output: story.ContinueMaximally(), errors };
    };
    expect(output(s.root)).toEqual({ output: "1 0 table\n", errors: [] });
    // The authored value changes.
    expect(output(s.edit("probe_field = 1", "probe_field = 2"))).toEqual({
      output: "2 0 table\n",
      errors: [],
    });
    // The override goes: the prelude's `game` holds the slot again.
    expect(
      output(s.edit("define game with\n  probe_field = 2\nend\n", "")),
    ).toEqual({ output: "nil 0 table\n", errors: [] });
    // And comes back.
    expect(
      output(
        s.edit("-> start", "define game with\n  probe_field = 3\nend\n\n-> start"),
      ),
    ).toEqual({ output: "3 0 table\n", errors: [] });
  });

  test.each([true, false])(
    "two authored root defines of a builtin type still collide (seeded: %s)",
    (seeded) => {
      const program = compileWith(
        {
          [MAIN]: `define game with
  probe_field = 1
end

define game with
  probe_field = 2
end

-> start
scene start
  Hi.
  fin

end
`,
        },
        seeded,
      );
      expect(errorsOf(program).map(([line, message]) => [line, message.split(".")[0]])).toEqual([
        [4, "Duplicate identifier `game`"],
      ]);
    },
  );
});
