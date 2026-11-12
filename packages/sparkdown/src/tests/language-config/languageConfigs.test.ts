import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE_CONFIGS,
  sparkdownLanguageFor,
} from "../../compiler/utils/sparkdownLanguageFor";

const EXTENSION_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
  "vscode-sparkdown",
);

const MANIFEST = JSON.parse(
  readFileSync(join(EXTENSION_DIR, "package.json"), "utf8"),
) as {
  contributes: {
    languages: { id: string; configuration: string }[];
    grammars: { language: string; embeddedLanguages?: Record<string, string> }[];
  };
};

const withoutStamp = (config: Record<string, unknown>) => {
  const { _generated_, ...rest } = config;
  return rest;
};

describe("the web editor's language data matches the extension manifest", () => {
  it("maps the same scopes to the same languages", () => {
    const grammar = MANIFEST.contributes.grammars.find(
      (g) => g.language === "sparkdown",
    );
    expect(SPARKDOWN_EMBEDDED_LANGUAGES).toEqual(grammar?.embeddedLanguages);
  });

  it("gives each manifest language the config file it names", () => {
    const configs = SPARKDOWN_LANGUAGE_CONFIGS as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(configs).sort()).toEqual(
      MANIFEST.contributes.languages.map((l) => l.id).sort(),
    );
    for (const { id, configuration } of MANIFEST.contributes.languages) {
      expect(
        withoutStamp(
          JSON.parse(readFileSync(join(EXTENSION_DIR, configuration), "utf8")),
        ),
        id,
      ).toEqual(withoutStamp(configs[id]!));
    }
  });
});

describe("the story and Luau configs", () => {
  it("comment story text with // and /* */ and Luau code with -- and --[[ ]]", () => {
    expect(SPARKDOWN_LANGUAGE_CONFIGS.sparkdown.comments).toEqual({
      lineComment: "//",
      blockComment: ["/*", "*/"],
    });
    expect(SPARKDOWN_LANGUAGE_CONFIGS["sparkdown-luau"].comments).toEqual({
      lineComment: "--",
      blockComment: ["--[[", "]]"],
    });
  });

  it("close /* with */ in story text, with no string condition", () => {
    expect(SPARKDOWN_LANGUAGE_CONFIGS.sparkdown.autoClosingPairs).toContainEqual({
      open: "/*",
      close: "*/",
    });
  });

});

interface DividedConfig {
  autoClosingPairs: { open: string; close: string }[];
  surroundingPairs: string[][];
  onEnterRules: { beforeText: string; afterText?: string }[];
  indentationRules: Record<string, string>;
  [key: string]: unknown;
}

const STORY = SPARKDOWN_LANGUAGE_CONFIGS.sparkdown as unknown as DividedConfig;
const LUAU = SPARKDOWN_LANGUAGE_CONFIGS["sparkdown-luau"] as unknown as DividedConfig;

type Owner = "story" | "luau" | "both";

const holds = (owner: Owner, file: "story" | "luau") =>
  owner === "both" || owner === file;

describe("the story and Luau configs divide their entries by the syntax each serves (#2019)", () => {
  it("hold the same entries apart from comments, pairs, Enter rules and indentation", () => {
    const shared = (config: DividedConfig) => {
      const {
        comments,
        autoClosingPairs,
        surroundingPairs,
        onEnterRules,
        indentationRules,
        ...rest
      } = withoutStamp(config) as DividedConfig;
      return rest;
    };
    expect(Object.keys(withoutStamp(STORY)).sort()).toEqual(
      Object.keys(withoutStamp(LUAU)).sort(),
    );
    expect(shared(STORY)).toEqual(shared(LUAU));
  });

  const PAIRS: [open: string, close: string, owner: Owner][] = [
    ["{", "}", "both"],
    ["[", "]", "both"],
    ["(", ")", "both"],
    ['"', '"', "both"],
    ["`", "`", "both"],
    ["~~", "~~", "story"],
    ["::", "::", "story"],
    ["/*", "*/", "story"],
    ["--[[", "]]", "luau"],
    ["--[=[", "]=]", "luau"],
    ["--[==[", "]==]", "luau"],
  ];

  it("put each auto-closing pair in the file it serves, and no other pair in either", () => {
    for (const [file, config] of [["story", STORY], ["luau", LUAU]] as const) {
      expect(
        config.autoClosingPairs.map(({ open, close }) => [open, close]),
        file,
      ).toEqual(
        PAIRS.filter(([, , owner]) => holds(owner, file)).map(([open, close]) => [
          open,
          close,
        ]),
      );
    }
  });

  const SURROUNDING: [open: string, close: string, owner: Owner][] = [
    ["{", "}", "both"],
    ["[", "]", "both"],
    ["(", ")", "both"],
    ["<", ">", "both"],
    ['"', '"', "both"],
    ["`", "`", "both"],
    ["--[[", "]]", "luau"],
  ];

  it("put each surrounding pair in the file it serves, and no other pair in either", () => {
    for (const [file, config] of [["story", STORY], ["luau", LUAU]] as const) {
      expect(config.surroundingPairs, file).toEqual(
        SURROUNDING.filter(([, , owner]) => holds(owner, file)).map(
          ([open, close]) => [open, close],
        ),
      );
    }
  });

  const ENTER: [name: string, before: string, after: string, owner: Owner][] = [
    ["brace", "  row {", "}", "both"],
    ["bracket before its close", "  x = [", "]", "both"],
    ["bracket", "  x = [", "", "both"],
    ["paren before its close", "  f(", ")", "both"],
    ["paren", "  f(", "", "both"],
    ["plus bullet", "  + Go left", "", "story"],
    ["star bullet", "  * Go left", "", "story"],
    ["dash bullet", "  - Go left", "", "story"],
    ["chained divert", "  a -> b -> c", "", "story"],
    ["divert", "  -> next", "", "story"],
    ["label", "  RAFFLES:", "", "story"],
    ["define header", "define Hero with", "end", "story"],
    ["define header at its line's end", "define companion as character with", "", "story"],
    ["function header at its line's end", "local function f(a)", "", "story"],
    ["block comment before its close", "  --[[ note", "]]", "luau"],
    ["block comment", "  --[[ note", "", "luau"],
    ["function", "  function f()", "end", "luau"],
    ["anonymous function header at its line's end", "greet = function()", "", "luau"],
    ["then", "  if a then", "end", "luau"],
    ["do", "  for i = 1, 3 do", "end", "luau"],
    ["else", "  else", "end", "luau"],
    ["repeat", "  repeat", "until x", "luau"],
    ["doc comment", "  --- doc", "", "luau"],
  ];

  const ruleFor = (config: DividedConfig, before: string, after: string) =>
    config.onEnterRules.find(
      (rule) =>
        new RegExp(rule.beforeText, "u").test(before) &&
        (rule.afterText === undefined ||
          new RegExp(rule.afterText, "u").test(after)),
    );

  it.each(ENTER)("keep the %s Enter rule in the file it serves", (_name, before, after, owner) => {
    const story = ruleFor(STORY, before, after);
    const luau = ruleFor(LUAU, before, after);
    expect(story !== undefined, "story").toBe(holds(owner, "story"));
    expect(luau !== undefined, "luau").toBe(holds(owner, "luau"));
    if (owner === "both") {
      expect(story).toEqual(luau);
    }
  });

  it("hold no Enter rule outside that list", () => {
    const listed = (config: DividedConfig, file: "story" | "luau") =>
      new Set(
        ENTER.filter(([, , , owner]) => holds(owner, file)).map(
          ([, before, after]) => ruleFor(config, before, after),
        ),
      );
    expect(listed(STORY, "story").size).toBe(STORY.onEnterRules.length);
    expect(listed(LUAU, "luau").size).toBe(LUAU.onEnterRules.length);
  });

  it("share every indentation rule but the increase pattern, which is the story file's own", () => {
    const { increaseIndentPattern: storyIncrease, ...storyRest } =
      STORY.indentationRules;
    const { increaseIndentPattern: luauIncrease, ...luauRest } =
      LUAU.indentationRules;
    expect(storyRest).toEqual(luauRest);
    expect(storyIncrease).not.toEqual(luauIncrease);
    const story = new RegExp(storyIncrease!);
    const luau = new RegExp(luauIncrease!);
    expect(story.test("  What should I do")).toBe(false);
    expect(luau.test("  What should I do")).toBe(true);
  });
});

describe("sparkdownLanguageFor", () => {
  it.each([
    ["file:///main.sd", "sparkdown"],
    ["file:///lib/module.luau", "sparkdown-luau"],
    [undefined, "sparkdown"],
  ])("reads %s as %s", (uri, language) => {
    expect(sparkdownLanguageFor(uri)).toBe(language);
  });
});
