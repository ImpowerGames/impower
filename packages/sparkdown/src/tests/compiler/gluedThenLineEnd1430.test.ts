import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { checkerTextUnits } from "./luauCheckerText";
import { officialSyntaxErrors } from "./officialSyntax";

const URI = "inmemory:///main.sd";

function readings(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  const diagnostics = (program.diagnostics?.[URI] ?? []).filter(
    (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
  );
  const errors = diagnostics.map((diagnostic) =>
    typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
  );
  const starts = diagnostics.map((diagnostic) => diagnostic.range.start);
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("Compiler kept no syntax tree");
  const units = checkerTextUnits(tree, text);
  const official = [units.prelude, ...units.flows].flatMap((unit) => officialSyntaxErrors(unit.text));
  return { errors, starts, official };
}

// Where each error begins, with a position on the line holding `then`
// given relative to the end of that `then`, so that a glued and a spaced
// `then` compare equal.
function relativeStarts(text: string, starts: { line: number; character: number }[]) {
  const lines = text.split("\n");
  const thenLine = lines.findIndex((line) => /then\s*$/.test(line));
  const thenEnd = lines[thenLine]!.replace(/\s*$/, "").length;
  return starts.map(({ line, character }) =>
    line === thenLine ? `then${character - thenEnd >= 0 ? "+" : ""}${character - thenEnd}` : `${line}:${character}`,
  );
}

// The value of the arm is on the line after its `then`.
const nextLine = (opening: string, trailing = "") =>
  `function f(c, ...)\n  local s = ${opening}${trailing}\n    1\n  else 2\n  return s\nend\n`;

describe("an if expression whose then is glued to its condition and ends its line (#1430)", () => {
  test.each([
    "if (c)then",
    'if "a"then',
    "if ...then",
    "if @/x/githen",
    "if @/x/then",
    "if c[1]then",
    "if {c}then",
    "if if c then false else (c)then",
    "if (c) then",
    "if @/x/gi then",
  ])("accepts %s with its value on the next line", (opening) => {
    const result = readings(nextLine(opening));
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each(["if (c)then", 'if "a"then', "if (c) then"])(
    "accepts %s followed by trailing whitespace",
    (opening) => {
      const result = readings(nextLine(opening, "  "));
      expect(result.official, "official Luau parser of projected checker text").toEqual([]);
      expect(result.errors).toEqual([]);
    },
  );

  test("accepts a glued elseif then with its value on the next line", () => {
    const text = `function f(c)\n  local s = if c then 0 elseif (c)then\n    1\n  else 2\n  return s\nend\n`;
    const result = readings(text);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("accepts a glued then and an else that each end their line", () => {
    const text = `function f(c)\n  local s = if (c)then\n    1\n  else\n    2\n  return s\nend\n`;
    const result = readings(text);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each([
    "local s = if c then 1 else 2 -- then\n  print(s)",
    "local s = if c then 1 -- then\n    else 2\n  print(s)",
    "local s = if c then 1 else 2 --[[ then ]]\n  print(s)",
  ])("does not read a line ending in a commented then as glued: %s", (statements) => {
    const result = readings(`function f(c)\n  ${statements}\n  return 0\nend\n`);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each([
    "if (c)then\n    return 1\n  end",
    "if if c then true else (c)then\n    return 1\n  end",
    "while (c)do\n    return 1\n  end",
  ])("accepts the statement %s", (statement) => {
    const result = readings(`function f(c)\n  ${statement}\n  return 0\nend\n`);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  // A then arm with no value reports the same errors whether or not its
  // `then` is glued, and never asks for an `else` it has not reached.
  const missingValue: [string, (opening: string) => string][] = [
    ["at the end of the script", (opening) => `local c = true\nlocal s = ${opening}`],
    ["at the end of the script before a final line break", (opening) => `local c = true\nlocal s = ${opening}\n`],
    ["followed by trailing whitespace at the end of the script", (opening) => `local c = true\nlocal s = ${opening}  \n`],
    ["whose next line begins a statement", (opening) => `function f(c)\n  local s = ${opening}\n  return s\nend\n`],
    ["whose next line ends the function", (opening) => `function f(c)\n  local s = ${opening}\nend\n`],
    ["before a column-0 line", (opening) => `local c = true\nlocal s = ${opening}\nlocal t = 1\n`],
    ["before a column-0 call", (opening) => `local c = true\nlocal s = ${opening}\nprint(c)\n`],
  ];
  describe.each(missingValue)("an arm with no value %s", (_, script) => {
    test.each([
      ["if (c)then", "if (c) then"],
      ['if "a"then', 'if "a" then'],
      ["if @/x/githen", "if @/x/gi then"],
    ])("reports the same errors for %s as for %s", (glued, spaced) => {
      const gluedResult = readings(script(glued));
      const spacedResult = readings(script(spaced));
      expect(spacedResult.official.length, "official Luau parser rejects the spaced form").toBeGreaterThan(0);
      expect(
        gluedResult.official.map((error) => error.message),
        "official Luau parser reports the same errors for both forms",
      ).toEqual(spacedResult.official.map((error) => error.message));
      expect(spacedResult.errors.length, "compiler rejects the spaced form").toBeGreaterThan(0);
      expect(spacedResult.errors).not.toContain("Expected 'else' when parsing if then else expression");
      expect(gluedResult.errors).toEqual(spacedResult.errors);
      expect(relativeStarts(script(glued), gluedResult.starts), "errors begin at the same places").toEqual(
        relativeStarts(script(spaced), spacedResult.starts),
      );
    });
  });
});
