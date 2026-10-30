import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { isStatementNodeName } from "../../compiler/lower/utils/lineContinuation";

type Rule = { patterns?: { include: string }[]; begin?: string; match?: string };
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<string, Rule>;

function concreteRules(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const rule = repository[name];
  if (!rule) return [];
  if (rule.begin || rule.match || !rule.patterns) return [name];
  return rule.patterns.flatMap((p) => concreteRules(p.include.slice(1), seen));
}

describe("statement boundary after a continued comma", () => {
  test("recognizes every statement a Luau block reaches", () => {
    const statements = [
      ...concreteRules("LuauDeclarations"),
      ...concreteRules("LuauControlBlock"),
    ].filter(
      (name) => name !== "LuauFunctionDefinition",
    );
    expect(statements.filter((name) => !isStatementNodeName(name))).toEqual([]);
  });
});
