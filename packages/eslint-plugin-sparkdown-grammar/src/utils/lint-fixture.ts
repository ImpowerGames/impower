// Test helper: lints a grammar YAML string with one plugin rule (or a
// whole rule set) through ESLint's `Linter` and the repo's YAML parser.

import { Linter } from "eslint";
import yml from "eslint-plugin-yml";
import plugin from "../index.ts";

const FILE = "grammar.yaml";

export function lintRules(
  source: string,
  rules: Linter.RulesRecord,
): Linter.LintMessage[] {
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    source,
    [
      ...(yml.configs["flat/base"] as Linter.Config[]),
      {
        files: [FILE],
        plugins: { "sparkdown-grammar": plugin as never },
        rules,
      },
    ],
    FILE,
  );
  const fatal = messages.find((m) => m.fatal);
  if (fatal) throw new Error(`fixture did not parse: ${fatal.message}`);
  return messages;
}

export function lintRule(
  source: string,
  rule: string,
  baseline: Record<string, number> = {},
): Linter.LintMessage[] {
  return lintRules(source, {
    [`sparkdown-grammar/${rule}`]: ["error", { baseline }],
  });
}

// A grammar document from its parts, each given without indentation
// beyond its own nesting (two spaces are added under each key).
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
