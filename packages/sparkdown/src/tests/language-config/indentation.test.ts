import { describe, expect, it } from "vitest";
import LUAU_LANGUAGE_CONFIG from "../../../language/sparkdown-luau.language-config.json";
import STORY_LANGUAGE_CONFIG from "../../../language/sparkdown.language-config.json";

describe.each([
  ["sparkdown.language-config.json", STORY_LANGUAGE_CONFIG],
  ["sparkdown-luau.language-config.json", LUAU_LANGUAGE_CONFIG],
])("%s", (_file, LANGUAGE_CONFIG) => {
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
        "local f = function()",
        '  if url == "https://example.com" then',
        '  if s == "a--b" then',
        "  if s == 'a--b' then",
        '  for _, u in ipairs({ "//a", "--b" }) do',
        "  if url == `https://example.com` then",
        "  if s == `a--b` then",
        "  if s == [[a--b]] then",
        "  if s == [=[a]]--b]=] then",
        "  if s == [==[a//b]==] then",
        "  if s == `{`a--b`}` then",
        '  if s == `{"a}--"}` then',
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
});

interface LanguageConfig {
  autoClosingPairs: { open: string; close: string }[];
  surroundingPairs: string[][];
  indentationRules: { increaseIndentPattern: string };
  onEnterRules: {
    beforeText: string;
    afterText?: string;
    action: { indent: string; appendText?: string };
  }[];
}

const STORY = STORY_LANGUAGE_CONFIG as LanguageConfig;
const LUAU = LUAU_LANGUAGE_CONFIG as LanguageConfig;

const opens = (config: LanguageConfig) =>
  config.autoClosingPairs.map((pair) => pair.open);

const enterRuleMatching = (config: LanguageConfig, before: string) =>
  config.onEnterRules.find((rule) =>
    new RegExp(rule.beforeText, "u").test(before),
  );

describe("the division of entries between the two files", () => {
  it("gives the story file the story pairs and no Luau comment pairs", () => {
    expect(opens(STORY)).toEqual(
      expect.arrayContaining(["{", "[", "(", '"', "`", "~~", "::", "/*"]),
    );
    for (const open of ["--[[", "--[=[", "--[==["]) {
      expect(opens(STORY), open).not.toContain(open);
    }
    expect(STORY.surroundingPairs.map(([open]) => open)).not.toContain("--[[");
  });

  it("gives the Luau file the Luau comment pairs and no story pairs", () => {
    expect(opens(LUAU)).toEqual(
      expect.arrayContaining(["{", "[", "(", '"', "`", "--[[", "--[=[", "--[==["]),
    );
    for (const open of ["~~", "::", "/*"]) {
      expect(opens(LUAU), open).not.toContain(open);
    }
    expect(LUAU.surroundingPairs).toContainEqual(["--[[", "]]"]);
  });

  it("keeps the story Enter rules out of the Luau file", () => {
    for (const before of ["  + Go left", "  * item", "  - item", "  -> next", "  RAFFLES:", "define Hero with"]) {
      expect(enterRuleMatching(STORY, before), before).toBeDefined();
      expect(enterRuleMatching(LUAU, before), before).toBeUndefined();
    }
  });

  it("keeps the Luau Enter rules out of the story file", () => {
    for (const before of ["  --[[ note", "  --- doc", "  function f()", "  if a then", "  for i = 1, 3 do", "  else", "  repeat"]) {
      expect(enterRuleMatching(LUAU, before), before).toBeDefined();
      expect(enterRuleMatching(STORY, before), before).toBeUndefined();
    }
  });
});

describe("the story increaseIndentPattern", () => {
  const increase = new RegExp(STORY.indentationRules.increaseIndentPattern);

  it("does not indent after prose that ends like a block header", () => {
    for (const line of [
      "What should I do",
      "And then",
      "Or else",
      "She left the scene",
      "We reached a new branch",
      "  I had to repeat",
      "  She had a function to attend",
    ]) {
      expect(increase.test(line), line).toBe(false);
    }
  });

  it("indents after a block header", () => {
    for (const line of [
      "if x then",
      "  elseif y then",
      "for i = 1, 3 do",
      "  while busy do",
      "else",
      "do",
      "repeat",
      "scene start()",
      "scene start(a, b)",
      "function f()",
      "local g = function(x)",
      "  if x then -- note",
      "  if x then // note",
    ]) {
      expect(increase.test(line), line).toBe(true);
    }
  });

  it("skips both comment forms", () => {
    for (const line of [
      "-- if x then",
      "// if x then",
      "  // scene start",
      "  note // [",
      "  if x then f() end",
      "function f() end",
    ]) {
      expect(increase.test(line), line).toBe(false);
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
      "scene заголовок",
      "branch side-path",
      "scene ending",
      "define end_state with",
      "  define",
    ]) {
      expect(increase.test(line), line).toBe(true);
    }
  });

  it("does not indent after a closed or non-header declaration line", () => {
    for (const line of [
      "define x with a = 1 end",
      "define = 1, 2",
      "define Hero, with",
      "scene a, b",
      "branch (x)",
      "define Hero with x",
      "scene end",
      "branch if",
      "define return with",
      "define Hero as end with",
      "-- scene name",
      "The scene changes",
      'x = "scene name"',
    ]) {
      expect(increase.test(line), line).toBe(false);
    }
  });
});

describe("the story define onEnterRule", () => {
  const defineRule = STORY.onEnterRules.find(
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
    expect(before.test("define Hero, with")).toBe(false);
    expect(before.test("define end with")).toBe(false);
  });
});
