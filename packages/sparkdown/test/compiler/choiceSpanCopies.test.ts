import { describe, expect, test } from "vitest";
import { readGrammarSource } from "./grammarSource";

const SOURCE = readGrammarSource();
const repository = SOURCE.repository as Record<string, any>;
const variables = SOURCE.variables as Record<string, string>;

const SPANS = ["Raw", "Bold", "Italic", "Underline", "Centered", "EmphasisTilde", "EmphasisColon"];
const SPAN_CONTENTS = ["SpanContent", "RawContent"];

interface Region {
  rule: string;
  variable: string;
}

const REGIONS: Region[] = [
  { rule: "ChoiceStart", variable: "CHOICE_START_" },
  { rule: "ChoiceOnly", variable: "CHOICE_ONLY_" },
  { rule: "ChoiceInner", variable: "CHOICE_INNER_" },
];

const asDisplay = (value: unknown, region: Region): unknown => {
  if (typeof value === "string") {
    const prefix = `#${region.rule}`;
    if (value.startsWith(prefix) && [...SPAN_CONTENTS, ...SPANS].includes(value.slice(prefix.length))) {
      return `#${value.slice(prefix.length)}`;
    }
    return value.split(`{{${region.variable}`).join("{{");
  }
  if (Array.isArray(value)) return value.map((item) => asDisplay(item, region));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asDisplay(item, region)]));
  }
  return value;
};

const includes = (rule: string): string[] =>
  (repository[rule]?.patterns ?? []).map((pattern: { include?: string }) => pattern.include);

const displaySpanOrder = (): string[] =>
  [...includes("InlineText"), ...includes("Styling"), ...includes("Emphasis")]
    .map((include) => include.slice(1))
    .filter((name) => SPANS.includes(name));

describe("each choice region's span rules are the display span rules with the region's names", () => {
  test.each(REGIONS.flatMap((region) => SPANS.map((span) => [`${region.rule}${span}`, span, region] as const)))(
    "%s is %s with the region's content and end",
    (copy, span, region) => {
      expect(repository[copy]).toBeDefined();
      expect(asDisplay(repository[copy], region)).toEqual(repository[span]);
    },
  );

  test.each(REGIONS.map((region) => [region.rule, region] as const))(
    "%sSpans lists every span copy in the order display text tries the spans",
    (_name, region) => {
      expect([...displaySpanOrder()].sort()).toEqual([...SPANS].sort());
      expect(includes(`${region.rule}Spans`)).toEqual(displaySpanOrder().map((span) => `#${region.rule}${span}`));
    },
  );

  test.each(REGIONS.map((region) => [region.rule, region] as const))(
    "%s's span variables are the display span variables with the region's names",
    (_name, region) => {
      const used = new Set<string>();
      const visit = (value: unknown) => {
        for (const [, name] of JSON.stringify(value).matchAll(/\{\{([A-Z_0-9]+)\}\}/g)) {
          if (used.has(name!)) continue;
          used.add(name!);
          visit(variables[name!]);
        }
      };
      SPANS.forEach((span) => visit(repository[`${region.rule}${span}`]));
      const copies = [...used].filter(
        (name) =>
          name.startsWith(region.variable) &&
          name !== `${region.variable}SPAN_END` &&
          variables[name.slice(region.variable.length)] !== undefined,
      );
      expect(copies.length).toBeGreaterThan(0);
      for (const copy of copies) {
        expect(asDisplay(variables[copy], region), copy).toBe(variables[copy.slice(region.variable.length)]);
      }
    },
  );

  test.each(REGIONS.map((region) => [region.variable, region] as const))(
    "%sSPAN_END ends a span where display text does or before the whitespace that ends the region's text",
    (_name, region) => {
      expect(variables["SPAN_END"]).toBe("(?:{{EOL}}|{{DISPLAY_CHAIN_END}})");
      expect(variables[`${region.variable}SPAN_END`]).toBe(
        `(?:{{SPAN_END}}|{{WS}}*{{${region.variable}TEXT_END}})`,
      );
    },
  );
});
