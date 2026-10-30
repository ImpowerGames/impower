import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import onig from "vscode-oniguruma";
import vstm from "vscode-textmate";
import { describe, expect, it } from "vitest";

const { OnigScanner, OnigString, loadWASM } = onig;
const { Registry, parseRawGrammar, INITIAL } = vstm;

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(EXTENSION_ROOT, "package.json"), "utf8"),
);

const VSCODE_DEFAULT = { other: "on", comments: "off", strings: "off" };

const SETTING_KEY: Record<number, "other" | "comments" | "strings"> = {
  0: "other",
  1: "comments",
  2: "strings",
  3: "other",
};
const TOKEN_TYPE: Record<string, number> = { other: 0, comment: 1, string: 2 };
const tokenTypeOf = (metadata: number) => (metadata >>> 8) & 3;

function effectiveQuickSuggestions() {
  const configured =
    manifest.contributes.configurationDefaults["[sparkdown]"]?.[
      "editor.quickSuggestions"
    ];
  if (typeof configured === "boolean") {
    const value = configured ? "on" : "off";
    return { other: value, comments: value, strings: value };
  }
  return { ...VSCODE_DEFAULT, ...configured };
}

async function loadGrammar() {
  const require = createRequire(import.meta.url);
  await loadWASM(
    readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")),
  );
  const contribution = manifest.contributes.grammars.find(
    (g: { language?: string }) => g.language === "sparkdown",
  );
  const grammarPath = join(EXTENSION_ROOT, contribution.path);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
      createOnigString: (s: string) => new OnigString(s),
    }),
    loadGrammar: async (scope: string) =>
      scope === contribution.scopeName
        ? parseRawGrammar(readFileSync(grammarPath, "utf8"), grammarPath)
        : null,
  });
  const tokenTypes = Object.fromEntries(
    Object.entries(contribution.tokenTypes ?? {}).map(([selector, type]) => [
      selector,
      TOKEN_TYPE[type as string],
    ]),
  );
  const grammar = await registry.loadGrammarWithConfiguration(
    contribution.scopeName,
    1,
    { tokenTypes } as Parameters<
      typeof registry.loadGrammarWithConfiguration
    >[2],
  );
  if (!grammar) throw new Error("sparkdown grammar did not load");
  return grammar;
}

async function settingKeyAt(source: string, word: string) {
  const grammar = await loadGrammar();
  let state = INITIAL;
  for (const line of source.split("\n")) {
    const { tokens, ruleStack } = grammar.tokenizeLine2(line, state);
    const index = line.indexOf(word);
    if (index >= 0) {
      let metadata = tokens[1]!;
      for (let i = 0; i < tokens.length; i += 2) {
        if (tokens[i]! <= index) metadata = tokens[i + 1]!;
      }
      return SETTING_KEY[tokenTypeOf(metadata)]!;
    }
    state = ruleStack;
  }
  throw new Error(`"${word}" is not in the source`);
}

const CASES = [
  {
    name: "a portrait name in a dialogue block",
    word: "raffles_incredulous",
    source: [
      "scene START",
      "",
      "  RAFFLES:",
      "    [[raffles_incredulous]]",
      "    I really think we should--",
      "end",
    ].join("\n"),
  },
  {
    name: "a portrait name before a filter in a dialogue block",
    word: "raffles_incredulous",
    source: [
      "scene START",
      "",
      "  RAFFLES:",
      "    [[raffles_incredulous:bandage]]",
      "    Right.",
      "end",
    ].join("\n"),
  },
  {
    name: "a word started at the beginning of a scene body line",
    word: "bra",
    source: ["scene START", "", "  Hello there.", "  bra", "end"].join("\n"),
  },
];

describe("typing an identifier opens the completion list (#1829)", () => {
  for (const c of CASES) {
    it(`enables quick suggestions for ${c.name}`, async () => {
      const key = await settingKeyAt(c.source, c.word);
      expect({ key, value: effectiveQuickSuggestions()[key] }).toEqual({
        key,
        value: "on",
      });
    });
  }

  it("keeps quick suggestions off in comments", () => {
    expect(effectiveQuickSuggestions().comments).toBe("off");
  });
});
