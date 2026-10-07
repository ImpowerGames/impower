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

function expectAccepted(text: string) {
  const result = readings(text);
  expect(result.official, "official Luau parser of projected checker text").toEqual([]);
  expect(result.errors).toEqual([]);
}

describe("a multiline if expression after a keyword that begins a condition (#1495)", () => {
  test.each(["if c then", "if (c)then", "if (c) then"])("accepts a while condition opening %s", (open) => {
    expectAccepted(`function f(c)\n  while ${open}\n    false\n  else true do\n    return 1\n  end\nend\n`);
  });

  test.each([
    "if c then false\n  else true do",
    "if c then\n    false else true do",
    "if c\n    then false else true do",
  ])("accepts a while condition broken as %j", (condition) => {
    expectAccepted(`function f(c)\n  while ${condition}\n    return 1\n  end\nend\n`);
  });

  test("control: a one-line if expression as a while condition is accepted", () => {
    expectAccepted(`function f(c)\n  while if c then false else true do\n    return 1\n  end\nend\n`);
  });

  test.each([
    ["an if statement's condition", `function f(c)\n  if if c then\n    false\n  else true then\n    return 1\n  end\nend\n`],
    [
      "an elseif condition",
      `function f(c)\n  if c then\n  elseif if c then\n    false\n  else true then\n    return 1\n  end\nend\n`,
    ],
    ["an until condition", `function f(c)\n  repeat\n    c = 1\n  until if c then\n    false\n  else true\nend\n`],
    ["the value a for loop iterates", `function f(c)\n  for x in if c then\n    {}\n  else {} do\n    return 1\n  end\nend\n`],
  ])("accepts a multiline if expression as %s", (_, text) => {
    expectAccepted(text);
  });
});
