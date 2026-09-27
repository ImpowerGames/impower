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

  test("an unknown name is reported once", () => {
    const program = compile(`function lookup()
  return missingInFunction
end

scene start
  & print(missingInScene)
end
`);
    // Sparkdown's resolver reports a name it cannot find outside a function,
    // so the checker does not report it again; inside a function only the
    // checker reports it.
    expect(typeWarnings(program)).toEqual(["5:9-5:26 Unknown global 'missingInFunction'; consider assigning to it first"]);
    expect(describeDiagnostics(program, false).filter((d) => d.includes("missing"))).toEqual([
      "9:0-9:25 Cannot find variable named `missingInScene`",
    ]);
  });
});
