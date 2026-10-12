import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { checkerTextUnits } from "./luauCheckerText";
import { runConformanceSource } from "../luau-conformance/conformanceTestHarness";
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

  test.each([
    ["a story-level while loop", `local c = true\nwhile if c then\n  false\nelse true do\n  Hello\nend\n`],
    ["a story-level if statement", `local c = true\nif if c then\n  false\nelse true then\n  Hello\nend\n`],
  ])("accepts a multiline if expression as the condition of %s", (_, text) => {
    expectAccepted(text);
  });

  test("an if expression left without its else reports the missing else, as Luau does", () => {
    const result = readings(`function f(c)\n  while if c then false\n    return 1\n  end\nend\n`);
    expect(result.official.map((error) => error.message)).toContain(
      "Expected 'else' when parsing if then else expression, got 'return'",
    );
    expect(result.errors).toContain("Expected 'else' when parsing if then else expression, got 'return'");
  });

  test("each such condition runs as Luau reads it", () => {
    const result = runConformanceSource(`local function whileCount()
  local n = 0
  while if n < 2 then
    true
  else false do
    n += 1
  end
  return n
end
local function untilCount()
  local n = 0
  repeat
    n += 1
  until if n >= 3 then
    true
  else false
  return n
end
local function ifPick(c)
  if if c then
    false
  else true then
    return "then"
  elseif if c then
    true
  else false then
    return "elseif"
  end
  return "none"
end
local function forSum(c)
  local sum = 0
  for _, value in if c then
    {1, 2, 3}
  else {10} do
    sum += value
  end
  return sum
end
assert(whileCount() == 2)
assert(untilCount() == 3)
assert(ifPick(false) == "then")
assert(ifPick(true) == "elseif")
assert(forSum(true) == 6)
assert(forSum(false) == 10)`);
    expect(result.errorMessages).toEqual([]);
    expect(result.returnedOK).toBe(true);
  });
});
