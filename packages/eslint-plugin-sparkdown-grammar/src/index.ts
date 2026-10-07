// ESLint plugin: enforces sparkdown-grammar YAML conventions.
// See packages/sparkdown/docs/compiler/GRAMMAR.md for the conventions
// these rules encode. The plugin runs over the YAML files via the
// `yaml-eslint-parser` (provided by `eslint-plugin-yml`).

import { readFileSync } from "node:fs";
import tagNameSymmetry from "./rules/tag-name-symmetry.ts";
import parseTagValid from "./rules/parse-tag-valid.ts";
import noRawWhitespaceClass from "./rules/no-raw-whitespace-class.ts";
import noHandwrittenAlternation from "./rules/no-handwritten-alternation.ts";
import capturingVarNaming from "./rules/capturing-var-naming.ts";
import noZeroWidthInPatterns from "./rules/no-zero-width-in-patterns.ts";
import noNewlineInLookaround from "./rules/no-newline-in-lookaround.ts";
import lookaroundNeedsRivalComment from "./rules/lookaround-needs-rival-comment.ts";
import noUnreferencedRule from "./rules/no-unreferenced-rule.ts";
import noUnreferencedVariable from "./rules/no-unreferenced-variable.ts";
import noRepeatedFragment from "./rules/no-repeated-fragment.ts";
import nameLongPatternParts from "./rules/name-long-pattern-parts.ts";
import scopedEndHasBailout from "./rules/scoped-end-has-bailout.ts";
import noLineCrossingClass from "./rules/no-line-crossing-class.ts";

// Rules whose existing findings are baselined, keyed by rule name, then by
// owner (`repository.Name`, `variables.NAME` or `patterns`) with the
// number of findings allowed. Rewritten by `src/baseline-cli.ts --write`.
export const BASELINE_FILE = new URL("../baseline.json", import.meta.url);
export const BASELINED_RULES = [
  "tag-name-symmetry",
  "lookaround-needs-rival-comment",
  "no-unreferenced-rule",
  "no-unreferenced-variable",
  "no-repeated-fragment",
  "name-long-pattern-parts",
  "scoped-end-has-bailout",
] as const;

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Record<
  string,
  Record<string, number> | undefined
>;

const plugin = {
  meta: {
    name: "@impower/eslint-plugin-sparkdown-grammar",
    version: "0.0.1",
  },
  rules: {
    "tag-name-symmetry": tagNameSymmetry,
    "parse-tag-valid": parseTagValid,
    "no-raw-whitespace-class": noRawWhitespaceClass,
    "no-handwritten-alternation": noHandwrittenAlternation,
    "capturing-var-naming": capturingVarNaming,
    "no-zero-width-in-patterns": noZeroWidthInPatterns,
    "no-newline-in-lookaround": noNewlineInLookaround,
    "lookaround-needs-rival-comment": lookaroundNeedsRivalComment,
    "no-unreferenced-rule": noUnreferencedRule,
    "no-unreferenced-variable": noUnreferencedVariable,
    "no-repeated-fragment": noRepeatedFragment,
    "name-long-pattern-parts": nameLongPatternParts,
    "scoped-end-has-bailout": scopedEndHasBailout,
    "no-line-crossing-class": noLineCrossingClass,
  },
  configs: {} as Record<string, unknown>,
};

const withBaseline = (name: (typeof BASELINED_RULES)[number]) => [
  "error",
  { baseline: baseline[name] ?? {} },
];

plugin.configs["recommended"] = {
  plugins: { "sparkdown-grammar": plugin },
  rules: {
    "sparkdown-grammar/tag-name-symmetry": withBaseline("tag-name-symmetry"),
    "sparkdown-grammar/parse-tag-valid": "error",
    "sparkdown-grammar/no-raw-whitespace-class": "error",
    "sparkdown-grammar/no-handwritten-alternation": "warn",
    "sparkdown-grammar/capturing-var-naming": "error",
    "sparkdown-grammar/no-zero-width-in-patterns": "error",
    "sparkdown-grammar/no-newline-in-lookaround": "error",
    "sparkdown-grammar/lookaround-needs-rival-comment": withBaseline(
      "lookaround-needs-rival-comment",
    ),
    "sparkdown-grammar/no-unreferenced-rule": withBaseline("no-unreferenced-rule"),
    "sparkdown-grammar/no-unreferenced-variable": withBaseline(
      "no-unreferenced-variable",
    ),
    "sparkdown-grammar/no-repeated-fragment": withBaseline("no-repeated-fragment"),
    "sparkdown-grammar/name-long-pattern-parts": withBaseline(
      "name-long-pattern-parts",
    ),
    "sparkdown-grammar/scoped-end-has-bailout": withBaseline(
      "scoped-end-has-bailout",
    ),
    "sparkdown-grammar/no-line-crossing-class": "error",
  },
};

export default plugin;
