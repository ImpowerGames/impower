import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { documentLanguageOf } from "./languageEquality";

interface GrammarJson {
  luauFile: { rule: string };
  repository: Record<string, unknown>;
}

const GRAMMAR = GRAMMAR_DEFINITION as unknown as GrammarJson;

const STORY_RULES = new Set(["SparkdownStatement", "DisplayStatements", "Choice"]);

const { embeddedLanguages } = documentLanguageOf();
const LUAU_LANGUAGE = documentLanguageOf({ luauFile: true }).language;
const LUAU_SCOPES = Object.keys(embeddedLanguages).filter(
  (scope) => embeddedLanguages[scope] === LUAU_LANGUAGE,
);

const scopeParts = (value: unknown): string[] =>
  typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];

const isLuauScope = (part: string) =>
  LUAU_SCOPES.some((scope) => part === scope || part.startsWith(`${scope}.`));

const isDisplayScope = (part: string) =>
  part === "string.display" || part.startsWith("string.display.");

interface Region {
  owner: string;
  content: unknown;
}

function markedRegions(grammar: GrammarJson): Region[] {
  const regions: Region[] = [
    { owner: `luauFile root (${grammar.luauFile.rule})`, content: grammar.repository[grammar.luauFile.rule] },
  ];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (scopeParts(record["name"]).some(isLuauScope)) {
      regions.push({ owner: `${path} (name)`, content: record });
    } else if (scopeParts(record["contentName"]).some(isLuauScope)) {
      regions.push({ owner: `${path} (contentName)`, content: record["patterns"] });
    }
    for (const [key, value] of Object.entries(record)) {
      visit(value, `${path}.${key}`);
    }
  };
  for (const [name, rule] of Object.entries(grammar.repository)) visit(rule, name);
  return regions;
}

function storyRulesReachedFrom(grammar: GrammarJson, content: unknown): string[] {
  const found = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  const walk = (node: unknown, where: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, where);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const field of ["name", "contentName"]) {
      for (const part of scopeParts(record[field])) {
        if (isDisplayScope(part)) found.add(`${where} (${part})`);
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "include" && typeof value === "string" && value.startsWith("#")) {
        queue.push(value.slice(1));
      } else {
        walk(value, where);
      }
    }
  };
  walk(content, "(region)");
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    if (STORY_RULES.has(name)) found.add(name);
    walk(grammar.repository[name], name);
  }
  return [...found].sort();
}

function violations(grammar: GrammarJson): string[] {
  const out: string[] = [];
  for (const region of markedRegions(grammar)) {
    for (const rule of storyRulesReachedFrom(grammar, region.content)) {
      out.push(`${region.owner} reaches ${rule}`);
    }
  }
  return out;
}

describe("Luau regions reach no story text", () => {
  test("the grammar marks Luau regions", () => {
    const owners = markedRegions(GRAMMAR).map((r) => r.owner);
    for (const rule of ["LuauFunctionDefinition", "LuauDefine", "LuauLayout", "LuauSparkdownExplicitStatement"]) {
      expect(owners.some((o) => o.startsWith(`${rule} `))).toBe(true);
    }
  });

  test("no display-text or story statement rule is reachable from a marked region", () => {
    expect(violations(GRAMMAR)).toEqual([]);
  });

  test("a display-text rule added to a marked rule's patterns is reported", () => {
    const mutated = structuredClone(GRAMMAR) as GrammarJson;
    const rule = mutated.repository["LuauFunctionDefinition"] as { patterns: unknown[] };
    rule.patterns.push({ include: "#DisplayStatements" });
    expect(violations(mutated)).toContain(
      "LuauFunctionDefinition (contentName) reaches DisplayStatements",
    );
  });
});
