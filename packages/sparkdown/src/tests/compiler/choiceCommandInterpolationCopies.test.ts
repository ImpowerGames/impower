import { describe, expect, test } from "vitest";
import { readGrammarSource } from "./grammarSource";

const variables = readGrammarSource().variables as Record<string, string>;

const KINDS: readonly (readonly [kind: string, closer: string])[] = [
  ["TEXT", "[>]"],
  ["AUDIO", "[)][)]"],
  ["IMAGE", "\\]\\]"],
];

const SHARED = new Set(["SPARKDOWN_BLOCK_COMMENT_START"]);

const references = (source: string): string[] => [...source.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!);

const reachedFrom = (root: string): string[] => {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name) || SHARED.has(name)) return;
    seen.add(name);
    references(variables[name] ?? "").forEach(visit);
  };
  visit(root);
  return [...seen].sort();
};

const FAMILY = reachedFrom("SPAN_INTERPOLATION");

const asBase = (source: string, kind: string): string =>
  source.split(`{{${kind}_COMMAND_OPEN}}`).join("").split(`{{${kind}_COMMAND_`).join("{{");

describe("each choice command reads an interpolation with SPAN_INTERPOLATION's own rules, refusing only its closer (I-2444)", () => {
  test("the family SPAN_INTERPOLATION reaches is the one the copies cover", () => {
    expect(FAMILY.length).toBeGreaterThan(10);
    expect(FAMILY).toContain("SPAN_LONG_BRACKET_2");
    expect(FAMILY).toContain("CHOICE_PLAIN_BACKTICK_TEXT");
  });

  test.each(KINDS.flatMap(([kind]) => FAMILY.map((base) => [`${kind}_COMMAND_${base}`, base, kind] as const)))(
    "%s is %s with the command's closer refused",
    (copy, base, kind) => {
      expect(variables[copy], copy).toBeDefined();
      expect(asBase(variables[copy]!, kind)).toBe(variables[base]);
      expect(references(variables[copy]!).filter((name) => !name.startsWith(`${kind}_COMMAND_`) && !SHARED.has(name))).toEqual([]);
    },
  );

  test.each(KINDS.map(([kind, closer]) => [kind, closer] as const))("%s_COMMAND_OPEN refuses the closer %s", (kind, closer) => {
    expect(variables[`${kind}_COMMAND_OPEN`]).toBe(`(?!${closer})`);
  });

  test("every choice region's command characters take the copy of their own kind and no pre-scan is left", () => {
    for (const region of ["START", "ONLY", "INNER"]) {
      for (const [name, kind] of [
        [`CHOICE_${region}_TEXT_COMMAND_UNIT`, "TEXT"],
        [`CHOICE_${region}_TEXT_COMMAND_ESCAPED_UNIT`, "TEXT"],
        [`CHOICE_${region}_AUDIO_CHARACTER`, "AUDIO"],
        [`CHOICE_${region}_IMAGE_CHARACTER`, "IMAGE"],
      ] as const) {
        expect(references(variables[name]!).filter((ref) => ref === `${kind}_COMMAND_SPAN_INTERPOLATION`), name).toHaveLength(2);
      }
    }
    expect(Object.keys(variables).filter((name) => /^CHOICE_(START|ONLY|INNER)_(TEXT|AUDIO|IMAGE)_INTERPOLATION/.test(name))).toEqual([]);
  });
});
