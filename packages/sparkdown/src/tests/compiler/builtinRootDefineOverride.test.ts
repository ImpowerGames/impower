// #454 — a root define named after a builtin type root (`define game with
// ... end`) overrides the prelude's table in a seeded compile, the player's
// mode, as it already compiles in the unseeded editor compile.
//
// The builtins prelude declares every type root with its own root define, and
// a seeded compile parses that prelude ahead of the project. The prelude's
// root defines were never marked as prelude declarations, so the authored
// root define reached `FlowBase.AddNewVariableDeclaration` as a plain
// collision: the compile reported "Duplicate identifier `game`. A var named
// `game` already exists on null" and the authored define was dropped. An
// override takes the slot, keeps the prelude's values for the keys it does
// not restate, and keeps every builtin instance registered in the type's
// table, which then inherits from the authored root.

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

  test("a builtin instance inherits from the authored root", () => {
    const program = compileWith(
      {
        [MAIN]: `define color with
  probe_field = 2
end

-> start
scene start
  {color.red.probe_field} {color.red.value}
  fin

end
`,
      },
      true,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({ output: "2 rgb(220,38,38)\n", errors: [] });
  });

  test.each([true, false])(
    "the override's initializer reads the authored globals declared before it (seeded: %s)",
    (seeded) => {
      const program = compileWith(
        {
          [MAIN]: `store custom = 7

define game with
  probe_field = custom
end

-> start
scene start
  {game.probe_field}
  fin

end
`,
        },
        seeded,
      );
      expect(errorsOf(program)).toEqual([]);
      expect(play(program)).toEqual({ output: "7\n", errors: [] });
    },
  );

  test.each([true, false])(
    "a root define written after a member of its type keeps that member (seeded: %s)",
    (seeded) => {
      // The member mints the type's table when it runs first; the root then
      // takes over what registered there, as it does a builtin's members.
      const program = compileWith(
        {
          [MAIN]: `define pebble as rock with
  size = 1
end

define rock with
  hardness = 5
end

-> start
scene start
  {rock.pebble.size} {rock.pebble.hardness}
  fin

end
`,
        },
        seeded,
      );
      expect(errorsOf(program)).toEqual([]);
      expect(play(program)).toEqual({ output: "1 5\n", errors: [] });
    },
  );

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

describe("the edges of a root override", () => {
  /** A seeded compile of `declarations` and a scene line of `line`, which
   *  reports no error and shows `expected`. */
  function shows(
    declarations: string,
    line: string,
    expected: string,
    seeded = true,
  ): SparkProgram {
    const program = compileWith(
      {
        [MAIN]: `${declarations}
-> start
scene start
  ${line}
  fin

end
`,
      },
      seeded,
    );
    expect(errorsOf(program)).toEqual([]);
    expect(play(program)).toEqual({ output: `${expected}\n`, errors: [] });
    return program;
  }

  // `typewriter` is a dual name: the prelude's bare `typewriter` is a synth
  // instance and its root is displaced to `$typewriter_typewriter`.
  test.each(["character", "typewriter"])(
    "an override of the dual-named root `%s` reaches a member defined after it",
    (type) => {
      shows(
        `define ${type} with
  probe_field = 7
end

define hero as ${type} with
  other = 3
end
`,
        `{${type}.hero.probe_field} {${type}.hero.other}`,
        "7 3",
      );
    },
  );

  test("a builtin member of the displaced `typewriter` root inherits the override", () => {
    shows(
      `define typewriter with
  probe_field = 7
end
`,
      "{typewriter.title.probe_field}",
      "7",
    );
  });

  test.each(["character", "typewriter"])(
    "two authored roots of the dual name `%s` collide at the second",
    (type) => {
      const program = compileWith(
        {
          [MAIN]: `define ${type} with
  probe_field = 1
end

define ${type} with
  probe_field = 2
end

-> start
scene start
  Hi.
  fin

end
`,
        },
        true,
      );
      expect(
        errorsOf(program).map(([line, message]) => [line, message.split(".")[0]]),
      ).toEqual([[4, `Duplicate identifier \`${type}\``]]);
    },
  );

  test("a builtin member owns the `store` defaults the override declares", () => {
    shows(
      `define color with
  store score = 7
end

define mine as color with
  own = 1
end
`,
      `& color.score = 9
  {color.red.score} {rawget(color.red, "score")} {color.mine.score} {color.score}`,
      "7 7 7 9",
    );
  });

  test("a member written before its own root owns the root's `store` defaults", () => {
    shows(
      `define pebble as rock with
  size = 1
end

define rock with
  store hardness = 5
end
`,
      `{rock.pebble.hardness} {rawget(rock.pebble, "hardness")}`,
      "5 5",
    );
  });

  test("a grandchild keeps inheriting from its own parent", () => {
    shows(
      `define shade as color with
  probe_field = 8
end

define dark as shade with
  own = 1
end

define color with
  probe_field = 7
end
`,
      "{color.dark.probe_field} {color.shade.probe_field} {color.red.probe_field}",
      "8 8 7",
    );
  });

  test("a structural block keeps inheriting from its sibling parent", () => {
    shows(
      `animation base with
  probe_field = 8
end

animation child as base with
  own = 1
end

define animation with
  probe_field = 7
end
`,
      "{animation.child.probe_field} {animation.base.probe_field}",
      "8 8",
    );
  });

  test("a structural block waiting for its parent links to it after the override", () => {
    shows(
      `animation child as later with
  own = 1
end

define animation with
  probe_field = 7
end

animation later with
  probe_field = 8
end
`,
      "{animation.child.probe_field} {animation.later.probe_field}",
      "8 8",
    );
  });

  test("a typed define named after a type root leaves that root alone", () => {
    shows(
      `define game as foo with
  probe_field = 7
end
`,
      "{game.loading.percent} {foo.game.probe_field}",
      "0 7",
    );
  });

  test("a nested table supplied through a variable keeps the builtin's other fields", () => {
    shows(
      `store custom = { percent = 5 }

define game with
  loading = custom
end
`,
      "{game.loading.percent} {game.loading.active}",
      "5 false",
    );
  });

  test("a nested key the author computes takes the authored value", () => {
    shows(
      `store field = "percent"

define game with
  loading = { [field] = 5 }
end
`,
      "{game.loading.percent} {game.loading.active}",
      "5 false",
    );
  });

  test("a member the override restates as a table keeps its registration and values", () => {
    shows(
      `define config with
  probe = 7
  ui = { root_text_size = "112.5%" }
end
`,
      "{config.ui.root_text_size} {config.ui.layouts_element_name} {config.ui.probe}",
      "112.5% layouts 7",
    );
  });

  test("a nested table mixing positions with names is merged as a record", () => {
    shows(
      `define game with
  loading = { [1] = 99, percent = 5 }
end
`,
      "{game.loading.percent} {game.loading.active} {game.loading[1]}",
      "5 false 99",
    );
  });

  test("a mixed table restating a member keeps the member", () => {
    shows(
      `define config with
  ui = { [1] = 99, root_text_size = "112.5%" }
end
`,
      "{config.ui.root_text_size} {config.ui.layouts_element_name}",
      "112.5% layouts",
    );
  });

  test("a record replaces a function the type held under that key", () => {
    shows(
      `store setup = rawset(game, "loading", math.abs)

define game with
  loading = { percent = 5 }
end
`,
      "{type(game.loading)} {game.loading.percent}",
      "table 5",
    );
  });

  test("a function replaces the record it meets and leaves that record a table", () => {
    shows(
      `store original = rawget(game, "loading")

define game with
  loading = rawget({ f = math.abs }, "f")
end
`,
      "{type(original)} {type(game.loading)}",
      "table function",
    );
  });

  test("a record the type holds under two keys is filled from each", () => {
    shows(
      `store setup = rawset(game, "alias", game.loading)

define game with
  loading = { percent = 5 }
  alias = { percent = 6 }
end
`,
      "{game.loading.active} {game.alias.active} {game.alias.percent}",
      "false false 6",
    );
  });

  test("an empty table restating a nested record keeps the builtin's fields", () => {
    const program = shows(
      `define game with
  loading = {}
end
`,
      "{game.loading.active} {game.loading.percent}",
      "false 0",
    );
    expect(program.context?.["game"]?.["$default"]?.loading).toMatchObject({
      active: false,
      percent: 0,
    });
  });

  test("an empty table restating a member keeps the member", () => {
    shows(
      `define config with
  probe = 7
  ui = {}
end
`,
      "{config.ui.layouts_element_name} {config.ui.probe}",
      "layouts 7",
    );
  });

  test("an empty table restating a list empties it, as the context does", () => {
    const program = shows(
      `define inflection with
  lilt = {}
end
`,
      "{#inflection.lilt}",
      "0",
    );
    expect(program.context?.["inflection"]?.["$default"]?.lilt).toEqual({});
  });

  test("a list the override restates replaces the builtin's list whole", () => {
    shows(
      `define inflection with
  lilt = { 9, 8 }
end
`,
      // The builtin's `lilt` is `{ 1, -2, 7, 10 }`.
      "{#inflection.lilt} {inflection.lilt[1]} {inflection.lilt[2]}",
      "2 9 8",
    );
  });

  test("a nested table the override restates keeps the builtin's other fields, as the context does", () => {
    const program = shows(
      `define game with
  loading = { percent = 5 }
end
`,
      "{game.loading.percent} {game.loading.active}",
      "5 false",
    );
    expect(program.context?.["game"]?.["$default"]?.loading).toMatchObject({
      percent: 5,
      active: false,
    });
  });
});
