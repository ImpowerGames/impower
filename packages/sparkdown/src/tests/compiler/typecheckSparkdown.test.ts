// What the type checker reads of a `.sd` file (#599): the Luau statements,
// wherever Sparkdown's own constructs put them, with the names Sparkdown
// declares in scope. None of Sparkdown's own syntax may come out as a type
// warning, and the Luau around it is still checked.

import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { TYPE_ERROR_KINDS } from "../../compiler/typecheck/Error";
import type { SparkProgram } from "../../compiler/types/SparkProgram";

const MAIN = "inmemory:///main.sd";

function compile(body: string): SparkProgram {
  const text = `---\ntypecheck: strict\n---\n\n${body}`;
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
}

function describeDiagnostics(program: SparkProgram, types: boolean): string[] {
  return (program.diagnostics?.[MAIN] ?? [])
    .filter((d) => TYPE_ERROR_KINDS.has(String(d.code)) === types)
    .map((d) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    });
}

/** The type warnings, as `line:character-line:character message`. */
function typeWarnings(program: SparkProgram): string[] {
  return describeDiagnostics(program, true);
}

describe("the Luau of a .sd file", () => {
  test("a choose block's statements are checked in its flow, which the block does not scope", () => {
    const program = compile(`scene start(n: number)
  choose
    + [Ask]
      Bunny asks.
      & local answer: string = n
    + [Leave]
      & print(n)
  then
    & local after = n
  end
  & print(after)
end
`);
    expect(typeWarnings(program)).toEqual(["8:31-8:32 Expected this to be 'string', but got 'number'"]);
  });

  test("a branch is checked in its scene, seeing the scene's locals and an earlier branch's, with its parameters' types", () => {
    const program = compile(`scene start(n: number)
  local value: number = n
  branch inner(k: number)
    local copy: number = value + k
    local wrong: string = k
  end
  branch other
    local seen: number = copy
  end
end
`);
    // A branch runs in its scene's call-stack element, so `value` and `copy`
    // are in scope, as at runtime.
    expect(typeWarnings(program)).toEqual(["8:26-8:27 Expected this to be 'string', but got 'number'"]);
  });

  test("a string that spans lines is checked as written, blank lines and trailing spaces included", () => {
    const program = compile(
      [
        'local blank: "a\\n\\nb" = [[a',
        "",
        "b]]",
        'local spaced: "a \\nb" = [[a ',
        "b]]",
        'local wrong: "a\\nb" = [[a',
        "",
        "b]]",
        "",
      ].join("\n"),
    );
    expect(typeWarnings(program)).toEqual(["9:22-11:3 Expected this to be '\"a\\nb\"', but got '\"a\\n\\nb\"'"]);
  });

  test("a range after a character outside ASCII is in the document's columns", () => {
    const program = compile(`function f(a: string, b: string) end

scene start
  & f("é", 42)
  local wide: number = "é"
end
`);
    expect(typeWarnings(program)).toEqual([
      "7:11-7:13 Expected this to be 'string', but got 'number'",
      "8:23-8:26 Expected this to be 'number', but got 'string'",
    ]);
  });

  test("Sparkdown's own expressions are not Luau's to warn about, and the Luau around them is checked", () => {
    const program = compile(`scene place
end

function geese(n: number): string
  return \`There {plural(n)|one="is"|other="are"} {n} goose {{shout}}\`
end

scene start(n: number)
  local target = -> place
  local pattern = @/ab+c/i
  local line = cycle "a" | "b" end
  local wrong: string = n
  & print(target, pattern, line)
end
`);
    expect(typeWarnings(program)).toEqual(["15:24-15:25 Expected this to be 'string', but got 'number'"]);
  });

  test("a type the program defines can annotate Luau", () => {
    const program = compile(`define companion with
  trust = 0
end

scene start(c: companion)
  local other: companion = c
  & print(other.trust)
end
`);
    expect(typeWarnings(program)).toEqual([]);
  });

  test("a flow sees the type aliases its file declares outside every flow", () => {
    const program = compile(`type Point = { x: number, y: number }

scene start
  local good: Point = { x = 1, y = 2 }
  local bad: Point = { x = 1, y = "two" }
end
`);
    expect(typeWarnings(program)).toEqual(["8:34-8:39 Expected this to be 'number', but got 'string'"]);
  });

  test("an unknown name is reported once, on the line that reads it", () => {
    const program = compile(`function lookup()
  return missingInFunction
end

& print(missingAtTop)

scene start
  & print(missingInScene)
  local copy = missingInSceneLocal
  branch first
    if missingInBranch then
      Yes.
    end
  end
end
`);
    // Sparkdown's resolver reports a read it can place, and the checker leaves
    // that read out; a read the resolver cannot place yet (#944), such as one
    // in a scene's `local` or `if`, is the checker's to report.
    const diagnostics = [...describeDiagnostics(program, true), ...describeDiagnostics(program, false)];
    const lines = (name: string) =>
      diagnostics.filter((d) => d.includes(`\`${name}\``) || d.includes(`'${name}'`)).map((d) => Number(d.split(":")[0]));
    expect({
      missingInFunction: lines("missingInFunction"),
      missingAtTop: lines("missingAtTop"),
      missingInScene: lines("missingInScene"),
      missingInSceneLocal: lines("missingInSceneLocal"),
      missingInBranch: lines("missingInBranch"),
    }).toEqual({
      missingInFunction: [5],
      missingAtTop: [8],
      missingInScene: [11],
      missingInSceneLocal: [12],
      missingInBranch: [14],
    });
  });

  test("a branch's parameters before its `...` are declared, and its `...` has the type the branch gives it, past any comment", () => {
    const program = compile(`scene start(a: number)
  branch inner(k: number, ...: boolean)
    local first: boolean = ...
    local wrong: string = k
  end
end

scene other
  branch only(...: number)
    local fine: number = ...
    local wrong: string = ...
  end
end

scene commented
  branch inner(... --[[args]] : boolean)
    local wrong: string = ...
  end
end
`);
    expect(typeWarnings(program)).toEqual([
      "7:26-7:27 Expected this to be 'string', but got 'number'",
      "14:26-14:29 Expected this to be 'string', but got 'number'",
      "20:26-20:29 Expected this to be 'string', but got 'boolean'",
    ]);
  });

  test("where branches in a scene give `...` different types, as written, `...` has neither, and the scene is still checked", () => {
    const program = compile(`scene start
  branch first(...: string)
    local mine: string = ...
  end
  branch second(...: number)
    local theirs: number = ...
  end
  local bad: string = 1
end

scene singletons
  branch one(...: "a  b")
    local mine: "a  b" = ...
  end
  branch two(...: "a b")
    local theirs: "a b" = ...
  end
  local bad: string = 1
end
`);
    expect(typeWarnings(program)).toEqual([
      "11:22-11:23 Expected this to be 'string', but got 'number'",
      "21:22-21:23 Expected this to be 'string', but got 'number'",
    ]);
  });

  test("a branch's parameter without an annotation holds a value of any type, as an argument does", () => {
    const program = compile(`scene start
  branch inner(k)
    local sum: number = k + 1
    & k()
    local bad: string = 1
  end
end
`);
    expect(typeWarnings(program)).toEqual(["8:24-8:25 Expected this to be 'string', but got 'number'"]);
  });

  test("a parameter list the grammar ends early is read as the runtime binds it", () => {
    const program = compile(`scene start(a: number)
  branch inner(f: (...any) -> (), k: number)
    & f()
    & print(any)
    local wrong: string = k
  end
end
`);
    // The grammar ends the list at the `)` inside `f`'s type (#876), so the
    // runtime binds `f`, `any` and `...` and not `k`, and Sparkdown's own
    // resolver reports `k` where it can place the read.
    expect(typeWarnings(program)).toEqual(["8:26-8:27 Unknown global 'k'; consider assigning to it first"]);
  });
});
