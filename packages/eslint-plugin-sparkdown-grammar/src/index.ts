// ESLint plugin: enforces sparkdown-grammar YAML conventions.
// See packages/sparkdown/GRAMMAR.md for the conventions these rules
// encode. The plugin runs over the YAML files via the
// `yaml-eslint-parser` (provided by `eslint-plugin-yml`).

import tagNameSymmetry from "./rules/tag-name-symmetry.ts";
import parseTagValid from "./rules/parse-tag-valid.ts";
import noRawWhitespaceClass from "./rules/no-raw-whitespace-class.ts";
import noHandwrittenAlternation from "./rules/no-handwritten-alternation.ts";
import capturingVarNaming from "./rules/capturing-var-naming.ts";
import noZeroWidthInPatterns from "./rules/no-zero-width-in-patterns.ts";
import noNewlineInLookaround from "./rules/no-newline-in-lookaround.ts";

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
  },
  configs: {} as Record<string, unknown>,
};

plugin.configs["recommended"] = {
  plugins: { "sparkdown-grammar": plugin },
  rules: {
    "sparkdown-grammar/tag-name-symmetry": "error",
    "sparkdown-grammar/parse-tag-valid": "error",
    "sparkdown-grammar/no-raw-whitespace-class": "error",
    "sparkdown-grammar/no-handwritten-alternation": "warn",
    "sparkdown-grammar/capturing-var-naming": "error",
    "sparkdown-grammar/no-zero-width-in-patterns": "error",
    "sparkdown-grammar/no-newline-in-lookaround": "error",
  },
};

export default plugin;
