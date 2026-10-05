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
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
    .map((diagnostic) => typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value);
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("Compiler kept no syntax tree");
  const units = checkerTextUnits(tree, text);
  const official = [units.prelude, ...units.flows].flatMap((unit) => officialSyntaxErrors(unit.text));
  return { errors, official };
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
    "if (c)then\n    return 1\n  end",
    "if if c then true else (c)then\n    return 1\n  end",
    "while (c)do\n    return 1\n  end",
  ])("accepts the statement %s", (statement) => {
    const result = readings(`function f(c)\n  ${statement}\n  return 0\nend\n`);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each(["if (c)then", "if (c) then"])("still rejects %s at the end of the script", (opening) => {
    const result = readings(`local c = true\nlocal s = ${opening}`);
    expect(result.official.length, "official Luau parser rejects projected checker text").toBeGreaterThan(0);
    expect(result.errors.length, "compiler rejects the authored expression").toBeGreaterThan(0);
  });

  test.each(["if (c)then", "if (c) then"])(
    "still rejects %s whose next line begins a statement",
    (opening) => {
      const text = `function f(c)\n  local s = ${opening}\n  return s\nend\n`;
      const result = readings(text);
      expect(result.official.length, "official Luau parser rejects projected checker text").toBeGreaterThan(0);
      expect(result.errors.length, "compiler rejects the authored expression").toBeGreaterThan(0);
    },
  );

  test.each(["if (c)then", "if (c) then"])(
    "still rejects %s at the end of a top-level statement before a column-0 line",
    (opening) => {
      const text = `local c = true\nlocal s = ${opening}\nlocal t = 1\n`;
      const result = readings(text);
      expect(result.official.length, "official Luau parser rejects projected checker text").toBeGreaterThan(0);
      expect(result.errors.length, "compiler rejects the authored expression").toBeGreaterThan(0);
    },
  );
});
