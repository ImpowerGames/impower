import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script" as const,
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      const message =
        typeof d.message === "string" ? d.message : (d.message?.value ?? "");
      out.push(
        `${d.range?.start?.line}:${d.range?.start?.character}-${d.range?.end?.character} ${d.severity} ${message}`,
      );
    }
  }
  return out;
}

const style = (selector: string) =>
  `style card {\n  text-color = slate_20\n  ${selector} {\n    text-color = slate_90\n  }\n}\n`;

const unknownStateWarnings = (source: string) =>
  diagnose(source).filter((d) => d.includes("not a known state"));

const HINT = "> States are the player's names such as `@hovered`, `@focused`, `@pressed`, `@first` and `@before`";

const typoWarnings = (source: string) => unknownStateWarnings(source).filter((d) => d.includes("`@hoverd`"));

describe("unknown selector state", () => {
  test("warns on a misspelt state", () => {
    expect(unknownStateWarnings(style("@hoverd"))).toEqual([
      `2:2-9 2 \`@hoverd\` is not a known state, so this block never applies\n${HINT}`,
    ]);
  });

  test("warns on a misspelt state inside a selector function", () => {
    expect(typoWarnings(style("@not(@hoverd)"))).toEqual([
      expect.stringMatching(/^2:7-14 2 `@hoverd` is not a known state/),
    ]);
  });

  test.each([
    ["@is(@first, @hoverd)", 14, 21],
    ["@where(@hoverd, @first)", 9, 16],
    ["@is(@not(@hoverd), @first)", 11, 18],
  ])("says only the alternative never matches in %s", (selector, from, to) => {
    expect(typoWarnings(style(selector))).toEqual([
      `2:${from}-${to} 2 \`@hoverd\` is not a known state, so this alternative never matches\n${HINT}`,
    ]);
  });

  test("says only the alternative never matches for a wrong @theme in @is", () => {
    expect(diagnose(style("@is(@theme(blue), @first)"))).toContainEqual(
      expect.stringMatching(/^2:6-18 2 `@theme` takes `\(light\)` or `\(dark\)`, not `\(blue\)`, so this alternative never matches\n/),
    );
  });

  test.each(["@hoverd", "@hovered, @hoverd", "@not(@hoverd)", "@has(@hoverd)"])(
    "says the whole block never applies in %s",
    (selector) => {
      expect(typoWarnings(style(selector))).toEqual([
        expect.stringContaining("`@hoverd` is not a known state, so this block never applies\n"),
      ]);
    },
  );

  test("warns on an unknown name taking parameters", () => {
    expect(unknownStateWarnings(style("@nth-chld(2)"))).toEqual([
      expect.stringMatching(/^2:2-11 2 `@nth-chld` is not a known state/),
    ]);
  });

  test.each([
    ["@keyframes", "keyframes"],
    ["@charset", "charset"],
    ["@font-face", "font-face"],
  ])("warns on %s, which the player does not apply", (selector, name) => {
    expect(unknownStateWarnings(style(selector))).toEqual([
      expect.stringContaining(`\`@${name}\` is not a known state, so this block never applies\n`),
    ]);
  });

  test.each([
    "@hovered",
    "@focused",
    "@type_submit",
    "@file-button",
    "@initial",
    "@first",
    "@before",
    "@theme(dark)",
    "@direction(rtl)",
    "@language(en)",
    "@screen-size(sm)",
    "@container_size(md)",
    "@hovered @focused",
    "@hover",
    "@focus-visible",
    "@first-child",
    "@last-of-type",
    "@placeholder-shown",
    "@empty",
    "@nth-child(2)",
    "@has(icon)",
    "@not(@first-child)",
    "@is(@hover, @focus-visible)",
    "@where(@checked)",
    "@dir(rtl)",
    "@lang(en)",
  ])("accepts %s", (selector) => {
    expect(unknownStateWarnings(style(selector))).toEqual([]);
  });

  test.each([
    ["@nth-child[2n of choice]", "nth-child", "needs its arguments in parentheses right after it"],
    ["@nth-child (2)", "nth-child", "needs its arguments in parentheses right after it"],
    ["@has", "has", "needs its arguments in parentheses right after it"],
    ["@lang", "lang", "needs its arguments in parentheses right after it"],
    ["@direction", "direction", "needs its arguments in parentheses right after it"],
    ["@screen-size", "screen-size", "needs its arguments in parentheses right after it"],
    ["@hover(x)", "hover", "takes no arguments"],
    ["@hovered(x)", "hovered", "takes no arguments"],
  ])("warns that %s is written with the wrong arguments", (selector, name, problem) => {
    expect(diagnose(style(selector)).filter((d) => d.includes(`\`@${name}\``))).toEqual([
      expect.stringMatching(
        new RegExp(`^2:2-${3 + name.length} 2 \`@${name}\` ${problem}, so this block never applies\\n> `),
      ),
    ]);
  });

  test("says only the alternative never matches for a state missing its arguments in @is", () => {
    expect(diagnose(style("@is(@has, @first)")).filter((d) => d.includes("`@has`"))).toEqual([
      "2:6-10 2 `@has` needs its arguments in parentheses right after it, so this alternative never matches\n> e.g. `@has(…)`, with no space before `(`",
    ]);
  });

  test.each(["@host", "@host(card)", "@layer", "@media (min-width: 1px)", "@nth-child(2n of card, icon)", "@is(card, icon)"])(
    "accepts the arguments of %s",
    (selector) => {
      expect(diagnose(style(selector)).filter((d) => / 2 `@/.test(d))).toEqual([]);
    },
  );

  test("leaves layout event handlers alone", () => {
    expect(
      unknownStateWarnings(
        "layout main {\n  button @click={ print(1) }\n  button @chnage=score\n}\n",
      ),
    ).toEqual([]);
  });
});
