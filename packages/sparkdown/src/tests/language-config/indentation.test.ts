import { describe, expect, it } from "vitest";
import LANGUAGE_CONFIG from "../../../language/sparkdown.language-config.json";

/**
 * Regression coverage for the indentation rules in
 * `definitions/yaml/sparkdown.language-config.yaml`.
 *
 * These regexes are generated into this JSON and consumed by two hosts (the
 * web editor via `codemirror-vscode-language`, and VS Code directly). They
 * have broken twice — #253 (`]]` dedenting) and #259 (`[[` over-indenting) —
 * and both times the cause was mis-attributed, because sparkdown's doubled
 * display directives (`[[image]]`, `((sound))`) look like Luau brackets to a
 * pattern that only inspects one character.
 *
 * The rules are plain regexes, so pinning them costs nothing and catches the
 * next doubled-bracket regression at the source rather than in the editor.
 */

const { indentationRules, onEnterRules } = LANGUAGE_CONFIG as {
  indentationRules: {
    increaseIndentPattern: string;
    decreaseIndentPattern: string;
  };
  onEnterRules: {
    beforeText: string;
    afterText?: string;
    previousLineText?: string;
    action: { indent: string; appendText?: string };
  }[];
};

const increase = new RegExp(indentationRules.increaseIndentPattern);
const decrease = new RegExp(indentationRules.decreaseIndentPattern);

/**
 * Every onEnterRule keyed off a line ending in an opening bracket.
 *
 * Selected by the bracket the rule ends with, deliberately NOT by the guard
 * prefix — selecting on the guard would make these tests vacuous the moment
 * the guard is removed, which is exactly the regression they exist to catch.
 */
const bracketEnterRules = onEnterRules
  .filter((r) => /\\[[(]\\s\*\$$/.test(r.beforeText))
  .map((r) => new RegExp(r.beforeText, "u"));

describe("increaseIndentPattern", () => {
  it("does not indent after a doubled display-directive opener (#259)", () => {
    // `\[\s*$` matches the SECOND `[` of `[[` unless guarded.
    expect(increase.test("  [[")).toBe(false);
    expect(increase.test("  ((")).toBe(false);
    expect(increase.test("BUNNY:\n  [[".split("\n")[1]!)).toBe(false);
  });

  it("still indents after a single opening bracket", () => {
    expect(increase.test("  [")).toBe(true);
    expect(increase.test("  (")).toBe(true);
    expect(increase.test("  foo(")).toBe(true);
    expect(increase.test("  x = arr[")).toBe(true);
  });

  it("leaves braces unguarded, matching the decrease side", () => {
    expect(increase.test("local t = {")).toBe(true);
    expect(increase.test("  local t = {{")).toBe(true);
  });

  it("still indents after block-opening keywords", () => {
    for (const line of [
      "  if a then",
      "  for i = 1, 3 do",
      "  repeat",
      "  else",
      "  function f(x)",
      "  define",
    ]) {
      expect(increase.test(line), line).toBe(true);
    }
  });

  it("does not fire inside a line comment", () => {
    expect(increase.test("  -- [")).toBe(false);
  });
});

describe("decreaseIndentPattern", () => {
  it("does not dedent on a doubled display-directive closer (#253)", () => {
    expect(decrease.test("  ]]")).toBe(false);
    expect(decrease.test("  ))")).toBe(false);
  });

  it("still dedents on a single closing bracket", () => {
    expect(decrease.test("  )")).toBe(true);
    expect(decrease.test("  ]")).toBe(true);
    expect(decrease.test("  }")).toBe(true);
  });

  it("still dedents on block-closing keywords", () => {
    for (const line of ["  end", "  until x", "  else", "  elseif a then"]) {
      expect(decrease.test(line), line).toBe(true);
    }
  });
});

describe("bracket onEnterRules", () => {
  // These run from a Prec.high Enter keymap, ahead of the indent service, so
  // they need the same doubled-bracket guards independently — narrowing only
  // one of the two sources leaves the symptom unchanged, which is what made
  // #259 hard to attribute.
  it("guards both bracket kinds", () => {
    expect(bracketEnterRules).toHaveLength(4); // [ and ( × indentOutdent/indent
  });

  it("does not fire on a doubled opener", () => {
    for (const re of bracketEnterRules) {
      expect(re.test("  [["), String(re)).toBe(false);
      expect(re.test("  (("), String(re)).toBe(false);
    }
  });

  it("still fires on a single opener", () => {
    const matchesSingle = (s: string) =>
      bracketEnterRules.some((re) => re.test(s));
    expect(matchesSingle("  [")).toBe(true);
    expect(matchesSingle("  (")).toBe(true);
    expect(matchesSingle("  foo(")).toBe(true);
  });
});

/**
 * The rule Enter applies, picked as both hosts pick it (VS Code, and the web
 * editor's `vscodeOnEnterRules`): the first rule whose `beforeText` matches
 * the line before the cursor, whose `afterText` matches the line after it and
 * whose `previousLineText` matches the line above.
 */
const enterRuleFor = (previousLine: string, before: string, after: string) =>
  onEnterRules.find(
    (rule) =>
      new RegExp(rule.beforeText, "u").test(before) &&
      (!rule.afterText || new RegExp(rule.afterText, "u").test(after)) &&
      (!rule.previousLineText ||
        new RegExp(rule.previousLineText, "u").test(previousLine)),
  );

// `indentOutdent` puts the cursor on a new line one level deeper than the
// cursor's line and moves the text after the cursor, its `}`, to a line below
// at the cursor line's indentation; no text is appended.
describe("Enter between `{` and `}` in a brace body (#1228)", () => {
  const cases: [string, string, string, string][] = [
    // [body, line above, line before the cursor, line after it]
    ["layout", "layout hud with", "  column.panel {", "}"],
    ["layout", "  column.panel {", "    row.item {", "}"],
    ["layout", "  column.panel {", "    row.item #gap=4 {", " }"],
    ["layout", "  column {", '    button.primary "Save" @click=save() {', "}"],
    ["layout", "  column {", '    foldout "Level {n}" {', "}"],
    ["layout", "  column {", "    row = {", "}"],
    ["layout", "  column {", '    row { text "a"; text "b" }; row {', "}"],
    ["layout", "  if open then", "    row.busy {", "}"],
    ["style", "style card with", "  > text {", "}"],
    ["style", "style card with", "  &.wide {", " }"],
    ["style", "style card with", "  @hovered, @pressed {", "}"],
    ["style", "style card with", "  &[data-label='a;b'] {", "}"],
    ["style", "  @hovered {", "    > text {", "}"],
  ];

  it.each(cases)("%s: `%s` / `%s|%s`", (_body, previousLine, before, after) => {
    const rule = enterRuleFor(previousLine, before, after);
    expect(rule?.action.indent).toBe("indentOutdent");
    expect(rule?.action.appendText ?? "").toBe("");
  });

  it("a `- {` item line still continues the list instead", () => {
    // The one earlier rule a `{` line can meet, kept for the indented form.
    expect(enterRuleFor("  keyframes:", "    - {", "}")?.action).toEqual({
      indent: "indentOutdent",
      appendText: "\t- ",
    });
  });
});
