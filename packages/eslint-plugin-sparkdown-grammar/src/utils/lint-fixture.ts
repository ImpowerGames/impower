import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { Linter } from "eslint";
import yml from "eslint-plugin-yml";
import plugin, { GRAMMAR_SOURCES } from "../index.ts";
import { SETTINGS_KEY } from "./grammar-index.ts";

const FILE = "grammar.yaml";

export type GrammarSource = keyof typeof GRAMMAR_SOURCES;

export function readGrammarSource(source: GrammarSource): string {
  return readFileSync(GRAMMAR_SOURCES[source], "utf8");
}

export function lintRules(
  source: string,
  rules: Linter.RulesRecord,
  as?: GrammarSource,
): Linter.LintMessage[] {
  const file = as === undefined ? FILE : GRAMMAR_SOURCES[as];
  const linter = new Linter({
    configType: "flat",
    ...(as === undefined ? {} : { cwd: dirname(file) }),
  });
  const messages = linter.verify(
    source,
    [
      ...(yml.configs["flat/base"] as Linter.Config[]),
      {
        files: [basename(file)],
        plugins: { "sparkdown-grammar": plugin as never },
        settings: as === undefined ? {} : { [SETTINGS_KEY]: GRAMMAR_SOURCES },
        rules,
      },
    ],
    file,
  );
  const fatal = messages.find((m) => m.fatal);
  if (fatal) throw new Error(`fixture did not parse: ${fatal.message}`);
  return messages;
}

export function lintRule(
  source: string,
  rule: string,
  baseline: Record<string, number> = {},
  as?: GrammarSource,
): Linter.LintMessage[] {
  return lintRules(
    source,
    { [`sparkdown-grammar/${rule}`]: ["error", { baseline }] },
    as,
  );
}

export function grammar(parts: {
  variables?: string;
  patterns?: string;
  repository?: string;
}): string {
  const indent = (text: string) =>
    text
      .split("\n")
      .map((line) => (line ? `  ${line}` : line))
      .join("\n");
  let out = "";
  if (parts.variables) out += `variables:\n${indent(parts.variables)}\n`;
  out += parts.patterns
    ? `patterns:\n${indent(parts.patterns)}\n`
    : "patterns: []\n";
  if (parts.repository) out += `repository:\n${indent(parts.repository)}\n`;
  return out;
}
