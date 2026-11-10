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

const withoutComments = (config: Record<string, unknown>) => {
  const { comments, ...rest } = withoutStamp(config);
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
  it("comment story text with // and Luau code with -- and --[[ ]]", () => {
    expect(SPARKDOWN_LANGUAGE_CONFIGS.sparkdown.comments).toEqual({
      lineComment: "//",
    });
    expect(SPARKDOWN_LANGUAGE_CONFIGS["sparkdown-luau"].comments).toEqual({
      lineComment: "--",
      blockComment: ["--[[", "]]"],
    });
  });

  it("differ only in their comment markers", () => {
    expect(withoutComments(SPARKDOWN_LANGUAGE_CONFIGS.sparkdown)).toEqual(
      withoutComments(SPARKDOWN_LANGUAGE_CONFIGS["sparkdown-luau"]),
    );
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
