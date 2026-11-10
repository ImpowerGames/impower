import { describe, expect, it } from "vitest";
import LANGUAGE_CONFIG from "../../../language/sparkdown.language-config.json";

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

const bracketEnterRules = onEnterRules
  .filter((r) => /\\[[(]\\s\*\$$/.test(r.beforeText))
  .map((r) => new RegExp(r.beforeText, "u"));

describe("increaseIndentPattern", () => {
  it("does not indent after a doubled display-directive opener (#259)", () => {
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

  it("indents after a named declaration header", () => {
    for (const line of [
      "scene name",
      "  scene start",
      "scene name -- comment",
      "branch name",
      "define name",
      "define Hero with",
      "define companion as character with",
      "define Hero with -- comment",
    ]) {
      expect(increase.test(line), line).toBe(true);
    }
  });

  it("does not indent after a closed or non-header declaration line", () => {
    for (const line of [
      "define x with a = 1 end",
      "define = 1, 2",
      "-- scene name",
      "The scene changes",
      'x = "scene name"',
    ]) {
      expect(increase.test(line), line).toBe(false);
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
  it("guards both bracket kinds", () => {
    expect(bracketEnterRules).toHaveLength(4);
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

const enterRuleFor = (previousLine: string, before: string, after: string) =>
  onEnterRules.find(
    (rule) =>
      new RegExp(rule.beforeText, "u").test(before) &&
      (!rule.afterText || new RegExp(rule.afterText, "u").test(after)) &&
      (!rule.previousLineText ||
        new RegExp(rule.previousLineText, "u").test(previousLine)),
  );

describe("Enter between `{` and `}` in a brace body (#1228)", () => {
  const cases: [string, string, string, string][] = [
    ["layout", "layout hud {", "  column.panel {", "}"],
    ["layout", "  column.panel {", "    row.item {", "}"],
    ["layout", "  column.panel {", "    row.item #gap=4 {", " }"],
    ["layout", "  column {", '    button.primary "Save" @click=save() {', "}"],
    ["layout", "  column {", '    foldout "Level {n}" {', "}"],
    ["layout", "  column {", "    row = {", "}"],
    ["layout", "  column {", '    row { text "a"; text "b" }; row {', "}"],
    ["layout", "  if open then", "    row.busy {", "}"],
    ["style", "style card {", "  > text {", "}"],
    ["style", "style card {", "  &.wide {", " }"],
    ["style", "style card {", "  @hovered, @pressed {", "}"],
    ["style", "style card {", "  &[data-label='a;b'] {", "}"],
    ["style", "  @hovered {", "    > text {", "}"],
  ];

  it.each(cases)("%s: `%s` / `%s|%s`", (_body, previousLine, before, after) => {
    const rule = enterRuleFor(previousLine, before, after);
    expect(rule?.action.indent).toBe("indentOutdent");
    expect(rule?.action.appendText ?? "").toBe("");
  });

});

describe("define onEnterRule", () => {
  const defineRule = onEnterRules.find(
    (r) => r.action.indent === "indentOutdent" && /define/.test(r.beforeText),
  )!;
  const before = new RegExp(defineRule.beforeText, "u");
  const after = new RegExp(defineRule.afterText!, "u");

  it("splits a named define header from its end", () => {
    for (const line of [
      "define",
      "define Hero with",
      "  define companion as character with",
      "define Hero",
    ]) {
      expect(before.test(line), line).toBe(true);
    }
    expect(after.test("end")).toBe(true);
  });

  it("ignores a define closed on its own line", () => {
    expect(before.test("define x with a = 1 end")).toBe(false);
  });
});
